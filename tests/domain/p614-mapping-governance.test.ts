/**
 * P61.4 — scientific mapping governance and exception recovery for the seven held Alex Morgan series
 * (synthetic test data only; not clinical, scientific or human acceptance). Activated mappings are simulated
 * ONLY by a test-key-signed demo snapshot; no Researcher approval or Ground Medical activation was recorded.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { loadInstalledDemoCatalogs, getSyntheticDemoCatalogs, resetSyntheticDemoCatalogsForTests, SYNTHETIC_DEMO_STORAGE_KEY } from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { signSyntheticDemoSnapshot, type SignedSyntheticDemoSnapshot, type SyntheticDemoEntry } from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import { generateTestSigningKey, BUNDLED_TRUSTED_KEYS, type TrustedKey } from "../../src/domain/health-intelligence/catalog-snapshot-signing";
import { extractCsvCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { DOCUMENT_TABLE_RULES_VERSION, documentLinesFromText } from "../../src/domain/health-intelligence/document-table-reconstruction";
import { rowExtractionEvidence } from "../../src/domain/health-intelligence/document-intake-review";
import { buildReviewedObservation, evaluateBulkImport, reconcileBulkImport, reconstructMultiDateDocument, reviewDateFields, rowDateEvidence, type P61ReviewRow } from "../../src/domain/health-intelligence/p61-bulk-import";
import { listUnifiedObservations, saveUnifiedObservation } from "../../src/domain/health-intelligence/observation-store";
import { InMemoryOfflineMissionStore } from "../../src/infrastructure/offline/store";
import { MAPPING_DECISIONS } from "../../src/domain/health-intelligence/p613-mapping-decision-register";
import {
  MAPPING_SAFEGUARDS,
  heldMappingViews,
  mappingGovernanceStatus,
  mappingRecovery,
  preflightMappingDecision,
  provisionalRuleViews,
  recordedDefinition,
  safeguardFor,
  validateSafeguards,
  type DecisionDraft,
  type GovernanceDemoEvent,
  type GovernanceInputs,
  type GovernanceTriageEvent,
  type MappingSafeguard,
} from "../../src/domain/health-intelligence/p614-mapping-governance";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
import { MITO_DEMO_MISSION_ID } from "../support/p59-fixtures";

const CSV = repoPath("fixtures", "synthetic", "p614", "Alex_Morgan_2026-11-12_13_Two_Day_RECONSTRUCTED_SYNTHETIC.csv");
const PDF = repoPath("fixtures", "synthetic", "p614", "MITOCHONDRIA_Alex_Morgan_2026-11-12_13_Two_Day_RECONSTRUCTED_SYNTHETIC.pdf");
const SNAPSHOTS = repoPath("tests", "fixtures", "p61-mito-demo-signed-snapshots.v372.json");
const SCOPE = { missionId: MITO_DEMO_MISSION_ID, crewMemberId: "crew-alex", provenance: "synthetic" as const };
const DATES = ["2026-11-12", "2026-11-13"];
const HELD: Record<string, [string, string]> = {
  "Chloride|mmol/L": ["97", "98"], "Bicarbonate|mmol/L": ["21", "22"], "Creatinine|mg/dL": ["1.28", "1.24"],
  "Urea nitrogen (BUN)|mg/dL": ["28", "27"], "Platelets|10^9/L": ["310", "318"], "Sleep duration|h": ["4.5", "4.7"], "HRV SDNN|ms": ["23", "25"],
};
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const v372 = JSON.parse(readFileSync(SNAPSHOTS, "utf8")) as Record<string, SignedSyntheticDemoSnapshot>;

async function install(signed: Record<string, unknown>, trustedKeys?: readonly TrustedKey[]) {
  resetSyntheticDemoCatalogsForTests();
  const storage = new Map([[SYNTHETIC_DEMO_STORAGE_KEY, JSON.stringify(signed)]]);
  return loadInstalledDemoCatalogs({ storage: { get: (k) => storage.get(k) ?? null, set: (k, v) => void storage.set(k, v) }, ...(trustedKeys ? { trustedKeys } : {}) });
}
/** Test-only: the v372 snapshot plus ACTIVE entries for the given held names (as if approved and activated). */
async function installWithActivated(labels: string[], status: "ACTIVE" | "REVOKED" = "ACTIVE") {
  const k = await generateTestSigningKey("test-p614-demo");
  const trusted: TrustedKey = { ...k.trusted, environment: "synthetic_demo" };
  const base = v372[MITO_DEMO_MISSION_ID]!.snapshot;
  const template = base.entries[0]!;
  const added: SyntheticDemoEntry[] = labels.map((key, i) => {
    const [label, unit] = key.split("|") as [string, string];
    const sg = safeguardFor(label, unit)!;
    return {
      ...template,
      demoId: `demo:ubt-a614000${i}`, termId: `ubt-a614000${i}`, displayName: sg.definitions[0]!.displayName, aliases: [label], unit,
      domain: sg.defaultDomain, status,
      revocation: status === "REVOKED" ? { revocationEventId: "00000000-0000-4000-8000-00000000000" + i, revokedAt: "2026-11-12T10:00:00Z", reason: "test revocation", demoCatalogVersion: 400 } : null,
    };
  });
  const snapshot = { ...base, demoCatalogVersion: 400, entries: [...base.entries, ...added] };
  const signed = await signSyntheticDemoSnapshot(snapshot, trusted.keyId, k.privateKey);
  expect(await install({ [MITO_DEMO_MISSION_ID]: signed }, [...BUNDLED_TRUSTED_KEYS, trusted])).toEqual({ loaded: 1, rejected: 0 });
}

type Row = P61ReviewRow & { sourceKind: "pdf_text" | "csv"; sourceLabel: string; documentName: string; excerpt: string; importedAt: string };
let n = 0;
const mk = (p: Record<string, unknown>, provenance: "synthetic" | "real" = "synthetic"): Row => {
  const base = { provenance, missionId: SCOPE.missionId, importedAt: "2026-11-12T18:00:00.000Z", ...p } as Omit<Row, "key" | "selected" | "classification">;
  return { ...base, key: `r${++n}`, selected: false, classification: classifyWithGovernedExtensions(base).classification } as Row;
};
function csvRows(provenance: "synthetic" | "real" = "synthetic") {
  const parsed = extractCsvCandidates(readFileSync(CSV, "utf8"), 1000, { keepUnparsedDates: true });
  return parsed.rows.map((c) => mk({ label: c.label, value: c.value, unit: c.unit, observedAt: c.observedAt, ...(c.datePrecision ? { datePrecision: c.datePrecision } : {}), examDate: rowDateEvidence(c), documentSha256: sha(CSV), excerpt: c.excerpt, sourceKind: "csv", sourceLabel: "CSV: two-day.csv", documentName: "two-day.csv", ...(c.sourceContext ? { sourceContext: c.sourceContext } : {}) }, provenance));
}
async function pdfRows() {
  const g = await extractPdfGeometry(PDF);
  const m = reconstructMultiDateDocument(documentLinesFromText(g.text, g.linePages, g.geometry));
  return m.reconstruction.observations.map((o, i) => mk({ label: o.label, value: o.value || o.rawValue, unit: o.unit, ...reviewDateFields(m.dates[i]!), examDate: m.dates[i]!, extraction: rowExtractionEvidence(o, DOCUMENT_TABLE_RULES_VERSION), documentSha256: sha(PDF), excerpt: o.excerpt, sourceKind: "pdf_text", sourceLabel: "Document: two-day.pdf", documentName: "two-day.pdf" }));
}
const reclassify = (rows: readonly Row[]) => rows.map((r) => ({ ...r, classification: classifyWithGovernedExtensions(r).classification }) as Row);
const save = (rows: readonly Row[], keys: readonly string[], tag: string) =>
  rows.filter((r) => keys.includes(r.key)).map((r, i) => buildReviewedObservation(r, { id: `p614-${tag}-${String(i).padStart(4, "0")}`, recordedAt: "2026-11-12T18:05:00.000Z", scope: SCOPE, duplicateWarningAcknowledged: false }));
const heldKey = (r: { label: string; unit: string }) => `${r.label}|${r.unit}`;

beforeAll(async () => void (await install(v372)));
afterAll(() => resetSyntheticDemoCatalogsForTests());

// --- Safeguards ----------------------------------------------------------------------------------

const SG = (label: string, unit: string) => safeguardFor(label, unit)!;
describe("P61.4 safeguards — one per held proposal, bound to the P61.3 register", () => {
  it("covers exactly the seven held names with their exact reported units", () => {
    expect(MAPPING_SAFEGUARDS?.map((s) => `${s.label}|${s.reportedUnit}`).sort()).toEqual(Object.keys(HELD).sort());
  });
  it("fails closed when a register entry changes or is marked applied", () => {
    const reg = JSON.parse(JSON.stringify(MAPPING_DECISIONS)) as NonNullable<typeof MAPPING_DECISIONS>;
    reg.find((d) => d.id === "P613-M02")!.reportedUnit = "mEq/L";
    expect(validateSafeguards(MAPPING_SAFEGUARDS!, reg)).toBeNull();
    expect(validateSafeguards(MAPPING_SAFEGUARDS!, null)).toBeNull();
  });
  it("Chloride requires the specimen", () => expect(SG("Chloride", "mmol/L").definitions.every((d) => d.requires.includes("specimen"))).toBe(true));
  it("Bicarbonate distinguishes chemistry-panel total CO2 from calculated blood-gas HCO3", () => {
    const ids = SG("Bicarbonate", "mmol/L").definitions.map((d) => d.id);
    expect(ids).toEqual(["TOTAL_CO2_CHEMISTRY", "HCO3_CALCULATED_BLOOD_GAS"]);
    expect(SG("Bicarbonate", "mmol/L").definitions.every((d) => d.requires.includes("measurement_definition"))).toBe(true);
  });
  it("BUN is urea nitrogen, never urea", () => {
    for (const d of SG("Urea nitrogen (BUN)", "mg/dL").definitions) {
      expect(d.displayName).toMatch(/Urea nitrogen/);
      expect(d.displayName).not.toMatch(/^Urea(,|$|\s\()/);
      expect(d.displayName).not.toMatch(/mmol\/L/);
    }
  });
  it("Creatinine requires specimen and definition; serum is never the only option", () => {
    const defs = SG("Creatinine", "mg/dL").definitions;
    expect(defs.every((d) => d.requires.includes("specimen") && d.requires.includes("measurement_definition"))).toBe(true);
    expect(defs.some((d) => /urine/i.test(d.label))).toBe(true);
  });
  it("Platelets keep 10^9/L and are never merged with 10^3/μL", () => {
    const s = SG("Platelets", "10^9/L");
    expect(s.definitions.every((d) => d.requires.includes("unit_expression") && d.displayName.includes("10^9/L"))).toBe(true);
    expect(s.existingCandidates.find((c) => c.unit === "10^3/μL")?.relation).toMatch(/never merged/);
    expect(safeguardFor("Platelets", "10^3/μL")).toBeNull();
  });
  it("Sleep duration is not equated with Total Sleep Time by default; method required", () => {
    const s = SG("Sleep duration", "h");
    expect(s.definitions.length).toBeGreaterThan(1);
    expect(s.definitions.every((d) => d.requires.includes("method") && d.requires.includes("measurement_definition"))).toBe(true);
  });
  it("HRV SDNN requires recording window and method; RMSSD never offered", () => {
    const s = SG("HRV SDNN", "ms");
    expect(s.definitions.every((d) => d.requires.includes("recording_window") && d.requires.includes("method"))).toBe(true);
    expect(s.definitions.some((d) => /RMSSD/i.test(d.displayName))).toBe(false);
  });
});

// --- Governance stage and decision preflight --------------------------------------------------

const TERM = { submissionId: "11111111-1111-4111-8111-111111111111", termId: "ubt-0c1a0000" };
const inputs = (p: Partial<GovernanceInputs> = {}): GovernanceInputs => ({
  missionId: MITO_DEMO_MISSION_ID, submittedTerms: [], scopeTerms: [], triage: [], demoEvents: [], catalogs: getSyntheticDemoCatalogs(), ...p,
});
const submitted = (label: string, unit: string) => [{ ...TERM, originalLabels: [label], exactUnit: unit }];
const tri = (action: GovernanceTriageEvent["action"], reason: string | null, prev: string | null = null, id = "e1"): GovernanceTriageEvent =>
  ({ eventId: id, ...TERM, action, reason, evidenceRequirements: [], previousEventId: prev, recordedAt: "2026-11-12T10:00:00Z", recordedByCaller: false });
const demo = (label: string, unit: string, p: Partial<GovernanceDemoEvent> = {}): GovernanceDemoEvent => ({
  decisionEventId: "22222222-2222-4222-8222-222222222222", ...TERM, demoId: "demo:ubt-0c1a0000", entry: { displayName: label, aliases: [label], unit, domain: "cardiovascular" },
  decidedAt: "2026-11-12T11:00:00Z", decidedByCaller: false, activationEventId: null, activatedAt: null, activatedByCaller: null, revocationEventId: null, revokedAt: null, revocationReason: null, ...p,
});
const goodDraft = (sg: MappingSafeguard, p: Partial<DecisionDraft> = {}): DecisionDraft => {
  const def = sg.definitions[0]!;
  return {
    decision: "APPROVE", definitionId: def.id, domain: sg.defaultDomain,
    evidence: Object.fromEntries(def.requires.map((r) => [r, { basis: "SOURCE_DOCUMENT_STATEMENT", citation: "Source document p.2, line 14" }])),
    rationale: "Definition and specimen stated by the source document.", evidenceRequests: [], acknowledged: true, provenance: "synthetic", ...p,
  };
};
const RESEARCHER = { canDecide: true };

describe("P61.4 governance stage — derived from the existing lifecycle only", () => {
  it("production baseline: no submitted term → held, Ground Medical acts next", () => {
    for (const sg of MAPPING_SAFEGUARDS!) {
      const s = mappingGovernanceStatus(sg, inputs());
      expect(s).toMatchObject({ stage: "NOT_SUBMITTED", eligible: false, nextRole: "ground_medical" });
    }
  });
  it("submitted but not in the owner-authorized scope → owner acts next", () => {
    const sg = SG("Chloride", "mmol/L");
    expect(mappingGovernanceStatus(sg, inputs({ submittedTerms: submitted("Chloride", "mmol/L") }))).toMatchObject({ stage: "SUBMITTED_NOT_IN_SCOPE", nextRole: "owner", eligible: false });
  });
  it("a term with another unit never matches (exact unit)", () => {
    const sg = SG("Chloride", "mmol/L");
    expect(mappingGovernanceStatus(sg, inputs({ submittedTerms: submitted("Chloride", "mEq/L") })).stage).toBe("NOT_SUBMITTED");
  });
  it("pending, rejected and evidence-requested terms stay held", () => {
    const sg = SG("Creatinine", "mg/dL");
    const scope = submitted("Creatinine", "mg/dL");
    expect(mappingGovernanceStatus(sg, inputs({ scopeTerms: scope })).stage).toBe("AWAITING_TRIAGE");
    expect(mappingGovernanceStatus(sg, inputs({ scopeTerms: scope, triage: [tri("REJECT_REVIEW_REQUEST", "Specimen not established.")] }))).toMatchObject({ stage: "REJECTED", eligible: false });
    expect(mappingGovernanceStatus(sg, inputs({ scopeTerms: scope, triage: [tri("REQUEST_MORE_EVIDENCE", "Specimen needed.")] }))).toMatchObject({ stage: "MORE_EVIDENCE_REQUESTED", eligible: false });
  });
  it("approved but not activated, or activated but not installed, stays held", () => {
    const sg = SG("HRV SDNN", "ms");
    const scope = submitted("HRV SDNN", "ms");
    expect(mappingGovernanceStatus(sg, inputs({ scopeTerms: scope, demoEvents: [demo("HRV SDNN", "ms")] }))).toMatchObject({ stage: "APPROVED_AWAITING_ACTIVATION", nextRole: "ground_medical", eligible: false });
    expect(mappingGovernanceStatus(sg, inputs({ scopeTerms: scope, demoEvents: [demo("HRV SDNN", "ms", { activationEventId: "33333333-3333-4333-8333-333333333333", activatedAt: "2026-11-12T12:00:00Z" })] }))).toMatchObject({ stage: "ACTIVATED_NOT_INSTALLED", eligible: false });
  });
  it("versioned history follows the append-only triage chain and demo events in time order", () => {
    const sg = SG("Platelets", "10^9/L");
    const s = mappingGovernanceStatus(sg, inputs({ scopeTerms: submitted("Platelets", "10^9/L"), triage: [tri("REQUEST_MORE_EVIDENCE", "Specimen please", null, "e1"), tri("ACCEPT_FOR_REVIEW", "ok now", "e1", "e2")], demoEvents: [demo("Platelets", "10^9/L")] }));
    expect(s.history.map((h) => h.action)).toEqual(["More evidence requested", "Accepted for review", "Synthetic demonstration decision recorded"]);
  });
});

describe("P61.4 Researcher decisions — existing write paths only, never simulated", () => {
  const awaiting = (sg: MappingSafeguard) => mappingGovernanceStatus(sg, inputs({ scopeTerms: submitted(sg.label, sg.reportedUnit) }));
  it("approval with complete evidence writes: triage acceptance carrying the mapping record, then the demo decision", () => {
    for (const sg of MAPPING_SAFEGUARDS!) {
      const pre = preflightMappingDecision(sg, awaiting(sg), goodDraft(sg), RESEARCHER);
      expect(pre.ok).toBe(true);
      if (!pre.ok) continue;
      expect(pre.steps.map((s) => s.kind)).toEqual(["triage", "demo_decide"]);
      const [t, d] = pre.steps as [Extract<(typeof pre.steps)[number], { kind: "triage" }>, Extract<(typeof pre.steps)[number], { kind: "demo_decide" }>];
      expect(t.action).toBe("ACCEPT_FOR_REVIEW");
      expect(recordedDefinition(sg, t.reason)).toBe(sg.definitions[0]!.id);
      expect(t.reason).toContain(`unit=${sg.reportedUnit} (as reported, not converted)`);
      expect(d.displayName).toBe(sg.definitions[0]!.displayName);
    }
  });
  it("no approval from unverified source notes (all seven)", () => {
    for (const sg of MAPPING_SAFEGUARDS!) {
      const def = sg.definitions[0]!;
      const draft = goodDraft(sg, { evidence: Object.fromEntries(def.requires.map((r) => [r, { basis: "UNVERIFIED_SOURCE_NOTE", citation: "CSV context column says Serum" }])) });
      const pre = preflightMappingDecision(sg, awaiting(sg), draft, RESEARCHER);
      expect(pre.ok).toBe(false);
      if (!pre.ok) expect(pre.problems.some((p) => /unverified source note cannot establish/.test(p))).toBe(true);
    }
  });
  it("missing evidence, an untyped/unknown definition or a missing acknowledgement block approval", () => {
    const sg = SG("Bicarbonate", "mmol/L");
    expect(preflightMappingDecision(sg, awaiting(sg), goodDraft(sg, { evidence: {} }), RESEARCHER).ok).toBe(false);
    expect(preflightMappingDecision(sg, awaiting(sg), goodDraft(sg, { definitionId: "TOTAL_CO2_EQUALS_HCO3" }), RESEARCHER).ok).toBe(false);
    expect(preflightMappingDecision(sg, awaiting(sg), goodDraft(sg, { acknowledged: false }), RESEARCHER).ok).toBe(false);
  });
  it("unauthorized accounts are refused for every recorded decision", () => {
    const sg = SG("Chloride", "mmol/L");
    for (const decision of ["APPROVE", "REJECT", "REQUEST_EVIDENCE"] as const) {
      const pre = preflightMappingDecision(sg, awaiting(sg), goodDraft(sg, { decision, evidenceRequests: decision === "REQUEST_EVIDENCE" ? ["specimen"] : [] }), { canDecide: false });
      expect(pre.ok).toBe(false);
      if (!pre.ok) expect(pre.problems[0]).toMatch(/Only an authorized Researcher/);
    }
  });
  it("real provenance is refused", () => {
    const sg = SG("Chloride", "mmol/L");
    expect(preflightMappingDecision(sg, awaiting(sg), goodDraft(sg, { provenance: "real" }), RESEARCHER).ok).toBe(false);
  });
  it("cannot approve without a submitted, scoped term, after rejection, or while awaiting activation", () => {
    const sg = SG("Sleep duration", "h");
    expect(preflightMappingDecision(sg, mappingGovernanceStatus(sg, inputs()), goodDraft(sg), RESEARCHER).ok).toBe(false);
    expect(preflightMappingDecision(sg, mappingGovernanceStatus(sg, inputs({ submittedTerms: submitted("Sleep duration", "h") })), goodDraft(sg), RESEARCHER).ok).toBe(false);
    const scope = submitted("Sleep duration", "h");
    expect(preflightMappingDecision(sg, mappingGovernanceStatus(sg, inputs({ scopeTerms: scope, triage: [tri("REJECT_REVIEW_REQUEST", "Definition unknown.")] })), goodDraft(sg), RESEARCHER).ok).toBe(false);
    expect(preflightMappingDecision(sg, mappingGovernanceStatus(sg, inputs({ scopeTerms: scope, demoEvents: [demo("Sleep duration", "h")] })), goodDraft(sg), RESEARCHER).ok).toBe(false);
  });
  it("after an accepted record, a retry writes only the decision and must keep the recorded definition", () => {
    const sg = SG("Sleep duration", "h");
    const first = preflightMappingDecision(sg, awaiting(sg), goodDraft(sg), RESEARCHER);
    if (!first.ok) throw new Error("expected ok");
    const accepted = mappingGovernanceStatus(sg, inputs({ scopeTerms: submitted("Sleep duration", "h"), triage: [tri("ACCEPT_FOR_REVIEW", (first.steps[0] as { reason: string }).reason)] }));
    const retry = preflightMappingDecision(sg, accepted, goodDraft(sg), RESEARCHER);
    expect(retry.ok && retry.steps.map((s) => s.kind)).toEqual(["demo_decide"]);
    expect(preflightMappingDecision(sg, accepted, goodDraft(sg, { definitionId: sg.definitions[1]!.id, evidence: Object.fromEntries(sg.definitions[1]!.requires.map((r) => [r, { basis: "SOURCE_VALIDATION_RECEIPT", citation: "Receipt SV-2026-0001" }])) }), RESEARCHER).ok).toBe(false);
    const acceptedPlain = mappingGovernanceStatus(sg, inputs({ scopeTerms: submitted("Sleep duration", "h"), triage: [tri("ACCEPT_FOR_REVIEW", null)] }));
    expect(preflightMappingDecision(sg, acceptedPlain, goodDraft(sg), RESEARCHER).ok).toBe(false);
  });
  it("reject needs a rationale; evidence requests name requirements; defer records nothing", () => {
    const sg = SG("Urea nitrogen (BUN)", "mg/dL");
    const st = awaiting(sg);
    expect(preflightMappingDecision(sg, st, goodDraft(sg, { decision: "REJECT", rationale: "" }), RESEARCHER).ok).toBe(false);
    const rej = preflightMappingDecision(sg, st, goodDraft(sg, { decision: "REJECT", rationale: "Urea vs urea nitrogen undefined." }), RESEARCHER);
    expect(rej.ok && rej.steps).toEqual([expect.objectContaining({ kind: "triage", action: "REJECT_REVIEW_REQUEST", evidenceRequirements: [] })]);
    expect(preflightMappingDecision(sg, st, goodDraft(sg, { decision: "REQUEST_EVIDENCE", evidenceRequests: [] }), RESEARCHER).ok).toBe(false);
    const req = preflightMappingDecision(sg, st, goodDraft(sg, { decision: "REQUEST_EVIDENCE", evidenceRequests: ["specimen", "measurement_definition"] }), RESEARCHER);
    expect(req.ok && req.steps).toEqual([expect.objectContaining({ action: "REQUEST_MORE_EVIDENCE", evidenceRequirements: ["specimen", "identity"] })]);
    expect(preflightMappingDecision(sg, st, goodDraft(sg, { decision: "DEFER" }), { canDecide: false })).toEqual({ ok: true, steps: [], summary: "Deferred: nothing is recorded and the rows stay held." });
  });
});

// --- Re-import recovery (two-day reconstructed fixture) ----------------------------------------

describe("P61.4 exception recovery — re-import after approval and activation", () => {
  const g = globalThis as { window?: unknown };
  const had = "window" in g;
  const previous = g.window;
  beforeAll(() => void (g.window = g.window ?? {}));
  afterAll(() => {
    if (had) g.window = previous;
    else delete g.window;
  });
  beforeEach(async () => void (await install(v372)));

  for (const [name, load] of [["CSV", async () => csvRows()], ["PDF", pdfRows]] as const)
    it(`${name}: 76 extracted, 62 saved, 14 held; re-import 62 duplicates; nothing newly eligible while unapproved`, async () => {
      const rows = await load();
      expect(rows.length).toBe(76);
      expect([...new Set(rows.map((r) => r.observedAt.slice(0, 10)))].sort()).toEqual(DATES);
      const first = evaluateBulkImport(rows, [], SCOPE);
      expect(reconcileBulkImport(rows, first.statuses)).toMatchObject({ observations: 76, validated: 62, unresolved: 14, series: 38, examinationDates: 2 });
      const held = rows.filter((r) => first.statuses.get(r.key)?.kind === "exception");
      expect([...new Set(held.map(heldKey))].sort()).toEqual(Object.keys(HELD).sort());
      const stored = save(rows, first.validatedKeys, "a");
      const again = evaluateBulkImport(rows, stored, SCOPE);
      expect(reconcileBulkImport(rows, again.statuses)).toMatchObject({ duplicates: 62, validated: 0, unresolved: 14 });
      expect(mappingRecovery(rows, again.statuses)).toMatchObject({ extracted: 76, duplicates: 62, newlyEligible: 0, stillHeld: 14, autoSaved: 0 });
      const views = heldMappingViews(rows, again.statuses, inputs({ catalogs: getSyntheticDemoCatalogs() }));
      expect(views.length).toBe(7);
      expect(views.every((v) => v.rows === 2 && v.dates.join() === DATES.join() && !v.status.eligible)).toBe(true);
    });

  it("approved AND activated mappings: 62 duplicates, 14 newly eligible, 0 saved automatically, dates and originals preserved", async () => {
    const store = new InMemoryOfflineMissionStore();
    const rows = csvRows();
    const first = evaluateBulkImport(rows, [], SCOPE);
    for (const o of save(rows, first.validatedKeys, "a")) await saveUnifiedObservation(o, store);
    const before = await listUnifiedObservations(SCOPE.missionId, SCOPE.crewMemberId, store);
    expect(before.length).toBe(62);

    await installWithActivated(Object.keys(HELD));
    const reimport = reclassify(rows);
    const st = evaluateBulkImport(reimport, before, SCOPE);
    const rec = mappingRecovery(reimport, st.statuses);
    expect(rec).toMatchObject({ extracted: 76, duplicates: 62, newlyEligible: 14, stillHeld: 0, autoSaved: 0 });
    expect(rec.newlyEligibleByDate).toEqual([{ date: "2026-11-12", rows: 7 }, { date: "2026-11-13", rows: 7 }]);
    // Nothing saved until explicit confirmation.
    expect((await listUnifiedObservations(SCOPE.missionId, SCOPE.crewMemberId, store)).length).toBe(62);
    const eligible = reimport.filter((r) => st.validatedKeys.includes(r.key));
    expect(eligible.length).toBe(14);
    for (const r of eligible) {
      const [v12, v13] = HELD[heldKey(r)]!;
      expect(r.value).toBe(r.observedAt.startsWith("2026-11-12") ? v12 : v13);
      expect(r.classification.status === "matched" && r.classification.originalUnit).toBe(r.unit);
    }
    // Explicit confirmation appends 14 new records; previous records are untouched; re-import then finds 76 duplicates.
    const added = save(reimport, st.validatedKeys, "b");
    for (const o of added) await saveUnifiedObservation(o, store);
    const after = await listUnifiedObservations(SCOPE.missionId, SCOPE.crewMemberId, store);
    expect(after.length).toBe(76);
    for (const o of before) expect(after.find((x) => x.id === o.id)).toEqual(o);
    expect(added.every((o) => o.provenance === "synthetic" && o.catalogBasis?.kind === "synthetic_demo" && o.source.documentSha256 === sha(CSV))).toBe(true);
    expect(added.map((o) => o.observedAt.slice(0, 10)).sort()).toEqual([...Array(7).fill("2026-11-12"), ...Array(7).fill("2026-11-13")]);
    const third = evaluateBulkImport(reimport, after, SCOPE);
    expect(reconcileBulkImport(reimport, third.statuses)).toMatchObject({ duplicates: 76, validated: 0, unresolved: 0 });
  });

  it("only the activated names become eligible; the rest stay held", async () => {
    await installWithActivated(["Chloride|mmol/L", "HRV SDNN|ms"]);
    const rows = csvRows();
    const st = evaluateBulkImport(rows, [], SCOPE);
    const validatedHeld = rows.filter((r) => st.statuses.get(r.key)?.kind === "validated" && HELD[heldKey(r)]);
    expect([...new Set(validatedHeld.map(heldKey))].sort()).toEqual(["Chloride|mmol/L", "HRV SDNN|ms"]);
    expect(rows.filter((r) => st.statuses.get(r.key)?.kind === "exception").length).toBe(10);
    const s = mappingGovernanceStatus(SG("Chloride", "mmol/L"), inputs({ catalogs: getSyntheticDemoCatalogs() }));
    expect(s).toMatchObject({ stage: "ACTIVE", eligible: true, activeDemoId: "demo:ubt-a6140000" });
  });

  it("revoked activations never make held rows eligible", async () => {
    await installWithActivated(Object.keys(HELD), "REVOKED");
    const rows = csvRows();
    const st = evaluateBulkImport(rows, [], SCOPE);
    expect(rows.filter((r) => HELD[heldKey(r)] && st.statuses.get(r.key)?.kind === "exception").length).toBe(14);
  });

  it("real mode: activated synthetic mappings, aliases and the UN-1 rule never apply", async () => {
    await installWithActivated(Object.keys(HELD));
    const real = csvRows("real");
    const synthetic = new Set(["25-OH vitamin D|ng/mL", "Systolic BP|mmHg", "Diastolic BP|mmHg", "Glucose, fasting|mg/dL", "White blood cells|10^9/L", "Body temperature|deg C", ...Object.keys(HELD)]);
    for (const r of real) if (synthetic.has(heldKey(r))) expect(r.classification.status).not.toBe("matched");
    for (const r of real) if (r.classification.status === "matched") expect(r.classification.metricId.startsWith("demo:")).toBe(false);
  });
});

describe("P61.4 provisional synthetic rules — exposed for review, never promoted", () => {
  it("lists the five P61.2 aliases and the UN-1 temperature rule as synthetic-only and pending", () => {
    const v = provisionalRuleViews();
    expect(v.map((x) => x.label).sort()).toEqual(["25-OH vitamin D", "Body temperature", "Diastolic BP", "Glucose, fasting", "Systolic BP", "White blood cells"]);
    expect(v.every((x) => x.syntheticOnly && /^PENDING_RESEARCHER_/.test(x.status) && x.nextRole === "researcher")).toBe(true);
    expect(v.find((x) => x.label === "Body temperature")?.kind).toBe("UNIT_NOTATION_RULE");
  });
});
