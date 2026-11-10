/**
 * P61 — reconstructed SYNTHETIC Alex Morgan multi-date examination series (testing only; never stored,
 * never real astronaut data). The owner's acceptance dataset was not attached, so this fixture rebuilds its
 * stated shape: 38 biomarkers × 8 examination dates (2026-11-01 … 2026-11-08) = 304 observations, every
 * biomarker labelled with its exact canonical catalog name and unit. The same readings are rendered as a
 * multi-date PDF text layer with section headings, a date-column table, a long CSV and a wide CSV.
 */
export const P61_DATES = ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"] as const;

/** [catalog metric, exact catalog name, exact catalog unit, base value, decimals] */
export const P61_BIOMARKERS: readonly [string, string, string, number, number][] = [
  ["cv-001", "HR", "bpm", 62, 0], ["cv-002", "Resting HR", "bpm", 58, 0], ["cv-005", "SBP", "mmHg", 118, 0],
  ["cv-006", "DBP", "mmHg", 76, 0], ["cv-007", "MAP", "mmHg", 90, 0], ["cv-008", "Pulse pressure", "mmHg", 42, 0],
  ["cv-009", "Stroke volume", "mL/beat", 70, 0], ["cv-010", "Cardiac output", "L/min", 5.2, 1], ["cv-011", "Cardiac index", "L/min/m²", 2.9, 1],
  ["cv-013", "CVP", "mmHg", 6, 0], ["cv-016", "Venous return", "L/min", 5.0, 1], ["cv-017", "LV EDV", "mL", 120, 0],
  ["cv-018", "LV ESV", "mL", 50, 0], ["cv-019", "LV mass", "g", 140, 0], ["cv-021", "LVEF", "%", 60, 0],
  ["cv-025", "RR interval", "ms", 950, 0], ["cv-026", "SDNN", "ms", 48, 0], ["cv-027", "RMSSD", "ms", 38, 0],
  ["cv-030", "PR", "ms", 160, 0], ["cv-031", "QRS", "ms", 92, 0], ["cv-032", "QTc", "ms", 410, 0],
  ["cv-041", "Baroreflex sensitivity", "ms/mmHg", 12, 0], ["cv-042", "Cerebral flow velocity", "cm/s", 58, 0], ["cv-045", "PWV", "m/s", 7.1, 1],
  ["cv-061", "aPTT", "s", 30, 0], ["cv-064", "Workload", "W", 150, 0], ["cv-069", "Lactate", "mmol/L", 1.2, 1],
  ["cv-070", "Sodium", "mmol/L", 140, 0], ["cv-071", "Potassium", "mmol/L", 4.2, 1], ["cv-072", "Magnesium", "mmol/L", 0.85, 2],
  ["cv-073", "Calcium serum", "mmol/L", 2.35, 2], ["cv-074", "Phosphate", "mmol/L", 1.1, 2], ["cv-075", "Hemoglobin", "g/dL", 14.2, 1],
  ["cv-076", "Hematocrit", "%", 42, 0], ["cv-083", "Glucose", "mg/dL", 92, 0], ["cv-085", "HbA1c", "%", 5.4, 1],
  ["cv-087", "HDL-C", "mg/dL", 55, 0], ["cv-092", "IL-6", "pg/mL", 2.1, 1],
];

/** Deterministic synthetic value of biomarker b on examination day d (no clinical meaning). */
export function p61Value(b: number, d: number): string {
  const [, , , base, decimals] = P61_BIOMARKERS[b]!;
  const factor = 1 + (((b * 7 + d * 5) % 11) - 5) / 100;
  return (base * factor).toFixed(decimals);
}

const HEADER = ["MITOCHONDRIA — Synthetic Examination Series", "Patient: Alex Morgan | Record ID: SYN-ALEX-2026", "Simulated data — not a clinical record", "Report generated: 2026-11-09"];

export interface P61Doc { text: string; pages: number[] }
const doc = (lines: { text: string; page: number }[]): P61Doc => ({ text: lines.map((l) => l.text).join("\n"), pages: lines.map((l) => l.page) });

/** Section layout: one "Examination N — date" heading per examination, row numbers restart per examination. */
export function p61SectionPdf(opts: { heading?: (date: string, k: number) => string; biomarkers?: number; dates?: readonly string[] } = {}): P61Doc {
  const dates = opts.dates ?? P61_DATES;
  const n = opts.biomarkers ?? P61_BIOMARKERS.length;
  const lines: { text: string; page: number }[] = HEADER.map((text) => ({ text, page: 1 }));
  dates.forEach((date, d) => {
    const page = d + 1;
    lines.push({ text: opts.heading ? opts.heading(date, d + 1) : `Examination ${d + 1} — ${date}`, page });
    lines.push({ text: "CARDIOVASCULAR", page });
    lines.push({ text: "No. | Measurement | Result | Unit", page });
    for (let b = 0; b < n; b++) {
      const [, label, unit] = P61_BIOMARKERS[b]!;
      lines.push({ text: `${b + 1} | ${label} | ${p61Value(b, d)} | ${unit}`, page });
    }
    lines.push({ text: `Page ${page} of ${dates.length}`, page });
  });
  return doc(lines);
}

/** Date-column layout: one row per biomarker, one column per examination date. */
export function p61ColumnPdf(): P61Doc {
  const lines: { text: string; page: number }[] = HEADER.map((text) => ({ text, page: 1 }));
  lines.push({ text: "CARDIOVASCULAR", page: 1 });
  lines.push({ text: ["No.", "Biomarker", "Unit", ...P61_DATES].join(" | "), page: 1 });
  P61_BIOMARKERS.forEach(([, label, unit], b) => {
    const page = b < 20 ? 1 : 2;
    if (b === 20) lines.push({ text: ["No.", "Biomarker", "Unit", ...P61_DATES].join(" | "), page }); // repeated header on page 2
    lines.push({ text: [String(b + 1), label, unit, ...P61_DATES.map((_, d) => p61Value(b, d))].join(" | "), page });
  });
  return doc(lines);
}

export function p61LongCsv(): string {
  const out = ["examination_date,biomarker,value,unit"];
  P61_DATES.forEach((date, d) => P61_BIOMARKERS.forEach(([, label, unit], b) => out.push(`${date},${label},${p61Value(b, d)},${unit}`)));
  return out.join("\n");
}

export function p61WideCsv(): string {
  const out = [["biomarker", "unit", ...P61_DATES].join(",")];
  P61_BIOMARKERS.forEach(([, label, unit], b) => out.push([label, unit, ...P61_DATES.map((_, d) => p61Value(b, d))].join(",")));
  return out.join("\n");
}
