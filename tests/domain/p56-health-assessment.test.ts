import { describe, expect, it } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import {
  AUTOMATED_DISCLOSURE,
  buildHealthAssessment,
  healthAssessmentPlainText,
} from "../../src/domain/health-intelligence/p56-health-assessment";
import { bundledPatternLibrary, validatePatternLibrary } from "../../src/domain/health-intelligence/p56-pattern-library";
import { buildHealthAssessmentDocument, createHealthAssessmentPdf } from "../../src/domain/health-intelligence/p56-health-report-pdf";
import { containsProhibitedName, redactProhibitedNames, reportAstronautName } from "../../src/domain/health-intelligence/report-identity-redaction";
import { buildBiomarkerAssessment, validateReferenceRegistry, type ReferenceRegistry, type VerifiedReference } from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { renderReportDocument, type PdfFactory, type PdfWriter, type ReportFonts } from "../../src/domain/health-intelligence/report-text-pdf";
import type { PreliminaryAssessment } from "../../src/domain/health-intelligence/preliminary-medical-assessment";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { V9_SCOPE, obs } from "./fixtures-v9-observations";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fontDir = join(ROOT, "node_modules/pdfjs-dist/standard_fonts");
const fonts: ReportFonts = {
  regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
  bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
};

const at = (d: number) => new Date(Date.UTC(2026, 8, d, 8, 0)).toISOString();
const sbp = (value: string, d: number) => obs({ metricId: "cv-005", originalUnit: "mmHg", value, observedAt: at(d) });
const dbp = (value: string, d: number) => obs({ metricId: "cv-006", originalUnit: "mmHg", value, observedAt: at(d) });
const hr = (value: string, d: number) => obs({ metricId: "cv-001", originalUnit: "bpm", value, observedAt: at(d) });

function assess(history: UnifiedObservation[], opts: { registry?: ReferenceRegistry; filters?: { from?: string; to?: string }; crew?: string; automated?: PreliminaryAssessment } = {}) {
  const unified = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: history, deviceRecords: [] }, V9_SCOPE, opts.filters ?? {}, "2026-11-08T12:00:00.000Z");
  const model = buildResearcherInterpretation(unified, buildScientificFindings(unified), []);
  const biomarkers = buildBiomarkerAssessment(unified, model, undefined, opts.registry ? { registry: opts.registry } : undefined);
  return buildHealthAssessment({
    unified,
    model,
    biomarkers,
    identity: { missionName: "MITO_DEMO_2026", crewDisplayName: opts.crew ?? "Alex Morgan" },
    automated: opts.automated ? { assessment: opts.automated, status: "ai_used", note: "test" } : null,
  });
}

describe("P56 health pattern library", () => {
  it("ships every pattern valid, with each exact catalog ID in exactly one pattern", () => {
    const lib = bundledPatternLibrary();
    expect(lib.excluded).toEqual([]);
    expect(lib.patterns.length).toBe(8);
    const ids = lib.patterns.flatMap((p) => p.members.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("excludes a pattern whose recommendation contains a dose", () => {
    const raw = JSON.parse(readFileSync(join(ROOT, "data/scientific/p56-health-pattern-library.v1.json"), "utf8"));
    raw.patterns[0].recommendations.concern[0].text = "Take 500 mg of potassium daily until the next examination.";
    const lib = validatePatternLibrary(raw);
    expect(lib.excluded.map((e) => e.reason)).toEqual(["recommendation contains a dose or amount"]);
  });
});

describe("P56 longitudinal assessment", () => {
  it("single examination: insufficient historical data, NEUTRAL, no warning, priority not determined", () => {
    const a = assess([sbp("118", 1), dbp("76", 1)]);
    const f = a.findings.find((x) => x.patternId === "cardiovascular_function")!;
    expect(f.state).toBe("baseline");
    expect(f.severity).toBe("neutral");
    expect(f.contributors.every((c) => c.trend.direction === "insufficient")).toBe(true);
    expect(a.warnings).toEqual([]);
    expect(a.followUp.level).toBe("not_determined");
  });

  it("computes the earliest-to-latest change across examinations without classifying it", () => {
    const a = assess([sbp("120", 1), sbp("130", 10)]);
    const c = a.findings[0]!.contributors.find((x) => x.metricId === "cv-005")!;
    expect(c.trend.direction).toBe("increase");
    expect(c.trend.absolute).toBe(10);
    expect(c.trend.percent).toBe(8.3);
    expect(c.severity).toBe("neutral");
    expect(a.findings[0]!.state).toBe("changed");
    expect(a.trends.map((t) => t.points.map((p) => p.value))).toEqual([[120, 130]]);
  });

  it("never treats readings on one calendar day as a trend", () => {
    const a = assess([obs({ metricId: "cv-005", originalUnit: "mmHg", value: "120", observedAt: "2026-09-01T07:00:00.000Z" }), obs({ metricId: "cv-005", originalUnit: "mmHg", value: "140", observedAt: "2026-09-01T19:00:00.000Z" })]);
    expect(a.findings[0]!.contributors[0]!.trend.direction).toBe("insufficient");
    expect(a.trends).toEqual([]);
  });

  it("uses only results inside the selected date range", () => {
    const a = assess([sbp("120", 1), sbp("130", 10), sbp("150", 20)], { filters: { from: "2026-09-05", to: "2026-09-25" } });
    const c = a.findings[0]!.contributors[0]!;
    expect(c.trend.earliest?.value).toBe("130");
    expect(c.trend.latest.value).toBe("150");
    expect(a.header.period).toBe("2026-09-05 to 2026-09-25");
  });

  it("colours a result only through a verified reference and sets follow-up priority from it", () => {
    const ref: VerifiedReference = {
      id: "test-ref-cv-001", environment: "production", missionId: null, metricId: "cv-001", unit: "bpm", domain: "cardiovascular",
      kind: "reference_interval", lower: 50, upper: 90, outsideSeverity: "cautionary", population: "TEST FIXTURE ONLY",
      astronautApplicability: "terrestrial_with_stated_limitations", applicabilityNote: "Terrestrial resting interval; spaceflight effects not accounted for (test fixture).",
      specimen: null, method: null, citation: { id: "t1", kind: "peer_reviewed", title: "Test-only reference", locator: "Table 1", url: null },
      verification: { status: "VERIFIED", verifiedBy: "Test Verifier", verifiedAt: "2026-11-07T00:00:00.000Z", verificationRef: "TEST-VERIFY-001" },
    };
    const registry = validateReferenceRegistry({ schema: "mitochondria.verified-reference-intervals.v1", version: 1, entries: [ref] });
    const a = assess([hr("95", 1)], { registry });
    expect(a.warnings.map((w) => w.severity)).toEqual(["amber"]);
    expect(a.followUp.level).toBe("moderate");
    expect(a.findings[0]!.state).toBe("validated_concern");
  });

  it("attaches automated notes only through validated observation references", () => {
    const automated: PreliminaryAssessment = {
      schemaVersion: "mitochondria.preliminary-medical-assessment.v1" as PreliminaryAssessment["schemaVersion"],
      origin: "ai_assisted",
      label: "test",
      model: "openai/test",
      sections: { abnormalFindings: [], physiologicalExplanations: [{ text: "Validated automated context note.", observationRefs: ["O1"], citationIds: [] }], differentialConsiderations: [], crossDomainRelationships: [], monitoringRecommendations: [], reviewPriorities: [] },
      uncertainties: [], missingTests: [], diagnosisStatus: "cannot_be_established", diagnosisStatement: "", confirmedDiagnoses: [], rejected: [],
    };
    const a = assess([sbp("118", 1)], { automated });
    expect(a.findings[0]!.why.automatedNotes).toEqual(["Validated automated context note."]);
    expect(a.generation.engine).toBe("deterministic_with_validated_ai_notes");
  });
});

describe("P56 identity and prohibited name", () => {
  it("redacts every form of the prohibited reviewer name from report text", () => {
    for (const t of ["Νικόλας", "Nikolas", "NIKOLAS", "Nikolaos", "Nicholas", "Νικόλαος", "PENDING_NIKOLAS_REVIEW", "Handbook v7 (Nikolas)", "Nikolas-governed context", "nikolasilvestros@gmail.com"])
      expect(containsProhibitedName(redactProhibitedNames(`x ${t} y`))).toBe(false);
    expect(redactProhibitedNames("PENDING_NIKOLAS_REVIEW")).toBe("PENDING_SCIENTIFIC_REVIEW");
  });

  it("uses only the selected crew member's name and withholds a name containing the prohibited name", () => {
    expect(assess([sbp("118", 1)], { crew: "Alex Morgan" }).header.astronaut).toBe("Alex Morgan");
    expect(reportAstronautName("Νικόλας Π.")).toBe("Crew member (display name withheld)");
  });
});

// ---------------- Owner-supplied synthetic exam (Alex Morgan, 2026-11-07) ----------------

describe("P56 Alex Morgan synthetic examination", () => {
  it("produces a concise report (≤4 pages) that names no prohibited reviewer and keeps the thrombus finding as recorded", async () => {
    const { extractPdfGeometry, repoPath } = await import("../documents/p42-pdf-helpers");
    const { documentLinesFromText, reconstructDocumentTables } = await import("@/domain/health-intelligence/document-table-reconstruction");
    const { classifyWithGovernedExtensions } = await import("@/domain/health-intelligence/unknown-biomarker-review");
    const demo = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/p40-mito-demo-active-catalog.v1.json"), "utf8")).entries as { demoId: string; displayName: string; unit: string; domain: string }[];
    const g = await extractPdfGeometry(repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf"));
    const recon = reconstructDocumentTables(documentLinesFromText(g.text, g.linePages, g.geometry));
    const history: UnifiedObservation[] = [];
    for (const o of recon.observations) {
      const value = o.value || o.rawValue;
      if (!value) continue;
      const c = classifyWithGovernedExtensions({ label: o.label, unit: o.unit }).classification;
      // Harness only: exact label + exact unit against the activated demo catalog fixture.
      const d = demo.find((e) => e.displayName === o.label.trim() && e.unit === o.unit.trim());
      const hit = c.status === "matched" ? { metricId: c.metricId, domain: c.domain } : d ? { metricId: d.demoId, domain: d.domain } : null;
      if (hit) history.push(obs({ metricId: hit.metricId, domain: hit.domain as UnifiedObservation["domain"], originalUnit: o.unit, value, observedAt: "2026-11-07T09:30:00.000Z" }));
    }
    expect(history.length).toBeGreaterThanOrEqual(56);
    const a = assess(history);
    expect(a.header.examinationDates).toEqual(["2026-11-07"]);
    expect(a.trends).toEqual([]);
    expect(a.warnings).toEqual([]);
    const thrombus = a.findings.flatMap((f) => f.contributors).find((c) => c.metricId === "cv-056");
    if (thrombus) {
      expect(thrombus.trend.latest.value).toBe("Present");
      expect(thrombus.severity).toBe("neutral");
    }
    const txt = healthAssessmentPlainText(a);
    expect(containsProhibitedName(txt)).toBe(false);
    expect(txt).toContain(AUTOMATED_DISCLOSURE);

    const doc = buildHealthAssessmentDocument(a);
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: false });
    pdf.addFileToVFS("R.ttf", fonts.regular);
    pdf.addFont("R.ttf", "LiberationSans", "normal");
    pdf.addFileToVFS("B.ttf", fonts.bold);
    pdf.addFont("B.ttf", "LiberationSans", "bold");
    const { pages } = renderReportDocument(doc, pdf as unknown as PdfWriter, { family: "LiberationSans", unicode: true, redact: true });
    expect(pages).toBeLessThanOrEqual(4);

    const out = await createHealthAssessmentPdf(a, { jsPDF: jsPDF as unknown as PdfFactory, fonts });
    expect(out.fontMode).toBe("unicode");
    if (process.env.P56_WRITE_PDF) writeFileSync(process.env.P56_WRITE_PDF, Buffer.from(await out.blob.arrayBuffer()));
  }, 60_000);
});
