/**
 * P41 — longitudinal examination-to-examination comparison (pure, descriptive).
 *
 * Input: the readings of ONE series (same domain, metric ID and exact unit) as
 * already selected by the Researcher interpretation model. Readings are grouped
 * into examination time points at their recorded precision (calendar date or
 * explicit instant). For consecutive examinations and baseline-to-latest it
 * reports the absolute difference (at recorded decimal precision) and, when
 * mathematically defined, the percentage change.
 *
 * Never: unit conversion, interpolation, silent discarding of repeated readings,
 * ordering of a date-only reading against a timed reading on the same calendar
 * day, clinical significance, improvement/deterioration language or colour
 * semantics. Specimen, method, assay and collection protocol are not recorded on
 * report rows, so comparability on those dimensions is stated as unverified.
 */
import type { ReportRow } from "./unified-health-report";
import { compareObservationDates, observationDateKey, observationDay } from "./observation-date";

export type RepeatState = "single" | "identical_repeats" | "differing_repeats";
export interface ExamPoint {
  key: string;
  /** Calendar date or ISO instant exactly as recorded. */
  at: string;
  precision: "date" | "instant";
  day: string;
  readings: { recordId: string; value: string; source: string }[];
  repeat: RepeatState;
  /** Numeric value used for comparison; null when non-numeric or repeated readings differ. */
  value: number | null;
  valueText: string;
  decimals: number;
}
export type PairStatus = "compared" | "non_numeric" | "differing_repeated_readings" | "ordering_ambiguous";
export interface PairComparison {
  kind: "consecutive" | "baseline_to_latest";
  from: number;
  to: number;
  status: PairStatus;
  absolute: number | null;
  percent: number | null;
  percentNote: string | null;
  direction: "higher" | "lower" | "no_recorded_difference" | null;
  text: string;
}
export interface LongitudinalComparison {
  unit: string;
  points: ExamPoint[];
  consecutive: PairComparison[];
  baselineToLatest: PairComparison | null;
  compatibility: {
    unit: "exact_same_unit";
    specimen: "not_recorded";
    method: "not_recorded";
    protocol: "not_recorded";
    sources: string[];
    statement: string;
  };
  notes: string[];
  /** Always neutral: no independently validated assay-specific alert rule exists. */
  tone: HighlightTone;
}

const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const decimalsOf = (v: string) => (v.includes(".") ? v.split(".")[1]!.length : 0);
const round = (x: number, d: number) => Number(x.toFixed(d));

function point(rows: ReportRow[]): ExamPoint {
  const first = rows[0]!;
  const values = rows.map((r) => r.value.trim());
  const distinct = [...new Set(values)];
  const repeat: RepeatState = rows.length === 1 ? "single" : distinct.length === 1 ? "identical_repeats" : "differing_repeats";
  const v = distinct.length === 1 && NUMERIC.test(distinct[0]!) ? Number(distinct[0]) : null;
  return {
    key: observationDateKey(first),
    at: first.observedAt,
    precision: first.datePrecision === "date" ? "date" : "instant",
    day: observationDay(first.observedAt),
    readings: rows.map((r) => ({ recordId: r.recordId, value: r.value, source: r.sourceLabel })),
    repeat,
    value: v,
    valueText: repeat === "differing_repeats" ? distinct.join(" / ") : distinct[0]!,
    decimals: Math.max(...values.map(decimalsOf)),
  };
}

function compare(points: ExamPoint[], from: number, to: number, kind: PairComparison["kind"], unit: string): PairComparison {
  const a = points[from]!;
  const b = points[to]!;
  const base = { kind, from, to, absolute: null, percent: null, percentNote: null, direction: null } as const;
  const span = `${a.at} → ${b.at}`;
  if (a.precision !== b.precision && a.day === b.day)
    return { ...base, status: "ordering_ambiguous", text: `${span}: a date-only and a timed reading on the same calendar day cannot be ordered; not compared.` };
  if (a.repeat === "differing_repeats" || b.repeat === "differing_repeats")
    return { ...base, status: "differing_repeated_readings", text: `${span}: repeated readings with different values at one examination (${a.repeat === "differing_repeats" ? a.valueText : b.valueText} ${unit}); all are listed, none is selected, not compared.` };
  if (a.value === null || b.value === null) return { ...base, status: "non_numeric", text: `${span}: non-numeric value(s) (${a.valueText} → ${b.valueText}); no difference calculated.` };
  const d = Math.max(a.decimals, b.decimals);
  const absolute = round(b.value - a.value, d);
  const direction = absolute > 0 ? "higher" : absolute < 0 ? "lower" : "no_recorded_difference";
  let percent: number | null = null;
  let percentNote: string | null = null;
  if (a.value === 0) percentNote = "percentage change undefined (earlier value is zero)";
  else if (a.value < 0) percentNote = "percentage change not calculated (earlier value is negative)";
  else percent = round(((b.value - a.value) / a.value) * 100, 1);
  const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);
  const text =
    direction === "no_recorded_difference"
      ? `${span}: ${a.valueText} → ${b.valueText} ${unit}; no recorded difference.`
      : `${span}: ${a.valueText} → ${b.valueText} ${unit}; numerically ${direction} by ${Math.abs(absolute)} ${unit} (${signed(absolute)} ${unit}${percent !== null ? `, ${signed(percent)}%` : `; ${percentNote}`}). Descriptive only.`;
  return { ...base, status: "compared", absolute, percent, percentNote, direction, text };
}

/** Build the comparison for one already-selected series (same metric and exact unit). */
export function buildLongitudinalComparison(rows: readonly ReportRow[], unit: string): LongitudinalComparison {
  const own = rows.filter((r) => r.unit === unit);
  const sorted = [...own].sort((a, b) => compareObservationDates(a, b) || a.recordId.localeCompare(b.recordId));
  const groups = new Map<string, ReportRow[]>();
  for (const r of sorted) groups.set(observationDateKey(r), [...(groups.get(observationDateKey(r)) ?? []), r]);
  const points = [...groups.values()].map(point);
  const consecutive = points.slice(1).map((_, i) => compare(points, i, i + 1, "consecutive", unit));
  const baselineToLatest = points.length >= 3 ? compare(points, 0, points.length - 1, "baseline_to_latest", unit) : null;
  const sources = [...new Set(sorted.map((r) => r.sourceLabel))].sort();
  const notes = [
    ...(points.some((p) => p.repeat !== "single") ? ["Several readings at one examination are all listed; identical repeats are compared once, differing repeats are not compared."] : []),
    ...(points.some((p) => p.precision === "date") ? ["Date-only examinations are compared at calendar-day precision; no time of day or timezone is assumed."] : []),
    ...(rows.length !== own.length ? ["Readings in other units are excluded from this series and never converted."] : []),
    ...(points.length === 2 ? ["Two examinations only; no trend is established."] : []),
    "Numerical direction is not clinical significance, improvement or deterioration.",
  ];
  return {
    unit,
    points,
    consecutive,
    baselineToLatest,
    compatibility: {
      unit: "exact_same_unit",
      specimen: "not_recorded",
      method: "not_recorded",
      protocol: "not_recorded",
      sources,
      statement: `Same exact unit (${unit}). Specimen, method/assay and collection protocol are not recorded for these readings, so their comparability is unverified${sources.length > 1 ? `; readings come from different sources (${sources.join(", ")})` : ""}.`,
    },
    notes,
    tone: highlightTone(),
  };
}

// ------------------------------------------------------------ highlight policy

export type HighlightTone = { tone: "neutral"; reason: string } | { tone: "validated_alert"; ruleId: string; reason: string };
/**
 * Independently validated assay-specific alert rules. Empty: no rule has been
 * validated, so nothing is ever rendered as an alert (red) or as good (green).
 */
export const VALIDATED_ALERT_RULES: readonly { ruleId: string }[] = [];
export function highlightTone(): HighlightTone {
  return { tone: "neutral", reason: "Neutral display: no independently validated assay-specific alert rule exists, so no colour implies normal, abnormal, better or worse." };
}

/** Plain-text lines shared by screen, PDF and TXT. */
export function longitudinalLines(c: LongitudinalComparison): string[] {
  if (c.points.length < 2) return [`Examinations: ${c.points.length}; no examination-to-examination comparison.`];
  return [
    `Examinations: ${c.points.length} (${c.points.map((p) => `${p.at}: ${p.valueText}${p.repeat === "differing_repeats" ? " [differing repeats]" : p.repeat === "identical_repeats" ? ` [${p.readings.length} identical readings]` : ""}`).join("; ")}).`,
    ...c.consecutive.map((p) => `Consecutive: ${p.text}`),
    ...(c.baselineToLatest ? [`Baseline to latest: ${c.baselineToLatest.text}`] : []),
    `Comparability: ${c.compatibility.statement}`,
    ...c.notes,
  ];
}
