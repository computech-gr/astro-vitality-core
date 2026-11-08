/** Synthetic fixtures for P59 premium-report tests (reconstruction for testing only; never stored). */
import { buildHealthAssessment } from "../../src/domain/health-intelligence/p56-health-assessment";
import { buildBiomarkerAssessment } from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { buildProfessionalReport } from "../../src/domain/health-intelligence/p58-professional-report";
import type { ApprovedCriterion } from "../../src/domain/health-intelligence/p57-reference-criteria";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { buildPremiumReport } from "../../src/domain/health-intelligence/p59-premium-model";
import { V9_SCOPE, obs } from "../domain/fixtures-v9-observations";

export const at = (d: string) => `${d}T09:30:00.000Z`;
export const o = (metricId: string, unit: string, value: string, d: string, domain: UnifiedObservation["domain"] = "cardiovascular") =>
  obs({ metricId, domain, originalUnit: unit, value, observedAt: at(d) });

/** Alex Morgan synthetic reconstruction: every value itemised in the Assessment-3 PDF whose identity is known
 *  (production cv- IDs, or the demo IDs used by the repository's own P58 reconstruction / unique in the demo catalog). */
export function alexFull(): UnifiedObservation[] {
  return [
    o("cv-070", "mmol/L", "128", "2026-11-07"), o("cv-070", "mmol/L", "146", "2026-11-08"),
    o("cv-071", "mmol/L", "5.8", "2026-11-07"), o("cv-071", "mmol/L", "3.2", "2026-11-08"),
    o("cv-080", "pg/mL", "35", "2026-11-07"),
    o("demo:ubt-381d2837", "L", "2.5", "2026-11-07"), o("demo:ubt-bc4aef7f", "L", "4.2", "2026-11-07"),
    o("cv-085", "%", "9.1", "2026-11-07"), o("cv-085", "%", "5.9", "2026-11-08"),
    o("cv-084", "μIU/mL", "24", "2026-11-07"),
    o("cv-088", "mg/dL", "165", "2026-11-06"), o("cv-088", "mg/dL", "330", "2026-11-07"), o("cv-088", "mg/dL", "184", "2026-11-08"),
    o("cv-086", "mg/dL", "188", "2026-11-07"), o("cv-087", "mg/dL", "28", "2026-11-07"), o("cv-089", "mg/dL", "160", "2026-11-07"),
    o("cv-092", "pg/mL", "5.8", "2026-11-05"), o("cv-092", "pg/mL", "74", "2026-11-07"),
    o("cv-091", "mg/L", "28", "2026-11-07"), o("cv-093", "pg/mL", "42", "2026-11-07"),
    o("demo:ubt-c86436e7", "mg/L", "18.4", "2026-11-07", "immune"), o("demo:ubt-e151a9b1", "pg/mL", "25", "2026-11-07", "immune"),
    o("cv-075", "g/dL", "10.2", "2026-11-07"), o("cv-075", "g/dL", "11.3", "2026-11-08"),
    o("cv-076", "%", "31", "2026-11-07"), o("cv-076", "%", "34", "2026-11-08"),
    o("demo:ubt-eed68002", "mg/L FEU", "2.8", "2026-11-07"), o("demo:ubt-c6a305ef", "mg/dL", "520", "2026-11-07"),
    o("cv-061", "s", "42", "2026-11-07"), o("cv-052", "cm/s", "9", "2026-11-07"),
    o("cv-002", "bpm", "94", "2026-11-07"), o("cv-005", "mmHg", "88", "2026-11-07"), o("cv-006", "mmHg", "54", "2026-11-07"),
    o("cv-007", "mmHg", "65.3", "2026-11-07"), o("cv-008", "mmHg", "34", "2026-11-07"),
    o("demo:ubt-12c22152", "ng/mL", "3.5", "2026-11-07", "bone"), o("demo:ubt-12c22152", "ng/mL", "31", "2026-11-08", "bone"),
    o("demo:ubt-d9870fc7", "ng/mL", "1.82", "2026-11-07", "bone"), o("demo:ubt-6c8bad01", "ng/mL", "12", "2026-11-07", "bone"),
    o("demo:ubt-7b25ce69", "ng/mL", "12", "2026-11-07", "bone"), o("demo:ubt-7b25ce69", "ng/mL", "12", "2026-11-08", "bone"),
    o("demo:ubt-9908b9b9", "nmol/mmol creatinine", "165", "2026-11-07", "bone"), o("demo:ubt-d032c52f", "nmol/mmol creatinine", "38", "2026-11-07", "bone"),
    o("cv-027", "ms", "24", "2026-11-06"), o("cv-027", "ms", "12", "2026-11-07"), o("cv-026", "ms", "18", "2026-11-07"),
    o("demo:ubt-efe7e2fb", "%", "52", "2026-11-07", "behavioral"),
  ];
}
export function smallNormal(): UnifiedObservation[] {
  return [
    o("cv-070", "mmol/L", "140", "2026-11-06"), o("cv-070", "mmol/L", "141", "2026-11-08"),
    o("cv-071", "mmol/L", "4.2", "2026-11-06"), o("cv-071", "mmol/L", "4.3", "2026-11-08"),
    o("cv-087", "mg/dL", "55", "2026-11-06"), o("cv-005", "mmHg", "116", "2026-11-06"), o("cv-006", "mmHg", "74", "2026-11-06"),
  ];
}
export function complexAbnormal(): UnifiedObservation[] {
  const out = alexFull();
  const days = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
  const extra: [string, string, number[]][] = [["cv-073", "mmol/L", [2.3, 2.1, 1.9, 2.2, 2.0]], ["cv-074", "mmol/L", [1.1, 0.7, 1.2, 0.8, 1.3]], ["cv-083", "mg/dL", [96, 132, 118, 141, 105]], ["cv-001", "bpm", [70, 88, 95, 72, 101]], ["cv-065", "%", [98, 95, 93, 97, 94]], ["cv-028", "ms²", [600, 420, 300, 510, 280]], ["cv-090", "nmol/L", [80, 82, 81, 79, 83]], ["cv-058", "10⁹/L", [250, 180, 140, 210, 160]]];
  for (const [id, u, vs] of extra) vs.forEach((v, i) => out.push(o(id, u, String(v), days[i]!)));
  return out;
}

export function premiumFrom(history: UnifiedObservation[], opts: { provisional?: boolean; approved?: ApprovedCriterion[]; registry?: unknown; provenance?: "synthetic" | "real" } = {}) {
  const inputs = { domainEntries: {}, unifiedObservations: history, deviceRecords: [] };
  const unified = buildUnifiedHealthReport(inputs as never, V9_SCOPE, { from: "2026-11-01", to: "2026-11-08" }, "2026-11-08T12:00:00.000Z");
  const model = buildResearcherInterpretation(unified, buildScientificFindings(unified), []);
  const biomarkers = buildBiomarkerAssessment(unified, model, undefined, { criteria: opts.approved ?? [] });
  const assessment = buildHealthAssessment({ unified, model, biomarkers, identity: { missionName: "MITO_DEMO_2026", crewDisplayName: "Alex Morgan" }, scopeHistory: unified.rows });
  if (opts.provenance === "real") (assessment.header as { provenance: string }).provenance = "real";
  const report = buildProfessionalReport({ assessment, biomarkers });
  return buildPremiumReport({ report, unified, biomarkers, approved: opts.approved ?? [], missionId: V9_SCOPE.missionId, options: { provisionalLiterature: Boolean(opts.provisional) }, provisionalRegistry: opts.registry });
}
export { V9_SCOPE };
