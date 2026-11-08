/**
 * P56.1 regression tests — clinical interpretation, review prioritization,
 * complete longitudinal analysis and compact PDF.
 *
 * Scenario fixtures are reconstructions for testing only: the 2026-11-07
 * Alex Morgan examination is parsed from the owner-supplied PDF, and the
 * other examination dates use the values stated in the P56.1 brief. They are
 * never written to any store.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { REVIEW_FLAG_LABEL, buildHealthAssessment, healthAssessmentPlainText, type HealthAssessment } from "../../src/domain/health-intelligence/p56-health-assessment";
import { bundledReviewRules, profileText, seriesProfile, validateReviewRules } from "../../src/domain/health-intelligence/p56-longitudinal-profile";
import { MAX_ASSESSMENT_PAGES, buildHealthAssessmentDocument, createHealthAssessmentPdf } from "../../src/domain/health-intelligence/p56-health-report-pdf";
import { buildBiomarkerAssessment, validateReferenceRegistry, type VerifiedReference } from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { containsProhibitedName } from "../../src/domain/health-intelligence/report-identity-redaction";
import type { PdfFactory, ReportFonts } from "../../src/domain/health-intelligence/report-text-pdf";
import type { ExamPoint } from "../../src/domain/health-intelligence/longitudinal-comparison";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { V9_SCOPE, obs } from "./fixtures-v9-observations";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fontDir = join(ROOT, "node_modules/pdfjs-dist/standard_fonts");
const fonts: ReportFonts = {
  regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
  bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
};

type Opts = { from?: string; to?: string; registry?: ReturnType<typeof validateReferenceRegistry>; history?: UnifiedObservation[] };
function assess(history: UnifiedObservation[], opts: Opts = {}): HealthAssessment {
  const filters = { ...(opts.from ? { from: opts.from } : {}), ...(opts.to ? { to: opts.to } : {}) };
  const inputs = { domainEntries: {}, unifiedObservations: history, deviceRecords: [] };
  const unified = buildUnifiedHealthReport(inputs, V9_SCOPE, filters, "2026-11-08T12:00:00.000Z");
  const model = buildResearcherInterpretation(unified, buildScientificFindings(unified), []);
  const biomarkers = buildBiomarkerAssessment(unified, model, undefined, opts.registry ? { registry: opts.registry } : undefined);
  const scopeHistory = buildUnifiedHealthReport(inputs, V9_SCOPE, {}, "2026-11-08T12:00:00.000Z").rows;
  return buildHealthAssessment({ unified, model, biomarkers, identity: { missionName: "MITO_DEMO_2026", crewDisplayName: "Alex Morgan" }, scopeHistory });
}

const at = (d: string) => `${d}T09:30:00.000Z`;
const o = (metricId: string, unit: string, value: string, d: string, domain: UnifiedObservation["domain"] = "cardiovascular") =>
  obs({ metricId, domain, originalUnit: unit, value, observedAt: at(d) });

/** Values stated in the P56.1 brief (Alex Morgan, synthetic). */
function briefSeries(): UnifiedObservation[] {
  return [
    o("cv-070", "mmol/L", "128", "2026-11-07"),
    o("cv-070", "mmol/L", "146", "2026-11-08"),
    o("cv-071", "mmol/L", "5.8", "2026-11-07"),
    o("cv-071", "mmol/L", "3.2", "2026-11-08"),
    o("cv-092", "pg/mL", "5.8", "2026-11-05"),
    o("cv-092", "pg/mL", "74", "2026-11-07"),
    o("demo:ubt-12c22152", "ng/mL", "3.5", "2026-11-07", "bone"),
    o("demo:ubt-12c22152", "ng/mL", "31", "2026-11-08", "bone"),
    o("demo:ubt-7b25ce69", "ng/mL", "12", "2026-11-08", "bone"),
    o("cv-085", "%", "9.1", "2026-11-07"),
    o("cv-085", "%", "5.9", "2026-11-08"),
    o("cv-088", "mg/dL", "165", "2026-11-06"),
    o("cv-088", "mg/dL", "330", "2026-11-07"),
    o("cv-088", "mg/dL", "184", "2026-11-08"),
  ];
}
const contributor = (a: HealthAssessment, id: string) => a.findings.flatMap((f) => f.contributors).find((c) => c.metricId === id)!;
const finding = (a: HealthAssessment, id: string) => a.findings.find((f) => f.patternId === id)!;

describe("P56.1 review rules file", () => {
  it("ships valid and pending scientific review; a dose in guidance disables every rule", () => {
    const { rules, problem } = bundledReviewRules();
    expect(problem).toBeNull();
    expect(rules!.status).toBe("PENDING_SCIENTIFIC_REVIEW");
    const raw = JSON.parse(readFileSync(join(ROOT, "data/scientific/p56-review-priority-rules.v1.json"), "utf8"));
    raw.patternGuidance.fluid_electrolyte_renal.recommendations[0].text = "Take 20 mmol potassium twice daily until the next examination.";
    expect(validateReviewRules(raw).rules).toBeNull();
  });
});

describe("P56.1 complete longitudinal profile", () => {
  const pt = (day: string, v: number): ExamPoint => ({ key: day, at: day, precision: "date", day, readings: [], repeat: "single", value: v, valueText: String(v), decimals: 0 });
  it("identifies the intermediate triglyceride maximum instead of only first and last", () => {
    const p = seriesProfile([pt("2026-11-06", 165), pt("2026-11-07", 330), pt("2026-11-08", 184)])!;
    expect(p.pattern).toBe("transient_peak");
    expect(p.max).toMatchObject({ value: 330, day: "2026-11-07" });
    expect(p.min).toMatchObject({ value: 165, day: "2026-11-06" });
    expect(p.percent).toBe(11.5);
    expect(p.reversals).toBe(1);
    expect(p.steps.map((s) => s.percent)).toEqual([100, -44.2]);
    expect(profileText(p, "mg/dL")).toContain("Peaked at 330 mg/dL on 2026-11-07");
  });
  it("detects reversals, sustained changes and never interpolates", () => {
    expect(seriesProfile([pt("2026-11-01", 1), pt("2026-11-02", 3), pt("2026-11-03", 1), pt("2026-11-04", 3)])!).toMatchObject({ pattern: "fluctuating", reversals: 2 });
    const s = seriesProfile([pt("2026-11-01", 1), pt("2026-11-03", 2), pt("2026-11-08", 4)])!;
    expect(s.pattern).toBe("sustained_increase");
    expect(s.points).toHaveLength(3);
    expect(s.steps.map((x) => x.days)).toEqual([2, 5]);
  });
});

describe("P56.1 brief test cases (Alex Morgan, synthetic)", () => {
  const a = assess(briefSeries(), { from: "2026-11-01", to: "2026-11-08" });

  it("electrolytes: exact percentages, priority review, cross-marker statement, never classified abnormal", () => {
    const na = contributor(a, "cv-070");
    const k = contributor(a, "cv-071");
    expect(na.trend.percent).toBe(14.1);
    expect(k.trend.percent).toBe(-44.8);
    expect(na.severity).toBe("neutral");
    expect(k.severity).toBe("neutral");
    expect(na.review.flags.map((f) => f.ruleId)).toEqual(["P561-R3-tightly-regulated"]);
    const f = finding(a, "fluid_electrolyte_renal");
    expect(f.reviewPriority).toBe("priority_review");
    expect(f.combined).toContain("in opposite directions");
    expect(f.interpretation).toMatch(/measurement reliability, collection conditions and clinical context/);
    const rec = a.recommendations.find((r) => r.findingIds.includes(f.id) && r.category === "ground_medical")!;
    expect(rec.priority).toBe(true);
    expect(rec.text).toMatch(/rather than deferred to the next routine examination/);
  });

  it("IL-6: +1175.9% flagged for review without diagnosing infection", () => {
    const il6 = contributor(a, "cv-092");
    expect(il6.trend.percent).toBe(1175.9);
    expect(il6.review.flags.map((f) => f.ruleId)).toEqual(["P561-R1-large-change"]);
    const f = finding(a, "inflammation_immune");
    expect(f.interpretation).toMatch(/cannot establish infection/);
    expect(f.severity).toBe("neutral");
  });

  it("bone: osteocalcin +785.7% and vitamin D explained together, no osteoporosis diagnosis", () => {
    expect(contributor(a, "demo:ubt-12c22152").trend.percent).toBe(785.7);
    const f = finding(a, "bone_mineral");
    expect(f.contributors.map((c) => c.metricId)).toContain("demo:ubt-7b25ce69");
    expect(f.interpretation).toMatch(/cannot establish bone loss or osteoporosis/);
    expect(f.conditions.every((c) => c.status === "not_assessable")).toBe(true);
  });

  it("HbA1c: mathematically correct, not biologically expected over one day, never called an improvement", () => {
    const h = contributor(a, "cv-085");
    expect(h.trend.percent).toBe(-35.2);
    expect(h.review.flags.map((f) => [f.ruleId, f.kind])).toEqual([["P561-R4-slow-marker-hba1c", "data_quality"]]);
    expect(h.review.plausibility).toBe("not_expected_over_interval");
    expect(h.interpretability.clinical).toMatch(/Not clinically interpretable/);
    expect(finding(a, "cardiometabolic").interpretation).toMatch(/mathematically correct/);
    expect(healthAssessmentPlainText(a)).not.toMatch(/improve/i);
  });

  it("triglycerides: reports the 330 mg/dL intermediate peak, not only 165 → 184", () => {
    const t = contributor(a, "cv-088");
    expect(t.trend.pattern).toBe("transient_peak");
    expect(t.trend.text).toContain("330");
    expect(t.review.flags.map((f) => f.ruleId).sort()).toEqual(["P561-R1-large-change", "P561-R2-transient-extreme"]);
    expect(a.trends.find((x) => x.name === "Triglycerides")?.points.map((p) => p.value)).toEqual([165, 330, 184]);
  });

  it("separates validated alerts from review flags; no invented severity", () => {
    expect(a.warnings).toEqual([]);
    expect(a.priorities.validatedAlerts).toEqual([]);
    expect(a.priorities.reviewRequired.length).toBeGreaterThanOrEqual(4);
    expect(a.priorities.dataQuality.some((i) => i.text.startsWith("HbA1c"))).toBe(true);
    expect(a.followUp.level).toBe("review_required");
    expect(a.followUp.clinicalSeverity).toMatch(/^Not determined/);
    expect(a.warningsStatement).toMatch(/does not mean there is no health concern/);
    expect(a.keyFindings[0]!.review).toBe("priority_review");
  });

  it("every recommendation is traceable to a finding and never contains a dose", () => {
    for (const r of a.recommendations) {
      expect(r.findingIds.length).toBeGreaterThan(0);
      for (const id of r.findingIds) expect(a.findings.some((f) => f.id === id)).toBe(true);
      expect(r.text).not.toMatch(/\b\d+\s*(?:mg|µg|mcg|iu|mmol)\b/i);
    }
  });

  it("states the general limitations once (methodology), not in every finding", () => {
    const txt = healthAssessmentPlainText(a);
    expect(txt.match(/do not show that one caused the other/g)?.length).toBe(1);
    expect(txt.match(/Specimen, laboratory method and collection conditions are not recorded/g)?.length).toBe(1);
  });
});

describe("P56.1 classification and date handling", () => {
  it("RED from an approved reference applies even without a previous value, in red text", async () => {
    const ref: VerifiedReference = {
      id: "test-ref-cv-071", environment: "production", missionId: null, metricId: "cv-071", unit: "mmol/L", domain: "cardiovascular",
      kind: "reference_interval", lower: 3.5, upper: 5.0, outsideSeverity: "clinically_concerning", population: "TEST FIXTURE ONLY",
      astronautApplicability: "terrestrial_with_stated_limitations", applicabilityNote: "Test-only interval used to exercise the classification path; not a real criterion.",
      specimen: null, method: null, citation: { id: "t1", kind: "peer_reviewed", title: "Test-only reference", locator: "Table 1", url: null },
      verification: { status: "VERIFIED", verifiedBy: "Test Verifier", verifiedAt: "2026-11-07T00:00:00.000Z", verificationRef: "TEST-VERIFY-071" },
    };
    const registry = validateReferenceRegistry({ schema: "mitochondria.verified-reference-intervals.v1", version: 1, entries: [ref] });
    const a = assess([o("cv-071", "mmol/L", "3.2", "2026-11-08"), o("cv-070", "mmol/L", "140", "2026-11-08")], { registry });
    expect(contributor(a, "cv-071").severity).toBe("red");
    expect(contributor(a, "cv-070").severity).toBe("neutral");
    expect(a.followUp.level).toBe("high");
    const doc = buildHealthAssessmentDocument(a);
    const redH3 = doc.blocks.find((b) => b.kind === "h3" && b.tone === "red");
    expect(redH3 && "text" in redH3 ? redH3.text : "").toContain("(!!) RED");
    expect(doc.blocks.some((b) => b.kind === "p" && b.tone === "red" && b.text.startsWith("What changed"))).toBe(true);
  });

  it("NORMAL only when every result is within verified criteria", () => {
    const ref: VerifiedReference = {
      id: "test-ref-cv-070", environment: "production", missionId: null, metricId: "cv-070", unit: "mmol/L", domain: "cardiovascular",
      kind: "reference_interval", lower: 135, upper: 145, outsideSeverity: "cautionary", population: "TEST FIXTURE ONLY",
      astronautApplicability: "terrestrial_with_stated_limitations", applicabilityNote: "Test-only interval used to exercise the classification path; not a real criterion.",
      specimen: null, method: null, citation: { id: "t2", kind: "peer_reviewed", title: "Test-only reference", locator: "Table 2", url: null },
      verification: { status: "VERIFIED", verifiedBy: "Test Verifier", verifiedAt: "2026-11-07T00:00:00.000Z", verificationRef: "TEST-VERIFY-070" },
    };
    const registry = validateReferenceRegistry({ schema: "mitochondria.verified-reference-intervals.v1", version: 1, entries: [ref] });
    const a = assess([o("cv-070", "mmol/L", "140", "2026-11-08")], { registry });
    expect(contributor(a, "cv-070").severity).toBe("normal");
    expect(a.followUp.level).toBe("routine");
  });

  it("an unknown biomarker outside any relationship group still gets its review flag", () => {
    const a = assess([o("cv-999-unknown", "U/L", "10", "2026-11-05"), o("cv-999-unknown", "U/L", "40", "2026-11-08")]);
    expect(a.otherResults.count).toBe(1);
    expect(a.priorities.reviewRequired.map((i) => i.findingId)).toEqual(["other"]);
  });

  it("filters by date and reports a key measurement measured outside the period", () => {
    const a = assess([...briefSeries(), o("demo:ubt-5630390c", "mg/dL", "0.9", "2026-10-20", "cardiovascular")], { from: "2026-11-08", to: "2026-11-08" });
    expect(a.header.examinationDates).toEqual(["2026-11-08"]);
    expect(a.trends).toEqual([]);
    const f = finding(a, "fluid_electrolyte_renal");
    expect(f.missingDetail.find((m) => m.label.startsWith("kidney"))).toMatchObject({ status: "outside_period" });
    expect(f.missingDetail.find((m) => m.label.startsWith("kidney"))!.text).toContain("2026-10-20");
  });

  it("keeps mission and crew isolation: another crew member's rows never enter the assessment", () => {
    const foreign = { ...o("cv-070", "mmol/L", "100", "2026-11-06"), crewMemberId: "crew-b" };
    const a = assess([...briefSeries(), foreign], { from: "2026-11-01", to: "2026-11-08" });
    expect(contributor(a, "cv-070").trend.profile!.points.map((p) => p.value)).toEqual([128, 146]);
  });
});

// ---------------- Scenario reconstructions with the owner-supplied PDF ----------------

async function examHistory(): Promise<UnifiedObservation[]> {
  const { extractPdfGeometry, repoPath } = await import("../documents/p42-pdf-helpers");
  const { documentLinesFromText, reconstructDocumentTables } = await import("@/domain/health-intelligence/document-table-reconstruction");
  const { classifyWithGovernedExtensions } = await import("@/domain/health-intelligence/unknown-biomarker-review");
  const demo = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/p40-mito-demo-active-catalog.v1.json"), "utf8")).entries as { demoId: string; displayName: string; unit: string; domain: string }[];
  const g = await extractPdfGeometry(repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf"));
  const recon = reconstructDocumentTables(documentLinesFromText(g.text, g.linePages, g.geometry));
  const out: UnifiedObservation[] = [];
  for (const r of recon.observations) {
    const value = r.value || r.rawValue;
    if (!value) continue;
    const c = classifyWithGovernedExtensions({ label: r.label, unit: r.unit }).classification;
    const d = demo.find((e) => e.displayName === r.label.trim() && e.unit === r.unit.trim());
    const hit = c.status === "matched" ? { metricId: c.metricId, domain: c.domain } : d ? { metricId: d.demoId, domain: d.domain } : null;
    if (hit) out.push(obs({ metricId: hit.metricId, domain: hit.domain as UnifiedObservation["domain"], originalUnit: r.unit, value, observedAt: at("2026-11-07") }));
  }
  // Brief values for the other examination dates (the 2026-11-07 values come from the PDF itself).
  return [...out, ...briefSeries().filter((x) => !x.observedAt.startsWith("2026-11-07"))];
}

async function renderPdf(a: HealthAssessment, name: string) {
  const out = await createHealthAssessmentPdf(a, { jsPDF: jsPDF as unknown as PdfFactory, fonts });
  if (process.env.P561_PDF_DIR) writeFileSync(join(process.env.P561_PDF_DIR, name), Buffer.from(await out.blob.arrayBuffer()));
  return out;
}

describe("P56.1 Alex Morgan scenarios (PDF pagination and accessibility)", () => {
  it("Scenario A — single day 2026-11-08: ≤4 pages, no charts, flags need comparable history", async () => {
    const a = assess(await examHistory(), { from: "2026-11-08", to: "2026-11-08" });
    expect(a.header.examinationDates).toEqual(["2026-11-08"]);
    expect(a.trends).toEqual([]);
    expect(a.priorities.reviewRequired).toEqual([]);
    expect(buildHealthAssessmentDocument(a).blocks.some((b) => b.kind === "chart")).toBe(false);
    const out = await renderPdf(a, "P56.1_Scenario_A_single_day.pdf");
    expect(out.pages).toBeLessThanOrEqual(MAX_ASSESSMENT_PAGES);
    expect(out.pageException).toBe(false);
  }, 60_000);

  it("Scenario B — 2026-11-01 to 2026-11-08: four dates, review flags, ≤4 pages, accessible text markers", async () => {
    const a = assess(await examHistory(), { from: "2026-11-01", to: "2026-11-08" });
    expect(a.header.examinationDates).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    for (const id of ["cv-070", "cv-071", "cv-092", "cv-085", "cv-088"]) expect(contributor(a, id).review.flags.length).toBeGreaterThan(0);
    expect(contributor(a, "cv-088").trend.text).toContain("330");
    const out = await renderPdf(a, "P56.1_Scenario_B_multi_day.pdf");
    expect(out.pages).toBeLessThanOrEqual(MAX_ASSESSMENT_PAGES);
    expect(out.fontMode).toBe("unicode");
    const raw = Buffer.from(await out.blob.arrayBuffer()).toString("latin1");
    expect(raw).toContain("/Title");
    // Review flags carry printed text markers, so meaning never depends on colour alone.
    const doc = buildHealthAssessmentDocument(a, out.compaction);
    const reviewBullets = doc.blocks.filter((b) => b.kind === "bullets" && b.tones?.includes("review"));
    for (const b of reviewBullets) if (b.kind === "bullets") b.items.forEach((t, i) => b.tones?.[i] === "review" && !/^R\d+ /.test(t) && expect(t).toMatch(/^\[(REVIEW|DATA CHECK)\]/));
    const txt = healthAssessmentPlainText(a);
    expect(txt).toContain(REVIEW_FLAG_LABEL);
    expect(containsProhibitedName(txt)).toBe(false);
  }, 60_000);
});

describe("P56.1 single-day provenance", () => {
  it("says which single-day markers have readings outside the period instead of implying no history", () => {
    const a = assess(briefSeries(), { from: "2026-11-08", to: "2026-11-08" });
    expect(a.trends).toEqual([]);
    expect(a.completeness).toMatch(/also have readings outside the selected period \(.*Sodium.*\)/);
  });
});
