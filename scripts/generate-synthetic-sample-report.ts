/**
 * P36.8.2 — deterministic public evaluator sample.
 *
 * Builds the sample Astronaut Health Report through the SAME pipeline as the
 * in-app Download PDF (buildUnifiedHealthReport -> buildScientificFindings ->
 * buildReportDocument / renderReportDocument via createTextReportPdf), using
 * synthetic-only fixtures defined below. No backend, no private data.
 *
 * The red rows are DEMONSTRATION_ONLY annotations (accepted only because the
 * scope is synthetic and allowDemonstration is set); they are not approved
 * medical decisions.
 *
 * Run: bun scripts/generate-synthetic-sample-report.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { createTextReportPdf, type ReportFonts } from "../src/domain/health-intelligence/report-text-pdf";
import { buildUnifiedHealthReport } from "../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../src/domain/health-intelligence/scientific-findings";
import { buildScientificHealthSummary } from "../src/domain/health-intelligence/scientific-health-summary";
import { buildHealthHistoryReport } from "../src/domain/health-intelligence/health-history-report";
import { summarizeAttestations } from "../src/domain/health-intelligence/evidence-attestation";
import { UNIFIED_OBSERVATION_SCHEMA, type UnifiedObservation } from "../src/domain/health-intelligence/observation-envelope";
import type { AdverseAssessmentInput } from "../src/domain/health-intelligence/adverse-annotations";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "docs/competition/MITOCHONDRIA_Synthetic_Astronaut_Health_Report_SAMPLE.pdf");
const FIXED_DATE = new Date("2026-11-06T00:00:00.000Z");
const scope = { missionId: "synthetic-sample-mission", crewMemberId: "synthetic-crew-01", provenance: "synthetic" as const };

const spec: [string, UnifiedObservation["domain"], string, string[]][] = [
  ["cv-001", "cardiovascular", "bpm", ["58", "61", "64", "72"]],
  ["cv-027", "cardiovascular", "ms", ["62", "55", "48"]],
  ["bone-001", "bone", "pg/mL", ["300", "360"]],
  ["IMM-001", "immune", "10^9/L", ["6.1", "5.4"]],
  ["BSC-002", "behavioral", "%", ["88", "81"]],
];

const observations: UnifiedObservation[] = spec.flatMap(([metricId, domain, unit, values], m) =>
  values.map((value, i) => ({
    schema: UNIFIED_OBSERVATION_SCHEMA,
    id: `synthetic-sample-${metricId}-${i + 1}`,
    missionId: scope.missionId,
    crewMemberId: scope.crewMemberId,
    metricId,
    domain,
    value,
    originalUnit: unit,
    observedAt: new Date(Date.UTC(2026, 8, 1 + i * 14, 7, 30 + m)).toISOString(),
    source: { kind: "csv", label: "CSV: synthetic-sample-kit.csv", documentName: "synthetic-sample-kit.csv", documentSha256: "0".repeat(64), excerpt: `${metricId},${value},${unit}` },
    provenance: "synthetic",
    quality: { reviewerConfirmed: true },
    reviewState: "accepted",
    status: "active",
    recordedAt: "2026-10-30T10:00:00.000Z",
  }) as UnifiedObservation),
);

const demoRule = (metricId: string, unit: string) => ({ ruleId: `DEMO-${metricId}`, version: "0.0-demo", status: "DEMONSTRATION_ONLY" as const, metricId, unit, approvedBy: "", approvalRef: "", approvedAt: "", missionPhases: ["synthetic-demo"] });
const demoAnn = (recordId: string, metricId: string) => ({ recordId, ruleId: `DEMO-${metricId}`, ruleVersion: "0.0-demo", missionPhase: "synthetic-demo", baselineRef: "synthetic-baseline", provenanceRef: "synthetic-fixture", contextRef: "synthetic-demo-context", qualityAccepted: true });
const adverseAssessment: AdverseAssessmentInput = {
  allowDemonstration: true,
  rules: [demoRule("cv-001", "bpm"), demoRule("cv-027", "ms")],
  annotations: [demoAnn("synthetic-sample-cv-001-4", "cv-001"), demoAnn("synthetic-sample-cv-027-3", "cv-027")],
};

const unified = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: observations, deviceRecords: [] }, scope, {}, FIXED_DATE.toISOString());
const findings = buildScientificFindings(unified);
const history = buildHealthHistoryReport(observations, scope.missionId, scope.crewMemberId, "synthetic");
const fontDir = join(root, "node_modules/pdfjs-dist/standard_fonts");
const fonts: ReportFonts = {
  regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
  bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
};

/** jsPDF with fixed metadata so the output bytes are reproducible. */
class DeterministicPdf extends jsPDF {
  constructor(o: Record<string, unknown>) {
    super(o);
    this.setCreationDate(FIXED_DATE);
    this.setFileId("4D49544F43484F4E445249412D53414D");
  }
}

const result = await createTextReportPdf(
  {
    unified,
    findings,
    summary: buildScientificHealthSummary(unified, findings, history, summarizeAttestations(unified, [])),
    history,
    attestations: [],
    identity: { missionName: "SYNTHETIC SAMPLE - research only - not clinically validated", crewDisplayName: "Synthetic Crew 01 (fictional)" },
    title: "SYNTHETIC - research only - not clinically validated - MITOCHONDRIA sample report",
    adverseAssessment,
  },
  { jsPDF: DeterministicPdf as never, fonts },
);
writeFileSync(OUT, new Uint8Array(await result.blob.arrayBuffer()));
console.log(`Wrote ${OUT} (${result.pages} pages, ${unified.rows.length} included, ${unified.exclusions.length} excluded, font ${result.fontMode})`);
