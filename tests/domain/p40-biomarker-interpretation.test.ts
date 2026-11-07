import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PENDING_INTERPRETATION_TEXT,
  PRODUCTION_APPROVAL_ACK,
  SYNTHETIC_DEMO_APPROVAL_ACK,
  approvalProblem,
  buildApprovalPackage,
  buildVerifiedSnapshot as buildSnap,
  deriveInterpretationTasks,
  interpretationCoverage,
  interpretationKey,
  matchInterpretation,
  mergeApprovalPackage as mergePkg,
  planApproval,
  planDraft,
  planRevocation,
  planTaskOpened,
  sealInterpretationEvent,
  seriesInterpretation,
  seriesInterpretationText,
  validateRegistry,
  type ActorContext,
  type InterpretationDraft,
  type InterpretationEvent,
  type InterpretationIdentity,
  type InterpretationSnapshot,
} from "../../src/domain/health-intelligence/biomarker-interpretation";
import { buildInterpretationRegistry } from "../../src/domain/health-intelligence/biomarker-interpretation-registry-build";
import {
  appendInterpretationEvent,
  listInterpretationEvents,
  loadVerifiedInterpretationSnapshot,
} from "../../src/domain/health-intelligence/biomarker-interpretation-ledger";
import { InMemoryReviewLedgerStore } from "../../src/infrastructure/offline/review-ledger-store";
import { registryInputs, serializeRegistry, REGISTRY_FILE } from "../../scripts/generate-biomarker-interpretation-registry";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation, researcherInterpretationPlainText } from "../../src/domain/health-intelligence/researcher-interpretation";
import { buildReportDocument } from "../../src/domain/health-intelligence/report-text-pdf";
import type { ReportRow, UnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { TEST_ATTESTATION_KEYS, withAttestation } from "../helpers/interpretation-attestation";

// P41: device-local approvals apply only with a trusted server attestation (test key here).
const buildVerifiedSnapshot = (raw: unknown, events: readonly InterpretationEvent[]) => buildSnap(raw, events, TEST_ATTESTATION_KEYS);
const mergeApprovalPackage = (reg: Parameters<typeof mergePkg>[0], pkg: unknown) => mergePkg(reg, pkg, TEST_ATTESTATION_KEYS);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = JSON.parse(readFileSync(join(ROOT, REGISTRY_FILE), "utf8"));
const ACTIVE = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/p40-mito-demo-active-catalog.v1.json"), "utf8")) as {
  entries: { demoId: string; displayName: string; unit: string; domain: InterpretationIdentity["domain"]; missionId: string; revoked: boolean; activationEventId: string }[];
};
const MISSION = ACTIVE.entries[0]!.missionId;

const RESEARCHER: ActorContext = { userId: "researcher-1", name: "Researcher One", roles: ["researcher"], now: "2026-11-08T10:00:00.000Z" };
const GROUND: ActorContext = { userId: "ground-1", name: "Ground", roles: ["ground_medical"], now: "2026-11-08T10:00:00.000Z" };

const demoIdentity = (e: (typeof ACTIVE.entries)[number]): InterpretationIdentity => ({
  environment: "synthetic_demo",
  catalogId: e.demoId,
  domain: e.domain,
  unit: e.unit,
  missionId: e.missionId,
  displayName: e.displayName,
});
const VITD = ACTIVE.entries.find((e) => e.demoId === "demo:ubt-7b25ce69")!;
const VITD_ID = demoIdentity(VITD);

const CITED: InterpretationDraft = {
  content: {
    function: { text: "Circulating storage form used to describe vitamin D status.", citationIds: ["c1"] },
    increaseContext: { text: "A higher value is documented after greater intake or sun exposure.", citationIds: ["c1"] },
    decreaseContext: { text: "A lower value is documented with reduced sunlight exposure, as in spaceflight.", citationIds: ["c1"] },
    generalContext: null,
    spaceflightRelevance: null,
    associatedBiomarkers: null,
    comparabilityRequirements: [{ text: "Compare only results from the same assay and laboratory.", citationIds: ["c1"] }],
    limitations: ["Synthetic demonstration content."],
  },
  citations: [{ id: "c1", kind: "peer_reviewed", title: "Example vitamin D review", locator: "Section 2, p. 4", url: null }],
  evidenceStrength: { level: "moderate", basis: "Single synthetic demonstration citation." },
};

async function chain(...plans: ({ ok: true; body: Parameters<typeof sealInterpretationEvent>[0] } | { ok: false; reason: string })[]) {
  const out: InterpretationEvent[] = [];
  for (const p of plans) {
    if (!p.ok) throw new Error(p.reason);
    out.push(await sealInterpretationEvent(p.body));
  }
  return out;
}
async function approveVitD(): Promise<InterpretationEvent[]> {
  const plan = await planApproval([], VITD_ID, CITED, SYNTHETIC_DEMO_APPROVAL_ACK, RESEARCHER);
  const events = await chain(plan);
  return withAttestation(events, events[0]!);
}

const row = (id: string, value: string, at: string, over: Partial<ReportRow> = {}): ReportRow => ({
  recordId: id, badge: "bone", metricId: VITD.demoId, metricLabel: "25(OH) Vitamin D", value, unit: "ng/mL", observedAt: at,
  provenance: "synthetic", status: "included", sourceLabel: "CSV: synthetic.csv", evidence: "unified-intake · csv", ...over,
});
function report(rows: ReportRow[], provenance: "synthetic" | "real" = "synthetic", missionId = MISSION): UnifiedHealthReport {
  const badges = ["bone", "immune", "cardiovascular", "behavioral"] as const;
  return {
    scope: { missionId, crewMemberId: "crew-a", provenance },
    generatedAt: "2026-11-08T12:00:00.000Z",
    filters: { from: null, to: null, sources: [...badges] },
    rows,
    exclusions: [],
    summaries: badges.map((badge) => {
      const own = rows.filter((x) => x.badge === badge);
      return { badge, included: own.length, pending: 0, excluded: 0, metrics: new Set(own.map((x) => x.metricId)).size, firstAt: own[0]?.observedAt ?? null, lastAt: own.at(-1)?.observedAt ?? null, missing: own.length === 0 };
    }),
    coverage: { included: rows.length, pendingReview: 0, excluded: 0, duplicateProjections: 0, outOfFilter: 0, otherScopeIgnored: 0, otherProvenanceIgnored: 0, nonObservationMetadata: 0 },
    limitations: [],
  };
}
const vitdSeries = (snap: InterpretationSnapshot, rows: ReportRow[], provenance: "synthetic" | "real" = "synthetic", missionId = MISSION) => {
  const u = report(rows, provenance, missionId);
  const model = buildResearcherInterpretation(u, buildScientificFindings(u), [], snap);
  return { u, model, series: model.domains.find((d) => d.domain === "bone")!.series.find((s) => s.metricId === VITD.demoId)! };
};
const TWO_DAYS = (a: string, b: string) => [row("v1", a, "2026-10-01T08:00:00.000Z"), row("v2", b, "2026-10-08T08:00:00.000Z")];

describe("P40 registry: reproducible, traceable, nothing approved", () => {
  it("regenerates byte-identically from its hash-pinned sources", () => {
    const inputs = registryInputs();
    expect(serializeRegistry(buildInterpretationRegistry(inputs))).toBe(readFileSync(join(ROOT, REGISTRY_FILE), "utf8"));
    expect(REGISTRY.sources).toEqual(inputs.sources);
  });

  it("validates with no exclusions and contains zero approvals", () => {
    const { registry, excluded } = validateRegistry(REGISTRY);
    expect(excluded).toEqual([]);
    expect(registry.records.length).toBe(416);
    expect(registry.records.every((r) => r.reviewStatus === "PENDING_SCIENTIFIC_REVIEW" && r.reviewer === null && r.approvalHistory.length === 0)).toBe(true);
  });

  it("reuses Bone and Cardiovascular handbooks verbatim as pending text only, with citations", () => {
    const hb = REGISTRY.records.filter((r: { identity: InterpretationIdentity }) => r.identity.environment === "governed_handbook");
    expect(hb.filter((r: { identity: InterpretationIdentity }) => r.identity.domain === "bone").length).toBe(63);
    expect(hb.filter((r: { identity: InterpretationIdentity }) => r.identity.domain === "cardiovascular").length).toBe(96);
    for (const r of hb) {
      expect(r.contentOrigin).toBe("handbook_verbatim_pending");
      expect(r.identity.unit).toBeNull();
      expect(r.citations.length).toBeGreaterThan(0);
    }
  });

  it("invents no Immune or Behavioral interpretation content", () => {
    const ib = REGISTRY.records.filter((r: { identity: InterpretationIdentity }) => r.identity.domain === "immune" || r.identity.domain === "behavioral");
    expect(ib.length).toBeGreaterThan(0);
    expect(ib.every((r: { content: unknown; citations: unknown[] }) => r.content === null && r.citations.length === 0)).toBe(true);
  });
});

describe("P40 exact coverage of every activated synthetic demo biomarker", () => {
  const identities = ACTIVE.entries.filter((e) => !e.revoked).map(demoIdentity);

  it("has exactly one registry record per activated demo identity, preserving activation history", () => {
    expect(identities.length).toBe(186);
    const byKey = new Map(REGISTRY.records.map((r: { key: string }) => [r.key, r]));
    for (const e of ACTIVE.entries) {
      const rec = byKey.get(interpretationKey(demoIdentity(e))) as { activation: { activationEventId: string } } | undefined;
      expect(rec?.activation?.activationEventId).toBe(e.activationEventId);
    }
  });

  it("reports coverage by domain with zero approvals", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, []);
    const cov = interpretationCoverage(snap, identities);
    expect(cov.map((c) => [c.domain, c.total])).toEqual([["bone", 44], ["cardiovascular", 76], ["immune", 60], ["behavioral", 6]]);
    expect(cov.every((c) => c.approvedProduction === 0 && c.approvedSyntheticDemo === 0 && c.revoked === 0 && c.pending === c.total)).toBe(true);
    expect(cov.reduce((n, c) => n + c.pendingWithProposedHandbookLink, 0)).toBe(38);
    expect(cov.reduce((n, c) => n + c.pendingWithoutAnyContent, 0)).toBe(148);
  });

  it("opens one review task per unapproved identity, including newly activated ones, without approving", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, []);
    const fresh: InterpretationIdentity = { ...VITD_ID, catalogId: "demo:ubt-ffffffff", displayName: "New demo marker" };
    const tasks = deriveInterpretationTasks(snap, [{ identity: fresh, origin: "synthetic_demo_activation" }, { identity: VITD_ID, origin: "synthetic_demo_activation" }]);
    expect(tasks.length).toBe(417);
    expect(tasks.filter((t) => t.key === interpretationKey(VITD_ID)).length).toBe(1);
    expect(tasks.find((t) => t.key === interpretationKey(fresh))?.origin).toBe("synthetic_demo_activation");
    expect(snap.records.some((r) => r.status === "approved")).toBe(false);
  });
});

describe("P40 lifecycle gates", () => {
  it("only a Researcher can open tasks, draft, approve or revoke", async () => {
    expect(planTaskOpened([], VITD_ID, "x", GROUND).ok).toBe(false);
    expect(planDraft([], VITD_ID, CITED, GROUND).ok).toBe(false);
    expect((await planApproval([], VITD_ID, CITED, SYNTHETIC_DEMO_APPROVAL_ACK, GROUND)).ok).toBe(false);
    expect((await planApproval([], VITD_ID, CITED, SYNTHETIC_DEMO_APPROVAL_ACK, RESEARCHER)).ok).toBe(true);
  });

  it("refuses approval without citations, function, unit, evidence basis or the exact acknowledgement", async () => {
    const noCite: InterpretationDraft = { ...CITED, content: { ...CITED.content, function: { text: "Measure.", citationIds: [] } } };
    expect(approvalProblem(VITD_ID, noCite)).toContain("no citation");
    expect(approvalProblem(VITD_ID, { ...CITED, content: { ...CITED.content, function: null } })).toContain("function");
    expect(approvalProblem({ ...VITD_ID, unit: null }, CITED)).toContain("exact unit");
    expect(approvalProblem(VITD_ID, { ...CITED, evidenceStrength: { level: "low", basis: "" } })).toContain("evidence strength");
    expect((await planApproval([], VITD_ID, CITED, PRODUCTION_APPROVAL_ACK, RESEARCHER)).ok).toBe(false);
  });

  it("rejects reference intervals and thresholds in interpretation text", () => {
    const t: InterpretationDraft = { ...CITED, content: { ...CITED.content, generalContext: { text: "The normal range is 30-100 ng/mL.", citationIds: ["c1"] } } };
    expect(approvalProblem(VITD_ID, t)).toContain("threshold");
  });

  it("revocation needs an approved record and a reason; it keeps append-only history", async () => {
    const events = await approveVitD();
    const snap = await buildVerifiedSnapshot(REGISTRY, events);
    const rec = snap.records.find((r) => r.key === interpretationKey(VITD_ID))!;
    expect(planRevocation(events, rec, "short", RESEARCHER).ok).toBe(false);
    const rev = planRevocation(events, rec, "Citation withdrawn by the journal.", RESEARCHER);
    const all = [...events, ...(await chain(rev))];
    const after = (await buildVerifiedSnapshot(REGISTRY, all)).records.find((r) => r.key === rec.key)!;
    expect(after.status).toBe("revoked");
    expect(after.approvalHistory.map((h) => h.action)).toEqual(["APPROVE", "REVOKE"]);
    expect(after.activation?.activationEventId).toBe(VITD.activationEventId);
  });
});

describe("P40 report series interpretation", () => {
  it("applies an approved demo interpretation only to the exact ID, unit, domain and mission of synthetic data", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, await approveVitD());
    const k = { metricId: VITD.demoId, unit: "ng/mL", domain: "bone" as const, missionId: MISSION, provenance: "synthetic" };
    expect(matchInterpretation(snap, k).exact?.status).toBe("approved");
    expect(matchInterpretation(snap, { ...k, unit: "nmol/L" }).exact).toBeNull();
    expect(matchInterpretation(snap, { ...k, unit: "nmol/L" }).otherUnits).toEqual(["ng/mL"]);
    expect(matchInterpretation(snap, { ...k, domain: "immune" }).exact).toBeNull();
    expect(matchInterpretation(snap, { ...k, missionId: "other-mission" }).exact).toBeNull();
    expect(matchInterpretation(snap, { ...k, provenance: "real" }).exact).toBeNull();
  });

  it("uses direction-specific context only for multi-day differences, never improvement/deterioration language", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, await approveVitD());
    const up = vitdSeries(snap, TWO_DAYS("20", "30")).series.interpretation;
    expect(up.status).toBe("approved");
    expect(up.syntheticDemo).toBe(true);
    expect(up.contextLines.some((l) => l.startsWith("Context documented for a higher value") && l.includes("[1]"))).toBe(true);
    const down = vitdSeries(snap, TWO_DAYS("30", "20")).series.interpretation;
    expect(down.contextLines.some((l) => l.startsWith("Context documented for a lower value"))).toBe(true);
    const same = vitdSeries(snap, TWO_DAYS("30", "30")).series.interpretation;
    expect(same.contextLines).toContain("No recorded difference; direction-specific context is not applied.");
    const single = vitdSeries(snap, [row("v1", "30", "2026-10-01T08:00:00.000Z")]).series.interpretation;
    expect(single.contextLines.some((l) => l.includes("Fewer than two comparable time points"))).toBe(true);
    for (const s of [up, down, same, single]) {
      expect(s.citations.length).toBe(1);
      expect(s.uncertainty.length).toBeGreaterThan(0);
      expect(s.alert).toContain("None generated");
      const claims = s.contextLines.map((l) => l.replace(/^Context documented for a (higher|lower) value \(not an improvement, deterioration or diagnosis\): /, ""));
      expect(claims.join(" ")).not.toMatch(/\b(improv|worsen|deteriorat|abnormal|diagnos)\w*/i);
    }
  });

  it("shows the pending text when no approved interpretation exists or after revocation", async () => {
    const base = await buildVerifiedSnapshot(REGISTRY, []);
    expect(vitdSeries(base, TWO_DAYS("20", "30")).series.interpretation.statusLine).toBe(`${PENDING_INTERPRETATION_TEXT}.`);
    const events = await approveVitD();
    const rec = (await buildVerifiedSnapshot(REGISTRY, events)).records.find((r) => r.key === interpretationKey(VITD_ID))!;
    const revoked = await buildVerifiedSnapshot(REGISTRY, [...events, ...(await chain(planRevocation(events, rec, "Citation withdrawn by the journal.", RESEARCHER)))]);
    const s = vitdSeries(revoked, TWO_DAYS("20", "30")).series.interpretation;
    expect(s.status).toBe("revoked");
    expect(s.statusLine).toContain(PENDING_INTERPRETATION_TEXT);
    expect(s.contextLines.some((l) => l.startsWith("Context documented"))).toBe(false);
  });

  it("does not count synthetic demo approvals as production validation", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, await approveVitD());
    const { model } = vitdSeries(snap, TWO_DAYS("20", "30"));
    expect(model.validatedInterpretations).toBe(0);
    expect(model.syntheticDemoInterpretations).toBe(1);
  });

  it("never applies a proposed handbook link as an interpretation", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, []);
    const linked = snap.records.find((r) => r.identity.environment === "synthetic_demo" && r.proposedLinks.length)!;
    const s = seriesInterpretation(
      matchInterpretation(snap, { metricId: linked.identity.catalogId, unit: linked.identity.unit!, domain: linked.identity.domain, missionId: MISSION, provenance: "synthetic" }),
      "multi_day_comparison",
      "higher",
      "no governed mapping",
    );
    expect(s.status).toBe("pending");
    expect(s.contextLines.some((l) => l.startsWith("Proposed link awaiting review (not applied)"))).toBe(true);
  });
});

describe("P40 offline snapshot, integrity and parity", () => {
  it("persists device-local events and rebuilds the same verified snapshot offline", async () => {
    const store = new InMemoryReviewLedgerStore();
    const plan = await planApproval([], VITD_ID, CITED, SYNTHETIC_DEMO_APPROVAL_ACK, RESEARCHER);
    if (!plan.ok) throw new Error(plan.reason);
    await appendInterpretationEvent(plan.body, store);
    const first = await listInterpretationEvents(store);
    const attest = (await withAttestation(first, first[0]!)).at(-1)!;
    const { hash: _h, ...attestBody } = attest;
    await appendInterpretationEvent(attestBody, store);
    const events = await listInterpretationEvents(store);
    expect(events.length).toBe(2);
    const snap = await loadVerifiedInterpretationSnapshot(store, TEST_ATTESTATION_KEYS);
    expect(snap.ledger.verified).toBe(true);
    expect(snap.records.find((r) => r.key === interpretationKey(VITD_ID))?.basis).toBe("device_local");
    expect((await loadVerifiedInterpretationSnapshot(store, TEST_ATTESTATION_KEYS)).digest).toBe(snap.digest);
    // A second event at the same position is refused, not overwritten.
    await expect(appendInterpretationEvent(plan.body, store)).rejects.toThrow();
  });

  it("ignores the whole device history if the chain is tampered with", async () => {
    const events = await approveVitD();
    const tampered = [{ ...events[0]!, draft: { ...events[0]!.draft!, evidenceStrength: { level: "high" as const, basis: "Changed after approval." } } }];
    const snap = await buildVerifiedSnapshot(REGISTRY, tampered);
    expect(snap.ledger.verified).toBe(false);
    expect(snap.records.some((r) => r.status === "approved")).toBe(false);
  });

  it("downgrades a shared registry approval whose content no longer matches its fingerprint", async () => {
    const events = await approveVitD();
    const merged = await mergeApprovalPackage(validateRegistry(REGISTRY).registry, buildApprovalPackage(events, "2026-11-08T11:00:00.000Z"));
    if (!merged.ok) throw new Error(merged.reason);
    const good = await buildVerifiedSnapshot(merged.registry, []);
    expect(good.records.find((r) => r.key === interpretationKey(VITD_ID))?.basis).toBe("registry");
    const altered = { ...merged.registry, records: merged.registry.records.map((r) => (r.key === interpretationKey(VITD_ID) ? { ...r, content: { ...r.content!, limitations: ["edited"] } } : r)) };
    const bad = await buildVerifiedSnapshot(altered, []);
    expect(bad.records.find((r) => r.key === interpretationKey(VITD_ID))?.status).toBe("pending");
    expect(bad.excluded.some((x) => x.reason.includes("fingerprint"))).toBe(true);
  });

  it("screen model, TXT and PDF carry the same interpretation lines", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, await approveVitD());
    const { u, model, series } = vitdSeries(snap, TWO_DAYS("20", "30"));
    const lines = seriesInterpretationText(series.interpretation);
    const txt = researcherInterpretationPlainText(model);
    for (const l of lines) expect(txt).toContain(l);
    const doc = buildReportDocument({ unified: u, findings: buildScientificFindings(u), summary: null, history: null, attestations: [], identity: { missionName: null, crewDisplayName: null }, title: "t", interpretations: snap });
    const pdfText = JSON.stringify(doc);
    expect(pdfText).toContain(JSON.stringify(lines.join(" ")).slice(1, -1));
  });
});
