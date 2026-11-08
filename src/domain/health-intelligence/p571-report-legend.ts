/**
 * P57.1 — report legend and chart reference bands (pure; used by the PDF/HTML report layer).
 *
 * The legend keeps the three axes visually distinct. Clinical RED is a FILLED red marker
 * with the approved band label; HIGH review priority may use red only as an OUTLINE with
 * a flag shape and the words "not a clinical classification".
 * Reference bands are drawn only from criteria that were actually used for an approved
 * classification — never from candidates, never from review rules.
 */
import { bandRangeText, bundledCriteriaRegistry, type CriteriaClassification, type CriteriaRegistry } from "./p57-reference-criteria";
import type { ClinicalClass, DataQualityStatus, ReviewPriorityLevel } from "./p571-warning-axes";

export type Marker = "filled-circle" | "outline-circle" | "flag-outline" | "flag-outline-dark" | "hatched-outline" | "dotted-outline" | "thin-outline";
export interface LegendEntry {
  axis: "clinical" | "review" | "dataQuality";
  value: ClinicalClass | ReviewPriorityLevel | DataQualityStatus;
  marker: Marker;
  /** RGB fill (null = no fill). */
  fill: [number, number, number] | null;
  stroke: [number, number, number];
  text: string;
}

const RED: [number, number, number] = [185, 28, 28];
const AMBER: [number, number, number] = [180, 83, 9];
const GREEN: [number, number, number] = [21, 128, 61];
const GREY: [number, number, number] = [100, 116, 139];
const INK: [number, number, number] = [30, 41, 59];

export const REPORT_LEGEND: readonly LegendEntry[] = [
  { axis: "clinical", value: "RED", marker: "filled-circle", fill: RED, stroke: RED, text: "Clinical RED — meets a Researcher-approved criterion band named by its source. Not a diagnosis." },
  { axis: "clinical", value: "AMBER", marker: "filled-circle", fill: AMBER, stroke: AMBER, text: "Clinical AMBER — in an approved criterion's cautionary band." },
  { axis: "clinical", value: "NORMAL", marker: "filled-circle", fill: GREEN, stroke: GREEN, text: "Clinical NORMAL — within an approved criterion's normal band." },
  { axis: "clinical", value: "NEUTRAL", marker: "outline-circle", fill: null, stroke: GREY, text: "NEUTRAL — no approved criterion applies; shown without clinical colour." },
  { axis: "review", value: "HIGH", marker: "flag-outline", fill: null, stroke: RED, text: "High review priority — not a clinical classification (change-based triage for Ground Medical review)." },
  { axis: "review", value: "ROUTINE", marker: "flag-outline-dark", fill: null, stroke: INK, text: "Routine review — not a clinical classification." },
  { axis: "dataQuality", value: "DATA_QUALITY_WARNING", marker: "hatched-outline", fill: null, stroke: AMBER, text: "Data-quality warning — verify sample identity, method and data entry before interpretation." },
  { axis: "dataQuality", value: "UNKNOWN", marker: "dotted-outline", fill: null, stroke: GREY, text: "Data quality unknown — specimen, method or exact identity not recorded." },
  { axis: "dataQuality", value: "VERIFIED", marker: "thin-outline", fill: null, stroke: GREY, text: "Provenance checks passed (not clinical validation)." },
];

/** Problems that would make the legend misleading (empty list = acceptable). */
export function legendProblems(legend: readonly LegendEntry[] = REPORT_LEGEND): string[] {
  const out: string[] = [];
  const sig = (e: LegendEntry) => `${e.marker}|${e.fill?.join(",") ?? "none"}|${e.stroke.join(",")}`;
  const seen = new Map<string, string>();
  for (const e of legend) {
    const k = sig(e);
    if (seen.has(k)) out.push(`${e.axis}:${e.value} looks identical to ${seen.get(k)}`);
    seen.set(k, `${e.axis}:${e.value}`);
    if (e.axis !== "clinical" && e.fill !== null) out.push(`${e.axis}:${e.value} uses a filled marker reserved for clinical classification`);
    if (e.axis === "review" && !/not a clinical classification/i.test(e.text)) out.push(`${e.axis}:${e.value} does not say it is not a clinical classification`);
    if (/\bdiagnos(?:is|ed|tic) (?:of|confirmed)\b/i.test(e.text)) out.push(`${e.axis}:${e.value} implies a diagnosis`);
  }
  for (const v of ["RED", "AMBER", "NORMAL", "NEUTRAL"]) if (!legend.some((e) => e.axis === "clinical" && e.value === v)) out.push(`clinical ${v} missing`);
  return out;
}

export interface ChartBand { lower: number | null; upper: number | null; severity: "red" | "amber" | "normal" | "none"; label: string; criterionId: string }

/** Reference bands for a trend chart: only from criteria USED in an approved classification. */
export function chartReferenceBands(cls: CriteriaClassification | null, registry: CriteriaRegistry = bundledCriteriaRegistry()): { bands: ChartBand[]; caption: string } {
  if (!cls || cls.outcome !== "classified" || !cls.used.length)
    return { bands: [], caption: "No approved reference criterion applies, so no reference band is drawn." };
  const bands: ChartBand[] = [];
  for (const u of cls.used) {
    const c = registry.criteria.find((x) => x.id === u.id);
    if (!c) continue;
    for (const b of c.bands) bands.push({ lower: b.lower, upper: b.upper, severity: b.severity, label: `${b.label}: ${bandRangeText(b, c.identity.unit)}`, criterionId: c.id });
  }
  return bands.length
    ? { bands, caption: `Bands from approved criteria: ${cls.used.map((u) => u.source).join("; ")}.` }
    : { bands: [], caption: "No approved reference criterion applies, so no reference band is drawn." };
}

/** Points that a first-versus-last summary would hide: every interior local maximum/minimum. */
export function interiorExtremes(values: readonly { day: string; value: number }[]): { day: string; value: number; kind: "peak" | "trough" }[] {
  const out: { day: string; value: number; kind: "peak" | "trough" }[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const [a, b, c] = [values[i - 1]!.value, values[i]!.value, values[i + 1]!.value];
    if (b > a && b > c) out.push({ ...values[i]!, kind: "peak" });
    else if (b < a && b < c) out.push({ ...values[i]!, kind: "trough" });
  }
  return out;
}
