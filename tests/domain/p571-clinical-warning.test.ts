/**
 * P57.1 — scientific reference criteria candidates, three-axis warning model, AI claim guard,
 * report legend and Alex Morgan regression. Pure modules only (no jspdf / pdfjs needed).
 *
 * Approvals in the classification tests are constructed in memory (ApprovedCriterion objects) to
 * exercise classification logic; the attestation chain itself is exercised by
 * tests/domain/p57-reference-criteria.test.ts and by the separation-of-duties tests below.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approvalBlocker,
  bundledCriteriaRegistry,
  classifyWithCriteria,
  criterionFingerprint,
  validateCriteriaRegistry,
  type ApprovedCriterion,
  type CriteriaContext,
  type CriteriaRegistry,
  type ReferenceCriterion,
} from "../../src/domain/health-intelligence/p57-reference-criteria";
import { CRITERIA_APPROVAL_ACKNOWLEDGEMENT, planCriteriaDecisions, resolveCriteriaReview } from "../../src/domain/health-intelligence/p57-criteria-review";
import { attestCriteriaDecisionsCore } from "../../src/lib/reference-criteria.server";
import { bundledReviewRules, reviewSeries, seriesProfile } from "../../src/domain/health-intelligence/p56-longitudinal-profile";
import type { ExamPoint } from "../../src/domain/health-intelligence/longitudinal-comparison";
import { deriveWarningAxes, ruleStatuses } from "../../src/domain/health-intelligence/p571-warning-axes";
import { REPORT_LEGEND, chartReferenceBands, interiorExtremes, legendProblems } from "../../src/domain/health-intelligence/p571-report-legend";
import { aiClaimProblem, guardAiStatements } from "../../src/domain/health-intelligence/p571-ai-claim-guard";
import { CLINICAL_AI_SCHEMA_VERSION, CLINICAL_PACKET_SCHEMA, validateClinicalAi, type ClinicalPacket } from "../../src/domain/health-intelligence/p58-clinical-reasoning";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const candidatesRaw = JSON.parse(readFileSync(join(ROOT, "data/scientific/p571-reference-criteria-candidates.v1.json"), "utf8"));
const CAND = validateCriteriaRegistry(candidatesRaw);
const LIVE = bundledCriteriaRegistry();
const MISSION = "mission-p571-test";
const TEST_SECRET = "test-only-p571-secret-not-deployed-0123456789abcdef";

const crit = (r: CriteriaRegistry, id: string) => r.criteria.find((c) => c.id === id)!;
const approve = (c: ReferenceCriterion, conditions: string[] = c.applicability.missionLevel.map((x) => x.id), missionId = MISSION): ApprovedCriterion => ({
  criterion: c, fingerprint: "test", missions: [{ missionId, conditions }], approvedAt: "2026-11-08T10:00:00.000Z", approverUserId: "researcher-1", approvalRef: `test-approval-${c.id}`,
});
const ctx = (metricId: string, unit: string, value: string, extra: Partial<CriteriaContext> = {}): CriteriaContext => ({
  metricId, unit, domain: "cardiovascular", value, provenance: "synthetic", missionId: MISSION, holds: [], ...extra,
});

let n = 0;
function pts(values: [string, number][]): ExamPoint[] {
  return values.map(([day, v]) => ({ key: `k${n++}`, at: day, precision: "date", day, readings: [{ recordId: `r${n}`, value: String(v), source: "test" }], repeat: "single", value: v, valueText: String(v), decimals: 1 }));
}
const flagsFor = (metricId: string, unit: string, values: [string, number][]) => reviewSeries(metricId, seriesProfile(pts(values)), unit, bundledReviewRules().rules).flags;

const K = crit(CAND, "p571-ukka2026-hyperkalaemia-severity");
const NA = crit(CAND, "p571-ese2014-hyponatraemia-biochemical");
const K_CONDS = ["pseudohyperkalaemia_excluded", "specimen_type_recorded"];

// ------------------------------------------------------------------ registry integrity / regression
describe("P57.1 candidate registry", () => {
  it("validates in the exact P57 schema with no exclusions", () => {
    expect(CAND.excluded).toEqual([]);
    expect(CAND.criteria.map((c) => c.id).sort()).toEqual([
      "p571-aasm2015-sleep-duration", "p571-accaha2025-dbp-stage-ranges", "p571-accaha2025-sbp-stage-ranges",
      "p571-ese2014-hyponatraemia-biochemical", "p571-nihods-25ohd-status", "p571-ukka2026-hyperkalaemia-severity",
    ]);
  });
  it("leaves the live registry and the verified-interval file unchanged (regression)", () => {
    expect(LIVE.excluded).toEqual([]);
    expect(LIVE.criteria.length).toBe(9);
    expect(LIVE.criteria.some((c) => c.id.startsWith("p571-"))).toBe(false);
    const verified = JSON.parse(readFileSync(join(ROOT, "data/scientific/verified-reference-intervals.v1.json"), "utf8"));
    expect(verified.entries).toEqual([]);
  });
  it("never presents a general-population criterion as astronaut-validated or uses a demo identity", () => {
    for (const c of CAND.criteria) {
      expect(c.astronautApplicability).toBe("terrestrial_with_stated_limitations");
      expect(c.astronautNote).toMatch(/not a NASA flight rule/);
      expect(c.identity.catalogId ?? "").not.toMatch(/^demo:/);
    }
  });
  it("criteria without a catalog identity in that unit can never be approved", () => {
    expect(approvalBlocker(crit(CAND, "p571-nihods-25ohd-status"))).not.toBeNull();
    expect(approvalBlocker(crit(CAND, "p571-aasm2015-sleep-duration"))).not.toBeNull();
    expect(approvalBlocker(K)).toBeNull();
  });
  it("a modified band changes the fingerprint, so earlier approvals stop applying (idempotent otherwise)", async () => {
    const a = await criterionFingerprint(K);
    expect(await criterionFingerprint(K)).toBe(a);
    expect(await criterionFingerprint({ ...K, bands: K.bands.map((b, i) => (i === 0 ? { ...b, lower: 5.4 } : b)) })).not.toBe(a);
  });
});

// ------------------------------------------------------------------ identity, unit, applicability, approval
describe("P57.1 classification gates", () => {
  it("binds exact identity and unit: other units and demo identities get no candidate", () => {
    expect(classifyWithCriteria(ctx("cv-071", "mEq/L", "5.8"), [approve(K)], CAND).outcome).toBe("no_candidate");
    expect(classifyWithCriteria(ctx("demo:ubt-4afd25a0", "mmol/L", "5.8"), [approve(K)], CAND).outcome).toBe("no_candidate");
  });
  it("unapproved candidates classify nothing", () => {
    const r = classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8"), [], CAND);
    expect(r.outcome).toBe("pending_approval");
    expect(r.severity).toBe("neutral");
  });
  it("missing specimen / pseudohyperkalaemia exclusion makes an approved criterion not applicable", () => {
    const r = classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8", { observationConditions: ["pseudohyperkalaemia_excluded"] }), [approve(K)], CAND);
    expect(r.outcome).toBe("not_applicable");
    expect(r.explanation).toMatch(/specimen type/);
  });
  it("missing fasting status makes the approved triglyceride criterion not applicable", () => {
    const tg = crit(LIVE, "p57-nhlbi-triglyceride-categories");
    const r = classifyWithCriteria(ctx("cv-088", "mg/dL", "330"), [approve(tg)], LIVE);
    expect(r.outcome).toBe("not_applicable");
    expect(r.explanation).toMatch(/fasting/i);
  });
  it("approval for another mission does not apply (mission scope)", () => {
    const r = classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8", { observationConditions: K_CONDS }), [approve(K, ["adult_crew"], "other-mission")], CAND);
    expect(r.severity).toBe("neutral");
  });
  it("RED / AMBER / NORMAL / NEUTRAL with source band labels preserved", () => {
    const amber = classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8", { observationConditions: K_CONDS }), [approve(K)], CAND);
    expect([amber.severity, amber.bandLabel]).toEqual(["amber", "Mild hyperkalaemia (UKKA)"]);
    expect(classifyWithCriteria(ctx("cv-071", "mmol/L", "6.7", { observationConditions: K_CONDS }), [approve(K)], CAND).severity).toBe("red");
    const tg = crit(LIVE, "p57-nhlbi-triglyceride-categories");
    expect(classifyWithCriteria(ctx("cv-088", "mg/dL", "120", { observationConditions: ["fasting_status_recorded"] }), [approve(tg)], LIVE).severity).toBe("normal");
    const low = classifyWithCriteria(ctx("cv-071", "mmol/L", "3.2", { observationConditions: K_CONDS }), [approve(K)], CAND);
    expect([low.outcome, low.severity]).toEqual(["outside_bands", "neutral"]);
  });
  it("sodium 128 is moderate (AMBER) only with ISE and hyperglycaemia exclusion; 146 is never classified", () => {
    const conds = ["ion_specific_electrode", "hyperglycaemia_excluded"];
    expect(classifyWithCriteria(ctx("cv-070", "mmol/L", "128", { observationConditions: conds }), [approve(NA)], CAND).bandLabel).toBe("Moderate hyponatraemia (biochemical, ESE)");
    expect(classifyWithCriteria(ctx("cv-070", "mmol/L", "128"), [approve(NA)], CAND).outcome).toBe("not_applicable");
    expect(classifyWithCriteria(ctx("cv-070", "mmol/L", "146", { observationConditions: conds }), [approve(NA)], CAND).severity).toBe("neutral");
  });
  it("contradicting approved criteria are not reconciled (conflict → NEUTRAL)", () => {
    const clone: ReferenceCriterion = { ...K, id: "p571-test-conflict", bands: [{ ...K.bands[0]!, severity: "red" }] };
    const reg = { ...CAND, criteria: [...CAND.criteria, clone] };
    const r = classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8", { observationConditions: K_CONDS }), [approve(K), approve(clone)], reg);
    expect([r.outcome, r.severity]).toEqual(["conflict", "neutral"]);
  });
  it("classified output carries the approval reference and source locator (audit)", () => {
    const r = classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8", { observationConditions: K_CONDS }), [approve(K)], CAND);
    expect(r.used[0]!.approvalRef).toBe(`test-approval-${K.id}`);
    expect(r.used[0]!.locator).toMatch(/severity classification/);
    expect(r.explanation).toMatch(/not a diagnosis/);
  });
});

// ------------------------------------------------------------------ separation of duties
describe("P57.1 separation of duties", () => {
  it("a non-Researcher cannot record a decision", async () => {
    const res = await resolveCriteriaReview(CAND, []);
    const plan = await planCriteriaDecisions(CAND, [], res, { userId: "ground-medical-1", researcherMissions: [], now: "2026-11-08T10:00:00.000Z" }, {
      action: "APPROVE", criterionIds: [K.id], missions: [{ missionId: MISSION, conditions: ["adult_crew"] }], acknowledgement: CRITERIA_APPROVAL_ACKNOWLEDGEMENT, note: "Compared with the UKKA guideline.", batchId: "b",
    });
    expect(plan.ok).toBe(false);
  });
  it("the server refuses to attest candidates that are not in the bundled live registry", async () => {
    const res = await resolveCriteriaReview(CAND, []);
    const plan = await planCriteriaDecisions(CAND, [], res, { userId: "researcher-1", researcherMissions: [MISSION], now: "2026-11-08T10:00:00.000Z" }, {
      action: "APPROVE", criterionIds: [K.id], missions: [{ missionId: MISSION, conditions: ["adult_crew"] }], acknowledgement: CRITERIA_APPROVAL_ACKNOWLEDGEMENT, note: "Compared with the UKKA guideline.", batchId: "b",
    });
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.events.length).toBe(1);
    const signed = await attestCriteriaDecisionsCore(plan.events, { env: () => TEST_SECRET, now: () => new Date("2026-11-08T10:00:00.000Z"), userId: "researcher-1", researcherMissions: [MISSION] });
    expect(signed.ok && signed.attestations.length === 0 && signed.failures.length === 1).toBe(true);
  });
});

// ------------------------------------------------------------------ longitudinal rules, three axes
describe("P57.1 three independent axes", () => {
  it("intermediate peaks are detected (triglycerides 165 → 330 → 184)", () => {
    const f = flagsFor("cv-088", "mg/dL", [["2026-11-06", 165], ["2026-11-07", 330], ["2026-11-08", 184]]);
    expect(f.some((x) => x.ruleId === "P561-R2-transient-extreme")).toBe(true);
    expect(interiorExtremes([{ day: "06", value: 165 }, { day: "07", value: 330 }, { day: "08", value: 184 }])).toEqual([{ day: "07", value: 330, kind: "peak" }]);
  });
  it("a high-priority review flag never colours the clinical axis", () => {
    const flags = flagsFor("cv-071", "mmol/L", [["2026-11-07", 5.8], ["2026-11-08", 3.2]]);
    const cls = classifyWithCriteria(ctx("cv-071", "mmol/L", "3.2"), [], CAND);
    const a = deriveWarningAxes({ metricId: "cv-071", unit: "mmol/L", catalogUnit: "mmol/L", valueText: "3.2", classification: cls, reviewFlags: flags });
    expect(a.review.value).toBe("HIGH");
    expect(a.clinical.value).toBe("NEUTRAL");
  });
  it("HbA1c 9.1 → 5.9 % in one day is a data-quality warning, held, and never an improvement", () => {
    const flags = flagsFor("cv-085", "%", [["2026-11-07", 9.1], ["2026-11-08", 5.9]]);
    expect(flags.map((f) => f.kind)).toEqual(["data_quality"]);
    const ada = crit(LIVE, "p57-ada2026-hba1c-categories");
    const cls = classifyWithCriteria(ctx("cv-085", "%", "5.9", { holds: ["measurement-consistency check required"] }), [approve(ada)], LIVE);
    expect(cls.outcome).toBe("held");
    const a = deriveWarningAxes({ metricId: "cv-085", unit: "%", catalogUnit: "%", valueText: "5.9", classification: cls, reviewFlags: flags });
    expect([a.clinical.value, a.review.value, a.dataQuality.value]).toEqual(["NEUTRAL", "ROUTINE", "DATA_QUALITY_WARNING"]);
    expect(JSON.stringify(a)).not.toMatch(/improv/i);
  });
  it("pending rules are not applied in live mode and are listed; preview mode labels itself", () => {
    const red = classifyWithCriteria(ctx("cv-071", "mmol/L", "6.7", { observationConditions: K_CONDS }), [approve(K)], CAND);
    const input = { metricId: "cv-071", unit: "mmol/L", catalogUnit: "mmol/L", valueText: "6.7", classification: red, reviewFlags: [], recorded: { specimen: true, method: true } };
    const live = deriveWarningAxes(input);
    expect(live.clinical.value).toBe("RED");
    expect(live.review.value).toBe("NO_FLAG");
    expect(live.pendingNotApplied).toEqual(expect.arrayContaining(["RP-3", "DQ-7"]));
    expect(live.dataQuality.value).toBe("UNKNOWN");
    const preview = deriveWarningAxes(input, { preview: "proposed-rules" });
    expect([preview.mode, preview.review.value, preview.dataQuality.value]).toEqual(["proposed-rules-preview", "HIGH", "VERIFIED"]);
  });
  it("data-quality UNKNOWN for demo identity, missing catalog unit, or missing specimen/method (preview)", () => {
    const base = { unit: "ng/mL", valueText: "12", classification: null, reviewFlags: [] };
    expect(deriveWarningAxes({ ...base, metricId: "demo:ubt-x", catalogUnit: "ng/mL" }, { preview: "proposed-rules" }).dataQuality.value).toBe("UNKNOWN");
    expect(deriveWarningAxes({ ...base, metricId: "bone-019", catalogUnit: null, recorded: { specimen: true, method: true } }, { preview: "proposed-rules" }).dataQuality.reasons.join()).toMatch(/no unit/);
    expect(deriveWarningAxes({ ...base, metricId: "cv-071", catalogUnit: "ng/mL", valueText: "<5" }, { preview: "proposed-rules" }).dataQuality.value).toBe("DATA_QUALITY_WARNING");
  });
  it("a demo identity can never be clinically coloured even if a classification is passed in", () => {
    const fake = { ...classifyWithCriteria(ctx("cv-071", "mmol/L", "6.7", { observationConditions: K_CONDS }), [approve(K)], CAND) };
    expect(deriveWarningAxes({ metricId: "demo:ubt-4afd25a0", unit: "mmol/L", catalogUnit: "mmol/L", valueText: "6.7", classification: fake, reviewFlags: [] }).clinical.value).toBe("NEUTRAL");
  });
  it("is deterministic (idempotent) for identical input", () => {
    const flags = flagsFor("cv-092", "pg/mL", [["2026-11-05", 5.8], ["2026-11-07", 74]]);
    const input = { metricId: "cv-092", unit: "pg/mL", catalogUnit: "pg/mL", valueText: "74", classification: null, reviewFlags: flags };
    expect(deriveWarningAxes(input)).toEqual(deriveWarningAxes(input));
  });
  it("an invalid rules file fails closed (no review or data-quality rule fires)", () => {
    expect(ruleStatuses({ schema: "wrong" })).toBeNull();
    const flags = flagsFor("cv-071", "mmol/L", [["2026-11-07", 5.8], ["2026-11-08", 3.2]]);
    const a = deriveWarningAxes({ metricId: "cv-071", unit: "mmol/L", catalogUnit: "mmol/L", valueText: "3.2", classification: null, reviewFlags: flags }, { rules: { schema: "wrong" } });
    expect([a.review.value, a.dataQuality.value, a.clinical.value]).toEqual(["NO_FLAG", "UNKNOWN", "NEUTRAL"]);
  });
});

// ------------------------------------------------------------------ Alex Morgan regression (synthetic)
describe("P57.1 Alex Morgan synthetic series (no approvals) — nothing may turn clinically red", () => {
  const series: { id: string; unit: string; v: [string, number][]; review: string; dq: string }[] = [
    { id: "cv-071", unit: "mmol/L", v: [["2026-11-07", 5.8], ["2026-11-08", 3.2]], review: "HIGH", dq: "UNKNOWN" },
    { id: "cv-070", unit: "mmol/L", v: [["2026-11-07", 128], ["2026-11-08", 146]], review: "HIGH", dq: "UNKNOWN" },
    { id: "cv-088", unit: "mg/dL", v: [["2026-11-06", 165], ["2026-11-07", 330], ["2026-11-08", 184]], review: "HIGH", dq: "UNKNOWN" },
    { id: "cv-085", unit: "%", v: [["2026-11-07", 9.1], ["2026-11-08", 5.9]], review: "ROUTINE", dq: "DATA_QUALITY_WARNING" },
    { id: "cv-091", unit: "mg/L", v: [["2026-11-07", 28]], review: "NO_FLAG", dq: "UNKNOWN" },
    { id: "cv-092", unit: "pg/mL", v: [["2026-11-05", 5.8], ["2026-11-07", 74]], review: "HIGH", dq: "UNKNOWN" },
    { id: "cv-027", unit: "ms", v: [["2026-11-06", 24], ["2026-11-07", 12]], review: "HIGH", dq: "UNKNOWN" },
  ];
  for (const s of series)
    it(`${s.id}: clinical NEUTRAL, review ${s.review}, data quality ${s.dq}`, () => {
      const flags = flagsFor(s.id, s.unit, s.v);
      const last = String(s.v.at(-1)![1]);
      const cls = classifyWithCriteria(ctx(s.id, s.unit, last), [], LIVE);
      const a = deriveWarningAxes({ metricId: s.id, unit: s.unit, catalogUnit: s.unit, valueText: last, classification: cls, reviewFlags: flags });
      expect([a.clinical.value, a.review.value, a.dataQuality.value]).toEqual(["NEUTRAL", s.review, s.dq]);
    });
});

// ------------------------------------------------------------------ AI hallucination rejection
describe("P57.1 AI guard", () => {
  const c = { allowedCitations: ["10.2337/dc26-S002"], approvedCriterionApplied: false, clinicalClasses: ["NEUTRAL" as const] };
  it("rejects invented citations, threshold language without approval, diagnoses, approvals and alarm words", () => {
    expect(aiClaimProblem("See doi 10.1000/fake.123 for details.", c)).toMatch(/not in the evidence packet/);
    expect(aiClaimProblem("Smith et al. reported similar values.", c)).toMatch(/citation/);
    expect(aiClaimProblem("Potassium is outside the normal range.", c)).toMatch(/threshold/);
    expect(aiClaimProblem("The crew member has hyperkalaemia.", c)).toMatch(/diagnosis/);
    expect(aiClaimProblem("We approve this criterion for the mission.", c)).toMatch(/approve/);
    expect(aiClaimProblem("This value is classified as critical.", c)).toMatch(/status/);
  });
  it("keeps cautious explanations, packet citations and 'red blood cells'", () => {
    const ok = guardAiStatements([
      "Potassium fell between two examinations one day apart; sample handling should be checked before interpretation.",
      "Altered red blood cell turnover can affect HbA1c (doi 10.2337/dc26-S002).",
    ], c);
    expect(ok.rejected).toEqual([]);
  });
  it("the existing P58 validator rejects new numbers, causation and single-domain cross-domain claims", () => {
    const packet: ClinicalPacket = {
      schema: CLINICAL_PACKET_SCHEMA, provenance: "synthetic",
      items: [
        { ref: "O1", catalogId: "cv-071", name: "Potassium", domain: "Cardiovascular Health", unit: "mmol/L", series: [{ day: 0, value: "5.8" }, { day: 1, value: "3.2" }], severity: "neutral", classification: "Not classified", reviewFlags: [] },
        { ref: "O2", catalogId: "cv-092", name: "IL-6", domain: "Immune", unit: "pg/mL", series: [{ day: 0, value: "5.8" }, { day: 2, value: "74" }], severity: "neutral", classification: "Not classified", reviewFlags: [] },
      ],
      concerns: [{ id: "electrolyte_disturbance", title: "Possible electrolyte disturbance", observationRefs: ["O1"], priority: "prompt", supporting: [], contradicting: [], criteria: [], missing: [] }],
    };
    const r = validateClinicalAi({
      schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
      concerns: [{ concernId: "electrolyte_disturbance", explanation: "Potassium of 2.9 mmol/L indicates danger.", supporting: [], contradicting: [], alternatives: [], missingInformation: [], confirmationSteps: [] },
                 { concernId: "invented_concern", explanation: "x", supporting: [], contradicting: [], alternatives: [], missingInformation: [], confirmationSteps: [] }],
      crossDomain: [{ text: "Inflammation caused the potassium change.", observationRefs: ["O1", "O2"] }, { text: "Potassium changed.", observationRefs: ["O1"] }],
      lifestyle: [], uncertainties: [],
    }, packet);
    if (!r.ok) throw new Error(r.reason);
    expect(r.output.concerns[0]!.explanation).toBe("");
    expect(r.output.crossDomain).toEqual([]);
    expect(r.rejected.map((x) => x.reason).join("|")).toMatch(/number|not listed|causation|one domain/);
  });
});

// ------------------------------------------------------------------ report legend and charts
describe("P57.1 report legend and chart bands", () => {
  it("legend keeps clinical RED and HIGH review priority visually and textually distinct", () => {
    expect(legendProblems()).toEqual([]);
    const red = REPORT_LEGEND.find((e) => e.axis === "clinical" && e.value === "RED")!;
    const high = REPORT_LEGEND.find((e) => e.axis === "review" && e.value === "HIGH")!;
    expect(red.fill).not.toBeNull();
    expect(high.fill).toBeNull();
    expect(high.marker).not.toBe(red.marker);
    expect(high.text).toMatch(/not a clinical classification/);
  });
  it("a legend that fills a review marker is reported as misleading", () => {
    const bad = REPORT_LEGEND.map((e) => (e.axis === "review" && e.value === "HIGH" ? { ...e, fill: [185, 28, 28] as [number, number, number] } : e));
    expect(legendProblems(bad).join()).toMatch(/filled marker/);
  });
  it("charts draw reference bands only from criteria actually used in an approved classification", () => {
    expect(chartReferenceBands(null, CAND).bands).toEqual([]);
    expect(chartReferenceBands(classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8"), [], CAND), CAND).caption).toMatch(/no reference band/);
    const used = classifyWithCriteria(ctx("cv-071", "mmol/L", "5.8", { observationConditions: K_CONDS }), [approve(K)], CAND);
    const b = chartReferenceBands(used, CAND);
    expect(b.bands.length).toBe(3);
    expect(new Set(b.bands.map((x) => x.criterionId))).toEqual(new Set([K.id]));
  });
});
