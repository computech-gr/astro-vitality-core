/**
 * P56.1 — complete longitudinal profile and review-triage rules (pure, offline).
 *
 * For ONE series (same domain, exact catalog ID, exact unit, already selected
 * by the Researcher interpretation model) this module describes every
 * comparable examination in the selected period — first, last, minimum,
 * maximum, intermediate peaks/troughs, direction reversals and time
 * intervals — instead of only the earliest and latest values.
 *
 * The review rules (data/scientific/p56-review-priority-rules.v1.json,
 * pending scientific review) only decide what is brought forward for
 * scientific/medical REVIEW. They never set RED/AMBER/NORMAL, never call a
 * value abnormal and never establish a diagnosis.
 *
 * Never: interpolation, invented observations, unit conversion, ordering of
 * readings on the same calendar day as a change over time.
 */
import rulesJson from "../../../data/scientific/p56-review-priority-rules.v1.json";
import type { ExamPoint } from "./longitudinal-comparison";
import type { RecommendationAuthorization, RecommendationCategory } from "./p56-pattern-library";

export const REVIEW_RULES_SCHEMA = "mitochondria.p56-review-priority-rules.v1" as const;

export interface ReviewRules {
  schema: typeof REVIEW_RULES_SCHEMA;
  version: number;
  status: string;
  largeChange: { ruleId: string; percent: number; statement: string };
  transientExtreme: { ruleId: string; percent: number; statement: string };
  tightlyRegulated: { ruleId: string; percent: number; ids: string[]; statement: string };
  slowMarkers: { ruleId: string; ids: string[]; name: string; minimumDays: number; percent: number; statement: string }[];
  patternGuidance: Record<string, { combined: string; recommendations: { category: RecommendationCategory; authorization: RecommendationAuthorization; text: string }[] }>;
}

const DOSE = /\b\d+(?:\.\d+)?\s*(?:mg|µg|μg|mcg|iu|g|ml|mmol)\b|\bdose of\b|\btake \d/i;
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const text = (s: unknown, min = 20): s is string => typeof s === "string" && s.trim().length >= min;

/** Fail-closed: a malformed rules file disables every review rule (nothing is flagged) and says so. */
export function validateReviewRules(raw: unknown): { rules: ReviewRules | null; problem: string | null } {
  const r = raw as Partial<ReviewRules> | null;
  if (!r || r.schema !== REVIEW_RULES_SCHEMA) return { rules: null, problem: "review rules schema invalid" };
  for (const k of ["largeChange", "transientExtreme", "tightlyRegulated"] as const) {
    const x = r[k] as { ruleId?: unknown; percent?: unknown; statement?: unknown } | undefined;
    if (!x || !text(x.ruleId, 3) || !positive(x.percent) || !text(x.statement)) return { rules: null, problem: `${k} rule incomplete` };
  }
  if (!Array.isArray(r.tightlyRegulated!.ids) || !r.tightlyRegulated!.ids.length) return { rules: null, problem: "tightly regulated ids missing" };
  if (!Array.isArray(r.slowMarkers) || r.slowMarkers.some((s) => !text(s?.ruleId, 3) || !Array.isArray(s.ids) || !s.ids.length || !positive(s.minimumDays) || !positive(s.percent) || !text(s.statement)))
    return { rules: null, problem: "slow-marker rule incomplete" };
  for (const g of Object.values(r.patternGuidance ?? {}))
    if (!text(g?.combined) || !Array.isArray(g.recommendations) || g.recommendations.some((x) => !text(x?.text) || DOSE.test(x.text) || (x.authorization !== "general_wellness" && x.authorization !== "clinician_required")))
      return { rules: null, problem: "pattern guidance incomplete or contains a dose" };
  return { rules: r as ReviewRules, problem: null };
}

let bundled: ReturnType<typeof validateReviewRules> | null = null;
export function bundledReviewRules() {
  if (!bundled) bundled = validateReviewRules(rulesJson);
  return bundled;
}

// ------------------------------------------------------------ profile

export type SeriesPattern =
  | "single"
  | "same_day"
  | "unchanged"
  | "increase"
  | "decrease"
  | "sustained_increase"
  | "sustained_decrease"
  | "transient_peak"
  | "transient_trough"
  | "fluctuating";

export const PATTERN_LABELS: Record<SeriesPattern, string> = {
  single: "Single examination",
  same_day: "Same calendar day only",
  unchanged: "No recorded change",
  increase: "Increase",
  decrease: "Decrease",
  sustained_increase: "Sustained increase",
  sustained_decrease: "Sustained decrease",
  transient_peak: "Intermediate peak",
  transient_trough: "Intermediate trough",
  fluctuating: "Fluctuating (direction reversals)",
};

export interface ProfilePoint {
  at: string;
  day: string;
  value: number;
  valueText: string;
}
export interface Step {
  from: ProfilePoint;
  to: ProfilePoint;
  absolute: number;
  percent: number | null;
  days: number;
}
export interface SeriesProfile {
  pattern: SeriesPattern;
  points: ProfilePoint[];
  first: ProfilePoint;
  last: ProfilePoint;
  min: ProfilePoint;
  max: ProfilePoint;
  absolute: number | null;
  percent: number | null;
  steps: Step[];
  reversals: number;
  spanDays: number;
  /** Readings in the period that could not be compared (non-numeric or differing repeats). */
  notCompared: number;
  /** Interior extreme hidden by a first-to-last comparison. */
  intermediate: { kind: "peak" | "trough"; point: ProfilePoint } | null;
  largestStep: Step | null;
}

const decimals = (v: string) => (v.includes(".") ? v.split(".")[1]!.length : 0);
const roundTo = (x: number, d: number) => Number(x.toFixed(d));
const pct = (from: number, to: number) => (from === 0 ? null : roundTo(((to - from) / Math.abs(from)) * 100, 1));
const dayMs = (d: string) => Date.parse(`${d}T00:00:00.000Z`);
export const daysBetween = (a: string, b: string) => Math.round((dayMs(b) - dayMs(a)) / 86_400_000);
export const signedNumber = (x: number) => (x > 0 ? `+${x}` : `${x}`);

export function seriesProfile(points: readonly ExamPoint[]): SeriesProfile | null {
  if (!points.length) return null;
  const numeric: ProfilePoint[] = points.filter((p) => p.value !== null).map((p) => ({ at: p.at, day: p.day, value: p.value!, valueText: p.valueText }));
  const notCompared = points.length - numeric.length;
  if (!numeric.length) return null;
  const first = numeric[0]!;
  const last = numeric.at(-1)!;
  const by = (cmp: (a: number, b: number) => boolean) => numeric.reduce((m, p) => (cmp(p.value, m.value) ? p : m), numeric[0]!);
  const min = by((a, b) => a < b);
  const max = by((a, b) => a > b);
  const base = { points: numeric, first, last, min, max, notCompared, reversals: 0, steps: [] as Step[], intermediate: null, largestStep: null };
  if (numeric.length === 1) return { ...base, pattern: "single", absolute: null, percent: null, spanDays: 0 };
  if (first.day === last.day) return { ...base, pattern: "same_day", absolute: null, percent: null, spanDays: 0 };

  const steps: Step[] = [];
  for (let i = 1; i < numeric.length; i++) {
    const a = numeric[i - 1]!;
    const b = numeric[i]!;
    const d = Math.max(decimals(a.valueText), decimals(b.valueText));
    steps.push({ from: a, to: b, absolute: roundTo(b.value - a.value, d), percent: pct(a.value, b.value), days: daysBetween(a.day, b.day) });
  }
  const signs = steps.map((s) => Math.sign(s.absolute)).filter((s) => s !== 0);
  let reversals = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) reversals++;
  const d = Math.max(decimals(first.valueText), decimals(last.valueText));
  const absolute = roundTo(last.value - first.value, d);
  const interior = numeric.slice(1, -1);
  const peak = interior.length ? interior.reduce((m, p) => (p.value > m.value ? p : m)) : null;
  const trough = interior.length ? interior.reduce((m, p) => (p.value < m.value ? p : m)) : null;
  const isPeak = peak && peak.value > first.value && peak.value > last.value && peak.value === max.value;
  const isTrough = trough && trough.value < first.value && trough.value < last.value && trough.value === min.value;
  let pattern: SeriesPattern;
  if (!signs.length) pattern = "unchanged";
  else if (reversals >= 2) pattern = "fluctuating";
  else if (isPeak) pattern = "transient_peak";
  else if (isTrough) pattern = "transient_trough";
  else if (reversals === 0) pattern = steps.length >= 2 ? (signs[0]! > 0 ? "sustained_increase" : "sustained_decrease") : signs[0]! > 0 ? "increase" : "decrease";
  else pattern = absolute > 0 ? "increase" : absolute < 0 ? "decrease" : "fluctuating";
  const intermediate = isPeak ? { kind: "peak" as const, point: peak! } : isTrough ? { kind: "trough" as const, point: trough! } : null;
  const largestStep = steps.reduce<Step | null>((m, s) => (s.percent !== null && (m === null || m.percent === null || Math.abs(s.percent) > Math.abs(m.percent)) ? s : m), null);
  return { ...base, pattern, absolute, percent: pct(first.value, last.value), steps, reversals, spanDays: daysBetween(first.day, last.day), intermediate, largestStep };
}

/** Plain-language description of the whole period (never a judgement). */
export function profileText(p: SeriesProfile, unit: string): string {
  const u = unit ? ` ${unit}` : "";
  const net = p.percent !== null ? ` (${signedNumber(p.percent)}%)` : "";
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  const path = p.points.map((x) => x.valueText).join(" → ");
  if (p.pattern === "unchanged") return `No recorded change across ${p.points.length} examinations (${p.first.valueText}${u}, ${p.first.day} to ${p.last.day}).`;
  if (p.points.length === 2)
    return `${p.absolute! > 0 ? "Increased" : "Decreased"} from ${p.first.valueText} to ${p.last.valueText}${u}${net} between ${p.first.day} and ${p.last.day} (${days(p.spanDays)}).`;
  const head = `${path}${u} from ${p.first.day} to ${p.last.day} (${p.points.length} examinations, ${days(p.spanDays)}).`;
  if (p.intermediate) {
    const x = p.intermediate.point;
    return `${head} ${p.intermediate.kind === "peak" ? "Peaked at" : "Fell to"} ${x.valueText}${u} on ${x.day} (intermediate ${p.intermediate.kind === "peak" ? "maximum" : "minimum"}), then ${p.intermediate.kind === "peak" ? "fell" : "rose"} again; first to last ${signedNumber(p.absolute!)}${u}${net}.`;
  }
  if (p.pattern === "fluctuating") return `${head} Direction reversed ${p.reversals} times; range ${p.min.valueText}–${p.max.valueText}${u}; first to last ${signedNumber(p.absolute!)}${u}${net}.`;
  return `${head} ${p.pattern === "sustained_increase" ? "Rose at every examination" : p.pattern === "sustained_decrease" ? "Fell at every examination" : "Overall"}; first to last ${signedNumber(p.absolute!)}${u}${net}.`;
}

// ------------------------------------------------------------ review flags

export type ReviewFlagKind = "priority_review" | "data_quality";
export interface ReviewFlag {
  ruleId: string;
  kind: ReviewFlagKind;
  /** Short, specific reason (values and dates). */
  text: string;
}
export type Plausibility = "not_assessed" | "not_expected_over_interval";

export interface SeriesReview {
  flags: ReviewFlag[];
  plausibility: Plausibility;
  plausibilityText: string | null;
}

export function reviewSeries(metricId: string, profile: SeriesProfile | null, unit: string, rules: ReviewRules | null): SeriesReview {
  const out: SeriesReview = { flags: [], plausibility: "not_assessed", plausibilityText: null };
  if (!rules || !profile || profile.steps.length === 0) return out;
  const u = unit ? ` ${unit}` : "";
  const stepText = (s: Step) => `${s.from.valueText} → ${s.to.valueText}${u}${s.percent !== null ? ` (${signedNumber(s.percent)}%)` : ""} from ${s.from.day} to ${s.to.day}`;

  const slow = rules.slowMarkers.find((m) => m.ids.includes(metricId));
  if (slow) {
    const hit = profile.steps.find((s) => s.days < slow.minimumDays && s.percent !== null && Math.abs(s.percent) >= slow.percent);
    if (hit) {
      out.flags.push({ ruleId: slow.ruleId, kind: "data_quality", text: `${stepText(hit)}: a ${hit.days}-day interval is far shorter than the period ${slow.name} reflects; measurement consistency must be checked before interpretation.` });
      out.plausibility = "not_expected_over_interval";
      out.plausibilityText = slow.statement;
    }
  }
  if (rules.tightlyRegulated.ids.includes(metricId)) {
    const hit = profile.steps.find((s) => s.percent !== null && Math.abs(s.percent) >= rules.tightlyRegulated.percent);
    if (hit) out.flags.push({ ruleId: rules.tightlyRegulated.ruleId, kind: "priority_review", text: `${stepText(hit)} in a tightly regulated electrolyte; prompt Ground Medical review.` });
  }
  if (!slow) {
    const big = profile.steps.filter((s) => s.percent !== null && Math.abs(s.percent) >= rules.largeChange.percent);
    if (big.length && !out.flags.some((f) => f.ruleId === rules.tightlyRegulated.ruleId))
      out.flags.push({ ruleId: rules.largeChange.ruleId, kind: "priority_review", text: `${big.map(stepText).join("; ")} (change of at least ${rules.largeChange.percent}%).` });
  }
  if (profile.intermediate) {
    const x = profile.intermediate.point;
    const a = pct(profile.first.value, x.value);
    const b = pct(profile.last.value, x.value);
    if (a !== null && b !== null && Math.abs(a) >= rules.transientExtreme.percent && Math.abs(b) >= rules.transientExtreme.percent)
      out.flags.push({ ruleId: rules.transientExtreme.ruleId, kind: "priority_review", text: `Intermediate ${profile.intermediate.kind} of ${x.valueText}${u} on ${x.day} (${signedNumber(a)}% vs first, ${signedNumber(b)}% vs last value).` });
  }
  return out;
}
