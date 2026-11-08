/**
 * P57/P58 regression tests — approved reference criteria, preliminary clinical
 * assessment, AI validation, Ground Medical review, charts and adaptive PDF.
 *
 * The Alex Morgan series below is a reconstruction for testing only (values
 * from the owner briefs and the supplied 2026-11-07 PDF); it is never stored.
 * Approvals here are in-memory test objects, never real Researcher decisions.
 */
import { describe, expect, it } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { buildHealthAssessment } from "../../src/domain/health-intelligence/p56-health-assessment";
import { buildBiomarkerAssessment, type BiomarkerAssessmentReport } from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { bundledCriteriaRegistry, criterionFingerprint, type ApprovedCriterion } from "../../src/domain/health-intelligence/p57-reference-criteria";
import {
  CLINICAL_AI_SCHEMA_VERSION,
  buildClinicalPacket,
  buildPreliminaryClinicalAssessment,
  bundledConcernLibrary,
  clinicalPacketPrivacyProblem,
  concernReviewStatus,
  mergeClinicalAi,
  planClinicianDecision,
  validateClinicalAi,
} from "../../src/domain/health-intelligence/p58-clinical-reasoning";
import { buildProfessionalReport, professionalReportPlainText } from "../../src/domain/health-intelligence/p58-professional-report";
import { renderProfessional } from "../../src/domain/health-intelligence/p58-professional-pdf";
import { containsProhibitedName } from "../../src/domain/health-intelligence/report-identity-redaction";
import type { PdfFactory, ReportFonts } from "../../src/domain/health-intelligence/report-text-pdf";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { V9_SCOPE, obs } from "./fixtures-v9-observations";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fontDir = join(ROOT, "node_modules/pdfjs-dist/standard_fonts");
const fonts: ReportFonts = {
  regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
  bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
};
const at = (d: string) => `${d}T09:30:00.000Z`;
const o = (metricId: string, unit: string, value: string, d: string, domain: UnifiedObservation["domain"] = "cardiovascular") =>
  obs({ metricId, domain, originalUnit: unit, value, observedAt: at(d) });

/** Alex Morgan (synthetic reconstruction): P56.1/P58 brief values plus the 2026-11-07 PDF values. */
function alexSeries(): UnifiedObservation[] {
  return [
    o("cv-070", "mmol/L", "128", "2026-11-07"),
    o("cv-070", "mmol/L", "146", "2026-11-08"),
    o("cv-071", "mmol/L", "5.8", "2026-11-07"),
    o("cv-071", "mmol/L", "3.2", "2026-11-08"),
    o("cv-092", "pg/mL", "5.8", "2026-11-05"),
    o("cv-092", "pg/mL", "74", "2026-11-07"),
    o("cv-091", "mg/L", "28", "2026-11-07"),
    o("demo:ubt-12c22152", "ng/mL", "3.5", "2026-11-07", "bone"),
    o("demo:ubt-12c22152", "ng/mL", "31", "2026-11-08", "bone"),
    o("demo:ubt-7b25ce69", "ng/mL", "12", "2026-11-08", "bone"),
    o("cv-085", "%", "9.1", "2026-11-07"),
    o("cv-085", "%", "5.9", "2026-11-08"),
    o("cv-088", "mg/dL", "165", "2026-11-06"),
    o("cv-088", "mg/dL", "330", "2026-11-07"),
    o("cv-088", "mg/dL", "184", "2026-11-08"),
    o("cv-027", "ms", "24", "2026-11-06"),
    o("cv-027", "ms", "12", "2026-11-07"),
  ];
}

async function approve(id: string, conditions: string[], missionId = V9_SCOPE.missionId): Promise<ApprovedCriterion> {
  const criterion = bundledCriteriaRegistry().criteria.find((c) => c.id === id)!;
  return { criterion, fingerprint: await criterionFingerprint(criterion), missions: [{ missionId, conditions }], approvedAt: "2026-11-08T10:00:00.000Z", approverUserId: "test-researcher", approvalRef: `test-${id}` };
}

function build(history: UnifiedObservation[], criteria: ApprovedCriterion[] = []) {
  const inputs = { domainEntries: {}, unifiedObservations: history, deviceRecords: [] };
  const unified = buildUnifiedHealthReport(inputs, V9_SCOPE, { from: "2026-11-01", to: "2026-11-08" }, "2026-11-08T12:00:00.000Z");
  const model = buildResearcherInterpretation(unified, buildScientificFindings(unified), []);
  const biomarkers: BiomarkerAssessmentReport = buildBiomarkerAssessment(unified, model, undefined, { criteria });
  const assessment = buildHealthAssessment({ unified, model, biomarkers, identity: { missionName: "MITO_DEMO_2026", crewDisplayName: "Alex Morgan" }, scopeHistory: unified.rows });
  return { biomarkers, assessment };
}
const entry = (b: BiomarkerAssessmentReport, id: string) => b.entries.find((e) => e.metricId === id)!;

describe("P57 approved reference criteria", () => {
  it("without Researcher approval every result stays NEUTRAL with criteria pending", () => {
    const { biomarkers } = build([o("cv-085", "%", "9.1", "2026-11-07")]);
    const e = entry(biomarkers, "cv-085");
    expect(e.classification.severity).toBe("neutral");
    expect(e.classification.reason).toBe("criteria_pending");
    expect(biomarkers.criteria).toEqual({ approved: 0, classified: 0 });
  });

  it("an approved, applicable HbA1c criterion classifies 9.1 % as red with its source", async () => {
    const { biomarkers } = build([o("cv-085", "%", "9.1", "2026-11-07")], [await approve("p57-ada2026-hba1c-categories", ["nonpregnant", "ngsp_method"])]);
    const e = entry(biomarkers, "cv-085");
    expect(e.classification.severity).toBe("red");
    expect(e.classification.reason).toBe("approved_criterion");
    expect(e.referenceCitation).toContain("test-p57-ada2026-hba1c-categories");
    expect(biomarkers.criteria.classified).toBe(1);
  });

  it("an unattested mission condition keeps the result neutral", async () => {
    const { biomarkers } = build([o("cv-085", "%", "9.1", "2026-11-07")], [await approve("p57-ada2026-hba1c-categories", ["nonpregnant"])]);
    expect(entry(biomarkers, "cv-085").classification.reason).toBe("criteria_not_applicable");
  });

  it("an approval for another mission never applies", async () => {
    const { biomarkers } = build([o("cv-085", "%", "9.1", "2026-11-07")], [await approve("p57-ada2026-hba1c-categories", ["nonpregnant", "ngsp_method"], "other-mission")]);
    expect(entry(biomarkers, "cv-085").classification.severity).toBe("neutral");
  });

  it("HbA1c 9.1 → 5.9 % within one day is held for measurement consistency even when approved", async () => {
    const { biomarkers } = build(alexSeries(), [await approve("p57-ada2026-hba1c-categories", ["nonpregnant", "ngsp_method"])]);
    const e = entry(biomarkers, "cv-085");
    expect(e.classification.reason).toBe("criteria_held");
    expect(e.classification.severity).toBe("neutral");
  });

  it("triglycerides need recorded fasting status, so the NHLBI category is not applied", async () => {
    const { biomarkers } = build(alexSeries(), [await approve("p57-nhlbi-triglyceride-categories", ["adult_crew"])]);
    expect(entry(biomarkers, "cv-088").classification.reason).toBe("criteria_not_applicable");
  });
});

describe("P58 preliminary clinical assessment (deterministic)", () => {
  const { biomarkers, assessment } = build(alexSeries());
  const clinical = buildPreliminaryClinicalAssessment({ assessment, biomarkers });
  const byId = (id: string) => clinical.concerns.find((c) => c.concernId === id)!;

  it("the governed concern library is valid and pending scientific review", () => {
    const lib = bundledConcernLibrary();
    expect(lib.excluded).toEqual([]);
    expect(lib.status).toBe("PENDING_SCIENTIFIC_REVIEW");
    expect(lib.concerns.length).toBe(6);
  });

  it("lists the supported concerns with priority, never a diagnosis", () => {
    const ids = clinical.concerns.map((c) => c.concernId);
    for (const id of ["electrolyte_disturbance", "triglyceride_elevation", "dysglycemia", "systemic_inflammation", "bone_turnover_change", "autonomic_recovery_strain"]) expect(ids).toContain(id);
    expect(byId("electrolyte_disturbance").priority).toBe("prompt");
    expect(byId("dysglycemia").priority).toBe("measurement_check");
    expect(clinical.diagnosisStatement).toMatch(/not diagnoses/);
    const text = JSON.stringify(clinical.concerns);
    expect(text).not.toMatch(/diagnosed with|\bprobabilit/i);
  });

  it("states supporting and contradicting evidence from the full series", () => {
    const tg = byId("triglyceride_elevation");
    expect(tg.supporting.join(" ")).toContain("330");
    expect(tg.contradicting.join(" ")).toMatch(/fell back to 184 mg\/dL .* 330 mg\/dL peak/);
    expect(byId("dysglycemia").contradicting.join(" ")).toMatch(/contradict each other/);
  });

  it("diagnostic criteria are never satisfied before approval", () => {
    const crit = byId("dysglycemia").criteria;
    expect(crit.length).toBeGreaterThan(0);
    expect(crit.every((c) => c.status === "not_evaluable")).toBe(true);
  });

  it("electrolyte recommendations require Ground Medical review before any fluid or diet change", () => {
    const recs = byId("electrolyte_disturbance").recommendations;
    expect(recs.every((r) => r.authorization === "clinician_required")).toBe(true);
  });

  it("missing tests and context are listed (fasting status, kidney function)", () => {
    expect(byId("dysglycemia").missing.join(" ")).toMatch(/Fasting state/);
    expect(byId("electrolyte_disturbance").missing.join(" ")).toMatch(/Kidney function/);
  });

  it("cross-domain co-observation never claims causation", () => {
    expect(clinical.crossDomain[0]!.text).toMatch(/does not show that one caused another/);
  });
});

describe("P58 AI validation and Ground Medical review", () => {
  const { biomarkers, assessment } = build(alexSeries());
  const clinical = buildPreliminaryClinicalAssessment({ assessment, biomarkers });
  const packet = buildClinicalPacket(assessment, clinical);

  it("the packet is de-identified (no dates or identifiers)", () => {
    expect(clinicalPacketPrivacyProblem(packet)).toBeNull();
    expect(JSON.stringify(packet)).not.toContain("Alex");
  });

  it("drops probabilities, doses, invented numbers, causation and unknown concerns; keeps valid text", () => {
    const r = validateClinicalAi(
      {
        schemaVersion: CLINICAL_AI_SCHEMA_VERSION,
        concerns: [
          { concernId: "triglyceride_elevation", explanation: "Triglycerides peaked at 330 mg/dL and fell to 184 mg/dL, which fits a non-fasting sample.", supporting: ["There is an 80% probability of hypertriglyceridemia."], contradicting: [], alternatives: ["Take 500 mg fish oil daily."], missingInformation: ["A value of 412 mg/dL would be informative."], confirmationSteps: [] },
          { concernId: "made_up", explanation: "x", supporting: [], contradicting: [], alternatives: [], missingInformation: [], confirmationSteps: [] },
        ],
        crossDomain: [{ text: "Low potassium caused the HRV fall.", observationRefs: ["O1", "O9"] }],
        lifestyle: [{ concernId: "electrolyte_disturbance", category: "hydration", text: "Drink more water." }],
        uncertainties: [],
      },
      packet,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const tg = r.output.concerns.find((c) => c.concernId === "triglyceride_elevation")!;
    expect(tg.explanation).toContain("330");
    expect(tg.supporting).toEqual([]);
    expect(tg.alternatives).toEqual([]);
    expect(tg.missingInformation).toEqual([]);
    expect(r.output.concerns.some((c) => c.concernId === "made_up")).toBe(false);
    expect(r.output.lifestyle).toEqual([]);
    expect(r.rejected.map((x) => x.reason).join("|")).toMatch(/probability.*dose|dose.*probability/s);
    const merged = mergeClinicalAi(clinical, packet, { ...r, model: "test-model" });
    const c = merged.concerns.find((x) => x.concernId === "triglyceride_elevation")!;
    expect(c.priority).toBe(clinical.concerns.find((x) => x.concernId === "triglyceride_elevation")!.priority);
    expect(c.aiNotes.length).toBe(1);
  });

  it("only Ground Medical for the exact scope can review; changed evidence makes a review stale", () => {
    const scope = { missionId: V9_SCOPE.missionId, crewMemberId: V9_SCOPE.crewMemberId, provenance: "synthetic" as const };
    const concern = clinical.concerns[0]!;
    const denied = planClinicianDecision(concern, { userId: "u1", rolesForScope: ["researcher"], scope, now: "2026-11-08T12:00:00.000Z" }, { decision: "accept", text: "Agree with the listed concern." });
    expect(denied.ok).toBe(false);
    const ok = planClinicianDecision(concern, { userId: "u1", rolesForScope: ["ground_medical"], scope, now: "2026-11-08T12:00:00.000Z" }, { decision: "amend", text: "Repeat electrolytes urgently and obtain an ECG today." });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(concernReviewStatus(concern, [ok.decision], scope).status).toBe("amended");
    expect(concernReviewStatus({ ...concern, fingerprint: "changed" }, [ok.decision], scope).status).toBe("stale");
    const dose = planClinicianDecision(concern, { userId: "u1", rolesForScope: ["ground_medical"], scope, now: "2026-11-08T12:00:00.000Z" }, { decision: "add", text: "Start potassium 20 mmol twice a day for one week." });
    expect(dose.ok).toBe(false);
  });
});

describe("P58 charts and adaptive professional PDF", () => {
  const { biomarkers, assessment } = build(alexSeries());
  const report = buildProfessionalReport({ assessment, biomarkers });

  it("charts every prioritised comparable series with the triglyceride peak and no unapproved reference band", () => {
    const tg = report.charts.charts.find((c) => c.metricId === "cv-088")!;
    expect(tg.kind).toBe("line");
    expect(tg.points.map((p) => p.value)).toEqual([165, 330, 184]);
    expect(tg.points[1]!.annotation).toBe("peak");
    expect(tg.referenceLines).toEqual([]);
    for (const id of ["cv-070", "cv-071", "cv-085", "cv-092", "demo:ubt-12c22152", "cv-027"]) expect(report.charts.charts.some((c) => c.metricId === id && c.kind === "line")).toBe(true);
    expect(report.charts.charts.some((c) => c.metricId === "demo:ubt-7b25ce69" && c.kind === "single")).toBe(true);
  });

  it("Evidence ID is deterministic for the same evidence and changes with the evidence", () => {
    expect(buildProfessionalReport({ assessment, biomarkers }).evidenceId).toBe(report.evidenceId);
    const other = build(alexSeries().slice(1));
    expect(buildProfessionalReport(other).evidenceId).not.toBe(report.evidenceId);
    expect(report.evidenceId).toMatch(/^MITO-EV-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("recommendations are not duplicated", () => {
    const texts = report.recommendations.map((r) => r.text.toLowerCase());
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("renders a searchable multi-page PDF without a page cap, reviewer name or doses", () => {
    const pdf = new (jsPDF as unknown as PdfFactory)({ unit: "mm", format: "a4", compress: true });
    const r = renderProfessional(pdf as never, fonts, report, { fixedDate: "2026-11-08T12:00:00.000Z" });
    expect(r.pages).toBeGreaterThanOrEqual(5);
    const outDir = "/tmp/p58";
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "alex-morgan-p58.pdf"), new Uint8Array(pdf.output("arraybuffer" as never) as unknown as ArrayBuffer));
    const text = professionalReportPlainText(report);
    expect(text).toContain("PRELIMINARY CLINICAL ASSESSMENT — PENDING GROUND MEDICAL REVIEW");
    expect(text).toContain(report.evidenceId);
    expect(containsProhibitedName(text)).toBe(false);
    expect(text).not.toMatch(/\b\d+\s?(?:mg|mcg|iu)\b(?!\s*\/)/i);
  });
});
