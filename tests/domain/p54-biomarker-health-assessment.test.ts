import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NOT_HARMFUL_BY_CHANGE_TEXT,
  SYNTHETIC_NON_CLINICAL_LABEL,
  biomarkerAssessmentPlainText,
  buildBiomarkerAssessment,
  bundledReferenceRegistry,
  classifyMeasurement,
  isAmbiguousUnit,
  seriesClassification,
  validateReferenceRegistry,
  type ReferenceRegistry,
  type VerifiedReference,
} from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { buildReportDocument } from "../../src/domain/health-intelligence/report-text-pdf";
import { buildHealthHistoryReport } from "../../src/domain/health-intelligence/health-history-report";
import { buildScientificHealthSummary } from "../../src/domain/health-intelligence/scientific-health-summary";
import { summarizeAttestations } from "../../src/domain/health-intelligence/evidence-attestation";
import {
  PENDING_INTERPRETATION_TEXT,
  SYNTHETIC_DEMO_APPROVAL_ACK,
  buildVerifiedSnapshot,
  planApproval,
  sealInterpretationEvent,
  type InterpretationDraft,
  type InterpretationIdentity,
} from "../../src/domain/health-intelligence/biomarker-interpretation";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { TEST_ATTESTATION_KEYS, withAttestation } from "../helpers/interpretation-attestation";
import { V9_SCOPE, obs } from "./fixtures-v9-observations";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const REF: VerifiedReference = {
  id: "test-ref-cv-001",
  environment: "production",
  missionId: null,
  metricId: "cv-001",
  unit: "bpm",
  domain: "cardiovascular",
  kind: "reference_interval",
  lower: 50,
  upper: 90,
  outsideSeverity: "cautionary",
  population: "Healthy adults at rest (TEST FIXTURE ONLY)",
  astronautApplicability: "terrestrial_with_stated_limitations",
  applicabilityNote: "Terrestrial resting interval; spaceflight fluid shifts and deconditioning are not accounted for (test fixture).",
  specimen: null,
  method: null,
  citation: { id: "t1", kind: "peer_reviewed", title: "Test-only reference source", locator: "Table 1", url: null },
  verification: { status: "VERIFIED", verifiedBy: "Test Verifier", verifiedAt: "2026-11-07T00:00:00.000Z", verificationRef: "TEST-VERIFY-001" },
};
const registry = (...entries: Partial<VerifiedReference>[]): ReferenceRegistry =>
  validateReferenceRegistry({ schema: "mitochondria.verified-reference-intervals.v1", version: 1, entries: entries.map((e) => ({ ...REF, ...e })) });

const day = (d: number) => new Date(Date.UTC(2026, 8, d, 8, 0)).toISOString();
const hr = (value: string, d: number, over: Partial<UnifiedObservation> = {}) => obs({ metricId: "cv-001", originalUnit: "bpm", value, observedAt: day(d), ...over });

function build(history: UnifiedObservation[], reg: ReferenceRegistry, provenance: "synthetic" | "real" = "synthetic") {
  const scope = { ...V9_SCOPE, provenance };
  const unified = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: history.map((o) => ({ ...o, provenance })), deviceRecords: [] }, scope, {}, "2026-11-08T12:00:00.000Z");
  const findings = buildScientificFindings(unified);
  const model = buildResearcherInterpretation(unified, findings, []);
  return { unified, findings, model, assessment: buildBiomarkerAssessment(unified, model, undefined, { registry: reg }) };
}

describe("P54 verified reference registry", () => {
  it("ships empty: no reference interval or threshold is invented", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "data/scientific/verified-reference-intervals.v1.json"), "utf8"));
    expect(raw.entries).toEqual([]);
    expect(bundledReferenceRegistry().entries).toHaveLength(0);
  });

  it("excludes references without independent verification, applicability explanation or exact unit", () => {
    const r = registry(
      { id: "a", verification: { status: "VERIFIED", verifiedBy: "", verifiedAt: "", verificationRef: "" } },
      { id: "b", applicabilityNote: "short" },
      { id: "c", unit: "mg/dL or mmol/L" },
      { id: "d", lower: 100, upper: 10 },
      { id: "e", environment: "synthetic_demo", missionId: null },
      { id: "ok" },
    );
    expect(r.entries.map((e) => e.id)).toEqual(["ok"]);
    expect(r.excluded.map((e) => e.reason)).toEqual([
      "independent verification incomplete",
      "applicability and limitations not explained",
      "missing or ambiguous unit",
      "lower bound above upper bound",
      "synthetic demo reference without mission",
    ]);
  });
});

describe("P54 classification", () => {
  const base = { metricId: "cv-001", unit: "bpm", domain: "cardiovascular" as const, provenance: "synthetic" as const, missionId: V9_SCOPE.missionId };

  it("a validated clinically concerning result is RED; a cautionary one is AMBER", () => {
    const red = classifyMeasurement({ ...base, value: "130" }, registry({ outsideSeverity: "clinically_concerning" }));
    expect(red).toMatchObject({ status: "clinically_concerning", severity: "red", reason: "verified_reference" });
    const amber = classifyMeasurement({ ...base, value: "45" }, registry());
    expect(amber).toMatchObject({ status: "below_verified_reference", severity: "amber" });
    expect(classifyMeasurement({ ...base, value: "95" }, registry()).status).toBe("above_verified_reference");
  });

  it("a result within the verified interval is NORMAL, never red", () => {
    for (const value of ["50", "72", "90"]) {
      const c = classifyMeasurement({ ...base, value }, registry({ outsideSeverity: "clinically_concerning" }));
      expect(c.status).toBe("within_verified_reference");
      expect(c.severity).toBe("normal");
    }
  });

  it("unknown or unverified results are never classified", () => {
    expect(classifyMeasurement({ ...base, value: "200" })).toMatchObject({ status: "insufficient_evidence", severity: "neutral", reason: "no_verified_reference" });
    expect(classifyMeasurement({ ...base, metricId: "cv-999", value: "200" }, registry())).toMatchObject({ severity: "neutral", reason: "no_verified_reference" });
    const unverified = registry({ verification: { status: "VERIFIED", verifiedBy: "", verifiedAt: "", verificationRef: "" } });
    expect(classifyMeasurement({ ...base, value: "200" }, unverified).severity).toBe("neutral");
    expect(classifyMeasurement({ ...base, value: "<5" }, registry()).reason).toBe("non_numeric_value");
  });

  it("unit mismatch and ambiguous units fail closed without conversion", () => {
    const mismatch = classifyMeasurement({ ...base, unit: "beats/min", value: "200" }, registry());
    expect(mismatch).toMatchObject({ severity: "neutral", reason: "unit_mismatch" });
    expect(mismatch.explanation).toContain("never converted");
    expect(isAmbiguousUnit("ng/mL ή nmol/L")).toBe(true);
    expect(classifyMeasurement({ ...base, unit: "ng/mL ή nmol/L", value: "20" }, registry({ unit: "ng/mL" })).reason).toBe("ambiguous_unit");
    expect(classifyMeasurement({ ...base, value: "200" }, registry({ id: "x" }, { id: "y" })).reason).toBe("conflicting_references");
    expect(classifyMeasurement({ ...base, value: "200" }, registry({ specimen: "serum" })).reason).toBe("measurement_conditions_unverified");
  });

  it("synthetic-demo references apply only to synthetic data of the same mission", () => {
    const demo = registry({ environment: "synthetic_demo", missionId: V9_SCOPE.missionId, outsideSeverity: "clinically_concerning" });
    const c = classifyMeasurement({ ...base, value: "130" }, demo);
    expect(c.severity).toBe("red");
    expect(c.explanation).toContain(SYNTHETIC_NON_CLINICAL_LABEL);
    expect(classifyMeasurement({ ...base, provenance: "real", value: "130" }, demo).severity).toBe("neutral");
    expect(classifyMeasurement({ ...base, missionId: "other", value: "130" }, demo).severity).toBe("neutral");
  });

  it("a threshold that is not crossed does not establish a normal result", () => {
    const t = registry({ kind: "decision_threshold", lower: null, upper: null, threshold: 120, crossing: "above", inclusive: true, outsideSeverity: "clinically_concerning" });
    expect(classifyMeasurement({ ...base, value: "120" }, t).severity).toBe("red");
    expect(classifyMeasurement({ ...base, value: "80" }, t)).toMatchObject({ severity: "neutral", reason: "threshold_not_crossed" });
  });
});

describe("P54 biomarker assessment report", () => {
  it("an increase or decrease without verified reference evidence is never labelled harmful", () => {
    const { assessment } = build([hr("60", 1), hr("140", 15)], bundledReferenceRegistry());
    const e = assessment.entries.find((x) => x.metricId === "cv-001")!;
    expect(e.change.status).toBe("compared");
    expect(e.change.absolute).toBe(80);
    expect(e.classification.severity).toBe("neutral");
    expect(e.statusLabel).toBe("Insufficient evidence to classify");
    expect(e.limitations).toContain(NOT_HARMFUL_BY_CHANGE_TEXT);
    expect(JSON.stringify(e)).not.toMatch(/\b(harmful|worsen|deteriorat|abnormal|improv)\w*/i);
  });

  it("lists value, unit, date, domain, previous measurement and percentage change; keeps date-only precision", () => {
    const { assessment } = build([hr("60", 1, { observedAt: "2026-09-01", datePrecision: "date" } as Partial<UnifiedObservation>), hr("66", 15)], registry());
    const e = assessment.entries[0]!;
    expect(e).toMatchObject({ name: expect.any(String), unit: "bpm", domainLabel: "Cardiovascular Health" });
    expect(e.latest.value).toBe("66");
    expect(e.previous).toMatchObject({ value: "60", observedAt: "2026-09-01", precision: "date" });
    expect(e.change.percent).toBe(10);
    expect(e.classification.severity).toBe("normal");
    expect(e.applicabilityText).toContain("Terrestrial reference population");
  });

  it("biomarkers without approved interpretations show the pending text; stored records are not changed", () => {
    const history = [hr("60", 1), hr("130", 15)];
    const before = JSON.stringify(history);
    const { assessment } = build(history, registry({ outsideSeverity: "clinically_concerning" }));
    const e = assessment.entries[0]!;
    expect(e.explanation).toBe(`${PENDING_INTERPRETATION_TEXT}.`);
    expect(e.higherValues).toBeNull();
    expect(e.interpretationStatus).toBe("pending");
    expect(e.classification.severity).toBe("red");
    expect(JSON.stringify(history)).toBe(before);
  });

  it("screen, PDF and TXT classify identically and the PDF prints the text marker beside the colour", () => {
    const reg = registry({ outsideSeverity: "clinically_concerning" });
    const history = [hr("60", 1), hr("130", 15), obs({ metricId: "cv-027", originalUnit: "ms", value: "40", observedAt: day(2) })];
    const { unified, findings, model, assessment } = build(history, reg);
    const hist = buildHealthHistoryReport(history, V9_SCOPE.missionId, V9_SCOPE.crewMemberId, "synthetic");
    const doc = buildReportDocument({
      unified,
      findings,
      summary: buildScientificHealthSummary(unified, findings, hist, summarizeAttestations(unified, [])),
      history: hist,
      attestations: [],
      identity: { missionName: "M", crewDisplayName: "C" },
      title: "t",
      referenceRegistry: reg,
    });
    const table = doc.blocks.find((b) => b.kind === "table" && b.columns[3]?.title === "Status");
    if (!table || table.kind !== "table") throw new Error("assessment table missing");
    expect(table.rowTones).toEqual(assessment.entries.map((e) => e.classification.severity));
    expect(table.rowTones).toEqual(["red", "neutral"]);
    expect(table.rows[0]![3]).toBe("(!!) RED - Clinically concerning");
    expect(table.rows[1]![3]).toBe("(?) NEUTRAL - Insufficient evidence to classify");
    const txt = biomarkerAssessmentPlainText(assessment);
    expect(txt.indexOf("(!!) RED")).toBeLessThan(txt.indexOf("(?) NEUTRAL"));
    // Module history views use the same rule.
    const series = model.domains.find((d) => d.domain === "cardiovascular")!.series.find((s) => s.metricId === "cv-001")!;
    expect(seriesClassification(series, "cardiovascular", unified.scope, reg).severity).toBe("red");
    expect(doc.blocks.some((b) => b.kind === "alert" && b.title.startsWith("BIOMARKER STATUS: 1 RED"))).toBe(true);
  });

  it("with the bundled (empty) registry every exported result stays neutral", () => {
    const history = [hr("60", 1), hr("190", 15)];
    const { unified, findings } = build(history, bundledReferenceRegistry());
    const doc = buildReportDocument({ unified, findings, summary: null, history: null, attestations: [], identity: { missionName: null, crewDisplayName: null }, title: "t" });
    const table = doc.blocks.find((b) => b.kind === "table" && b.columns[3]?.title === "Status");
    expect(table && table.kind === "table" && table.rowTones).toEqual(["neutral"]);
  });
});

describe("P54 newly activated synthetic demo biomarkers", () => {
  const ACTIVE = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/p40-mito-demo-active-catalog.v1.json"), "utf8")) as {
    entries: { demoId: string; displayName: string; unit: string; domain: InterpretationIdentity["domain"]; missionId: string }[];
  };
  const VITD = ACTIVE.entries.find((e) => e.demoId === "demo:ubt-7b25ce69")!;
  const REGISTRY = JSON.parse(readFileSync(join(ROOT, "data/scientific/biomarker-interpretation-registry.v1.json"), "utf8"));
  const identity: InterpretationIdentity = { environment: "synthetic_demo", catalogId: VITD.demoId, domain: VITD.domain, unit: VITD.unit, missionId: VITD.missionId, displayName: VITD.displayName };
  const draft: InterpretationDraft = {
    content: {
      function: { text: "Circulating storage form used to describe vitamin D status.", citationIds: ["c1"] },
      increaseContext: { text: "A higher value is documented after greater intake.", citationIds: ["c1"] },
      decreaseContext: null,
      generalContext: null,
      spaceflightRelevance: { text: "Reduced sunlight exposure during spaceflight is documented.", citationIds: ["c1"], evidenceScope: "spaceflight_specific" },
      associatedBiomarkers: null,
      comparabilityRequirements: [],
      limitations: ["Synthetic demonstration content."],
    },
    citations: [{ id: "c1", kind: "peer_reviewed", title: "Example vitamin D review", locator: "Section 2", url: null }],
    evidenceStrength: { level: "moderate", basis: "Synthetic demonstration citation." },
  };
  const rows = [
    { recordId: "v1", badge: "bone" as const, metricId: VITD.demoId, metricLabel: "25(OH) Vitamin D", value: "20", unit: "ng/mL", observedAt: "2026-10-01T08:00:00.000Z", provenance: "synthetic" as const, status: "included" as const, sourceLabel: "CSV", evidence: "unified-intake · csv" },
  ];
  const report = () => {
    const badges = ["bone", "immune", "cardiovascular", "behavioral"] as const;
    return {
      scope: { missionId: VITD.missionId, crewMemberId: "crew-a", provenance: "synthetic" as const },
      generatedAt: "2026-11-08T12:00:00.000Z",
      filters: { from: null, to: null, sources: [...badges] },
      rows,
      exclusions: [],
      summaries: badges.map((badge) => ({ badge, included: rows.filter((r) => r.badge === badge).length, pending: 0, excluded: 0, metrics: 1, firstAt: null, lastAt: null, missing: badge !== "bone" })),
      coverage: { included: 1, pendingReview: 0, excluded: 0, duplicateProjections: 0, outOfFilter: 0, otherScopeIgnored: 0, otherProvenanceIgnored: 0, nonObservationMetadata: 0 },
      limitations: [],
    };
  };

  it("activation alone gives no approved interpretation; the result is labelled non-clinical", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, [], TEST_ATTESTATION_KEYS);
    const u = report();
    const a = buildBiomarkerAssessment(u, buildResearcherInterpretation(u, buildScientificFindings(u), [], snap), snap);
    expect(a.entries[0]!.explanation).toBe(`${PENDING_INTERPRETATION_TEXT}.`);
    expect(a.entries[0]!.nonClinicalLabel).toBe(SYNTHETIC_NON_CLINICAL_LABEL);
    expect(a.entries[0]!.classification.severity).toBe("neutral");
  });

  it("an approved synthetic-demo interpretation supplies cited explanation and spaceflight context, still non-clinical", async () => {
    const plan = await planApproval([], identity, draft, SYNTHETIC_DEMO_APPROVAL_ACK, { userId: "r1", name: "Researcher", roles: ["researcher"], now: "2026-11-08T10:00:00.000Z" });
    if (!plan.ok) throw new Error(plan.reason);
    const events = [await sealInterpretationEvent(plan.body)];
    const snap = await buildVerifiedSnapshot(REGISTRY, await withAttestation(events, events[0]!), TEST_ATTESTATION_KEYS);
    const u = report();
    const e = buildBiomarkerAssessment(u, buildResearcherInterpretation(u, buildScientificFindings(u), [], snap), snap).entries[0]!;
    expect(e.interpretationStatus).toBe("approved");
    expect(e.explanation).toContain("SYNTHETIC DEMO interpretation");
    expect(e.explanation).toContain("[1]");
    expect(e.higherValues).toContain("greater intake");
    expect(e.spaceflightContext).toContain("sunlight");
    expect(e.citations).toHaveLength(1);
    expect(e.evidenceQuality).toContain("Moderate");
    expect(e.classification.severity).toBe("neutral");
  });
});

describe("P54 offline boundary", () => {
  it("the assessment modules make no network calls", () => {
    for (const f of ["biomarker-health-assessment.ts", "preliminary-medical-assessment.ts"]) {
      const src = readFileSync(join(ROOT, "src/domain/health-intelligence", f), "utf8");
      expect(src).not.toMatch(/\bfetch\(|XMLHttpRequest|supabase/);
    }
  });
});
