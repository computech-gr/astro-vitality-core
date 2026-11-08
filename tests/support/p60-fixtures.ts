/**
 * P60 test fixtures — SYNTHETIC, FOR TESTING ONLY. Never stored, never presented as real data.
 *
 * ALEX_NOVEMBER_EXPORT_FIXTURE is reconstructed from the "Complete results — all observations" table of the
 * P59-generated PDF the owner supplied on 2026-11-08 (97 observations, 4 examination dates). Values, units and
 * dates are copied exactly as printed. The PDF does not print metric identities, so each identity below is
 * INFERRED: the exact catalog unit must equal the printed unit (verified by tests), production cv- identities are
 * used where the export shows a provisional class without a demonstration mapping, demo identities where the
 * unit exists only in the synthetic demo catalog (breaths/min, mg/L FEU, fibrinogen mg/dL, °C), and three rows
 * whose identity cannot be inferred carry "fixture:unresolved-*" identities. This fixture is therefore NOT proof
 * that the stored November dataset was processed; the authenticated census procedure in the P60 package is.
 */
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { o } from "./p59-fixtures";
import cvCatalog from "../../data/scientific/cardiovascular-handbook.catalog.v1.json";

const CV_UNIT = (() => {
  const m = new Map<string, string>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const r = x as Record<string, unknown>;
      if (typeof r["id"] === "string" && /^cv-\d+$/.test(r["id"]) && typeof r["unit"] === "string") m.set(r["id"], r["unit"]);
      Object.values(r).forEach(walk);
    }
  };
  walk(cvCatalog);
  return m;
})();

export const ALEX_EXPORT_FIXTURE_LABEL = "FIXTURE — reconstructed from the P59 PDF export (identities inferred); not the stored dataset";

/** [identity, unit, value, date, domain] */
export const ALEX_NOVEMBER_EXPORT_ROWS: readonly [string, string, string, string, UnifiedObservation["domain"]][] = [
  ["cv-080", "pg/mL", "35", "2026-11-07", "cardiovascular"], // ANP
  ["demo:ubt-bc4aef7f", "L", "4.2", "2026-11-07", "cardiovascular"], // Blood volume
  ["demo:ubt-381d2837", "L", "2.5", "2026-11-07", "cardiovascular"], // Plasma volume
  ["cv-071", "mmol/L", "5.8", "2026-11-07", "cardiovascular"], // Potassium
  ["cv-071", "mmol/L", "3.2", "2026-11-08", "cardiovascular"], // Potassium
  ["cv-070", "mmol/L", "128", "2026-11-07", "cardiovascular"], // Sodium
  ["cv-070", "mmol/L", "146", "2026-11-08", "cardiovascular"], // Sodium
  ["cv-089", "mg/dL", "160", "2026-11-07", "cardiovascular"], // ApoB
  ["cv-085", "%", "9.1", "2026-11-07", "cardiovascular"], // HbA1c
  ["cv-085", "%", "5.9", "2026-11-08", "cardiovascular"], // HbA1c
  ["cv-087", "mg/dL", "28", "2026-11-07", "cardiovascular"], // HDL
  ["cv-084", "μIU/mL", "24", "2026-11-07", "cardiovascular"], // Insulin
  ["cv-086", "mg/dL", "188", "2026-11-07", "cardiovascular"], // LDL
  ["cv-088", "mg/dL", "165", "2026-11-06", "cardiovascular"], // Triglycerides
  ["cv-088", "mg/dL", "330", "2026-11-07", "cardiovascular"], // Triglycerides
  ["cv-088", "mg/dL", "184", "2026-11-08", "cardiovascular"], // Triglycerides
  ["demo:ubt-1d9912f9", "mg/L", "18.4", "2026-11-08", "immune"], // C-reactive protein
  ["cv-091", "mg/L", "28", "2026-11-07", "cardiovascular"], // hsCRP
  ["demo:ubt-ead50a31", "mg/dL", "32", "2026-11-07", "immune"], // IgA
  ["demo:ubt-c87840cb", "mg/dL", "380", "2026-11-07", "immune"], // IgG
  ["demo:ubt-97b6c305", "mg/dL", "25", "2026-11-07", "immune"], // IgM
  ["demo:ubt-e151a9b1", "pg/mL", "25", "2026-11-07", "immune"], // IL-10
  ["demo:ubt-1cc68f93", "pg/mL", "6", "2026-11-07", "immune"], // IL-12
  ["demo:ubt-1fc27650", "pg/mL", "2", "2026-11-07", "immune"], // IL-2
  ["demo:ubt-be20d8ea", "pg/mL", "12", "2026-11-07", "immune"], // IL-4
  ["cv-092", "pg/mL", "5.8", "2026-11-05", "cardiovascular"], // IL-6
  ["cv-092", "pg/mL", "74", "2026-11-07", "cardiovascular"], // IL-6
  ["cv-093", "pg/mL", "42", "2026-11-07", "cardiovascular"], // TNF
  ["cv-061", "s", "42", "2026-11-07", "cardiovascular"], // aPTT
  ["demo:ubt-eed68002", "mg/L FEU", "2.8", "2026-11-07", "cardiovascular"], // D-dimer
  ["demo:ubt-c6a305ef", "mg/dL", "520", "2026-11-07", "cardiovascular"], // Fibrinogen
  ["cv-076", "%", "31", "2026-11-07", "cardiovascular"], // Hematocrit
  ["cv-076", "%", "34", "2026-11-08", "cardiovascular"], // Hematocrit
  ["cv-075", "g/dL", "10.2", "2026-11-07", "cardiovascular"], // Hemoglobin
  ["cv-075", "g/dL", "11.3", "2026-11-08", "cardiovascular"], // Hemoglobin
  ["cv-066", "mmHg", "65", "2026-11-07", "cardiovascular"], // PaO2
  ["cv-041", "ms/mmHg", "3", "2026-11-07", "cardiovascular"], // Baroreflex
  ["cv-011", "L/min/m²", "2.9", "2026-11-07", "cardiovascular"], // Cardiac index
  ["cv-010", "L/min", "5.54", "2026-11-07", "cardiovascular"], // Cardiac output
  ["cv-044", "mm", "0.95", "2026-11-07", "cardiovascular"], // cIMT
  ["cv-013", "mmHg", "3", "2026-11-07", "cardiovascular"], // CVP
  ["cv-042", "cm/s", "35", "2026-11-07", "cardiovascular"], // Cerebral flow
  ["cv-006", "mmHg", "54", "2026-11-07", "cardiovascular"], // DBP
  ["cv-006", "mmHg", "61", "2026-11-08", "cardiovascular"], // DBP
  ["cv-021", "%", "49", "2026-11-07", "cardiovascular"], // LVEF
  ["cv-068", "mmHg", "28", "2026-11-07", "cardiovascular"], // EtCO2
  ["cv-064", "W", "45", "2026-11-07", "cardiovascular"], // Workload
  ["cv-023", "ratio", "19", "2026-11-07", "cardiovascular"], // E/e'
  ["cv-022", "ratio", "0.6", "2026-11-07", "cardiovascular"], // E/A
  ["cv-046", "%", "2.5", "2026-11-07", "cardiovascular"], // FMD
  ["cv-052", "cm/s", "9", "2026-11-07", "cardiovascular"], // Jugular velocity
  ["cv-069", "mmol/L", "4.2", "2026-11-07", "cardiovascular"], // Lactate
  ["cv-017", "mL", "86", "2026-11-07", "cardiovascular"], // LVEDV
  ["cv-018", "mL", "44", "2026-11-07", "cardiovascular"], // LVESV
  ["cv-019", "g", "125", "2026-11-07", "cardiovascular"], // LV mass
  ["cv-007", "mmHg", "65.3", "2026-11-07", "cardiovascular"], // MAP
  ["demo:ubt-a65dfc7c", "pg/mL", "172", "2026-11-08", "cardiovascular"], // NT-proBNP
  ["cv-038", "mmHg", "-28", "2026-11-07", "cardiovascular"], // Orthostatic SBP change
  ["demo:ubt-003f487c", "bpm", "34", "2026-11-08", "cardiovascular"], // Orthostatic HR change
  ["cv-065", "%", "91", "2026-11-07", "cardiovascular"], // SpO2
  ["cv-030", "ms", "120", "2026-11-07", "cardiovascular"], // PR
  ["cv-008", "mmHg", "34", "2026-11-07", "cardiovascular"], // Pulse pressure
  ["cv-045", "m/s", "12.4", "2026-11-07", "cardiovascular"], // PWV
  ["cv-031", "ms", "88", "2026-11-07", "cardiovascular"], // QRS
  ["cv-032", "ms", "510", "2026-11-07", "cardiovascular"], // QTc
  ["cv-002", "bpm", "94", "2026-11-08", "cardiovascular"], // Resting HR
  ["cv-037", "mm", "-1.2", "2026-11-07", "cardiovascular"], // ST
  ["cv-009", "mL/beat", "42", "2026-11-07", "cardiovascular"], // Stroke volume
  ["cv-012", "dyn·s/cm⁵", "1100", "2026-11-07", "cardiovascular"], // SVR
  ["cv-005", "mmHg", "88", "2026-11-07", "cardiovascular"], // SBP
  ["cv-005", "mmHg", "97", "2026-11-08", "cardiovascular"], // SBP
  ["cv-016", "L/min", "4.8", "2026-11-07", "cardiovascular"], // Venous return
  ["cv-063", "mL/kg/min", "19", "2026-11-07", "cardiovascular"], // VO2peak
  ["demo:ubt-f17497d1", "N", "2100", "2026-11-07", "bone"], // Bone failure load
  ["demo:ubt-d9870fc7", "ng/mL", "1.82", "2026-11-07", "bone"], // CTX
  ["demo:ubt-d032c52f", "nmol/mmol creatinine", "38", "2026-11-07", "bone"], // DPD
  ["demo:ubt-cf31f290", "mg/day", "420", "2026-11-07", "bone"], // Dietary calcium
  ["demo:ubt-468cb43c", "g/cm²", "0.54", "2026-11-07", "bone"], // Femoral neck BMD
  ["demo:ubt-12c22152", "ng/mL", "3.5", "2026-11-07", "bone"], // Osteocalcin
  ["demo:ubt-12c22152", "ng/mL", "31", "2026-11-08", "bone"], // Osteocalcin
  ["demo:ubt-6c8bad01", "ng/mL", "12", "2026-11-07", "bone"], // P1NP
  ["demo:ubt-9908b9b9", "nmol/mmol creatinine", "165", "2026-11-07", "bone"], // PYD
  ["demo:ubt-a6c35d86", "g/cm²", "0.61", "2026-11-07", "bone"], // Total hip BMD
  ["demo:ubt-7b25ce69", "ng/mL", "12", "2026-11-07", "bone"], // Vitamin D
  ["demo:ubt-7b25ce69", "ng/mL", "12", "2026-11-08", "bone"], // Vitamin D
  ["cv-027", "ms", "24", "2026-11-06", "cardiovascular"], // RMSSD
  ["cv-027", "ms", "12", "2026-11-07", "cardiovascular"], // RMSSD
  ["cv-026", "ms", "18", "2026-11-07", "cardiovascular"], // SDNN
  ["cv-025", "ms", "455", "2026-11-07", "cardiovascular"], // RR interval
  ["demo:ubt-efe7e2fb", "%", "52", "2026-11-07", "behavioral"], // Sleep efficiency
  ["demo:ubt-323050f4", "°C", "38.8", "2026-11-07", "immune"], // Body temperature
  ["fixture:unresolved-gcsf", "pg/mL", "12.5", "2026-11-07", "cardiovascular"], // G-CSF
  ["fixture:unresolved-mission-duration", "days", "118", "2026-11-07", "cardiovascular"], // Mission duration
  ["demo:ubt-f4b8be7b", "breaths/min", "26", "2026-11-07", "cardiovascular"], // Respiratory rate
  ["demo:ubt-b9079b6f", "1/mm", "0.7", "2026-11-07", "bone"], // Trabecular number
  ["demo:ubt-2f5b3bb4", "mm", "2.1", "2026-11-07", "bone"], // Trabecular separation
  ["fixture:unresolved-urine-ph", "pH", "5.1", "2026-11-07", "cardiovascular"], // Urine pH
];

export function alexNovemberExport(): UnifiedObservation[] {
  return ALEX_NOVEMBER_EXPORT_ROWS.map(([id, unit, value, date, domain]) => o(id, unit, value, date, domain));
}

/** Large synthetic dataset for pagination/performance: the export fixture plus N extra daily series. */
export function largeSynthetic(extraSeries = 20, days = 8): UnifiedObservation[] {
  const out = alexNovemberExport();
  const ids = ["cv-001", "cv-009", "cv-010", "cv-011", "cv-013", "cv-016", "cv-017", "cv-018", "cv-019", "cv-022", "cv-025", "cv-026", "cv-028", "cv-030", "cv-031", "cv-041", "cv-042", "cv-044", "cv-045", "cv-046"];
  for (let s = 0; s < Math.min(extraSeries, ids.length); s++)
    for (let d = 0; d < days; d++) {
      const day = new Date(Date.UTC(2026, 10, 1 + (d % 8))).toISOString().slice(0, 10);
      out.push(o(ids[s]!, CV_UNIT.get(ids[s]!) ?? "", String(50 + ((s * 7 + d * 13) % 40)), day));
    }
  return out;
}

/**
 * P60.1 — SYNTHETIC dataset with missing context and ambiguous identities (testing only): unresolved identities,
 * a known metric recorded in a unit its catalog entry does not use, a non-numeric value, single-date series, and
 * glucose / triglycerides without recorded fasting status. Nothing may be inferred, converted or classified from it
 * beyond what the existing rules allow.
 */
export function missingContextAmbiguous(): UnifiedObservation[] {
  return [
    o("fixture:unresolved-gcsf", "pg/mL", "12.5", "2026-11-07"),
    o("fixture:unresolved-marker-x", "U/L", "41", "2026-11-07"),
    o("fixture:unresolved-marker-x", "U/L", "88", "2026-11-08"),
    o("cv-070", "mEq/L", "139", "2026-11-07"), // sodium in a unit the catalog entry does not use: never converted
    o("cv-071", "mmol/L", "4.1", "2026-11-07"),
    o("cv-083", "mg/dL", "131", "2026-11-07"), // glucose; fasting status not recorded
    o("cv-088", "mg/dL", "210", "2026-11-06"), o("cv-088", "mg/dL", "420", "2026-11-08"), // triglycerides; fasting not recorded
    o("cv-085", "%", "trace", "2026-11-07"), // non-numeric
    o("demo:ubt-7b25ce69", "ng/mL", "18", "2026-11-07", "bone"),
  ];
}
