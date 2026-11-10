/**
 * P58 — report chart selection (pure). Charts are mandatory whenever the data
 * allows a meaningful visual: a line chart for every clinically prioritised
 * series with at least two comparable examinations, and a single-value visual
 * for prioritised markers measured once. Clinically important charts are never
 * dropped to save pages; lower-priority series beyond the listed limits are
 * named with the reason so nothing disappears silently.
 *
 * Reference lines are drawn ONLY from an approved, applicable P57 criterion
 * that classified the latest value; otherwise no band is drawn. Colour on a
 * point marks only a validated classification of that point (the latest).
 */
import type { BiomarkerAssessmentReport, Severity } from "./biomarker-health-assessment";
import type { Contributor, HealthAssessment, ReviewPriority } from "./p56-health-assessment";
import { bundledCriteriaRegistry, type CriteriaRegistry } from "./p57-reference-criteria";

export interface ChartPoint {
  day: string;
  label: string;
  value: number;
  valueText: string;
  severity: Severity;
  annotation: "peak" | "trough" | null;
}
export interface ReportChart {
  key: string;
  kind: "line" | "single";
  metricId: string;
  name: string;
  unit: string;
  domainLabel: string;
  findingTitle: string | null;
  points: ChartPoint[];
  referenceLines: { value: number; label: string }[];
  severity: Severity;
  flagged: ReviewPriority;
  /** Plain-language interpretation shown under the chart. */
  caption: string;
  limitation: string | null;
}
export interface ChartSection {
  charts: ReportChart[];
  omitted: { name: string; reason: string }[];
  note: string;
}

/** Clinical display order (exact catalog IDs; synthetic demo aliases follow their production identity). */
export const CHART_PRIORITY: readonly string[] = [
  "cv-088", "demo:ubt-26a9a98e",
  "cv-085", "cv-083", "demo:ubt-7f47ee7c", "cv-084", "demo:ubt-8b2bb539",
  "cv-070", "demo:ubt-2841fb44", "cv-071", "demo:ubt-4afd25a0", "cv-072",
  "cv-091", "cv-092", "cv-093", "IMM-007",
  "bone-012", "demo:ubt-12c22152", "bone-001", "demo:ubt-d9870fc7", "bone-009", "demo:ubt-6c8bad01", "bone-019", "demo:ubt-7b25ce69", "bone-018", "cv-073",
  "cv-027", "cv-026", "cv-028", "cv-002",
];
export const MAX_LINE_CHARTS = 16;
export const MAX_SINGLE_VISUALS = 8;

const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const rankOf = (id: string) => {
  const i = CHART_PRIORITY.indexOf(id);
  return i < 0 ? CHART_PRIORITY.length : i;
};
const flagOf = (c: Contributor): ReviewPriority =>
  c.review.flags.some((f) => f.kind === "priority_review") ? "priority_review" : c.review.flags.length ? "data_quality_review" : "none";
const important = (c: Contributor) => c.severity === "red" || c.severity === "amber" || flagOf(c) !== "none" || rankOf(c.metricId) < CHART_PRIORITY.length;

export function buildReportCharts(
  a: HealthAssessment,
  biomarkers: BiomarkerAssessmentReport,
  registry: CriteriaRegistry = bundledCriteriaRegistry(),
  /** P61.3: uncapped = every chartable series (the premium report re-includes series it classifies or prioritises). */
  opts: { uncapped?: boolean } = {},
): ChartSection {
  const all = a.findings.flatMap((f) => f.contributors.map((c) => ({ c, finding: f.title })));
  const seen = new Set<string>();
  const unique = all.filter(({ c }) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
  const line: ReportChart[] = [];
  const single: ReportChart[] = [];
  const omitted: ChartSection["omitted"] = [];

  for (const { c, finding } of unique) {
    const entry = biomarkers.entries.find((e) => e.key === c.key);
    const used = entry?.classification.reason === "approved_criterion" ? entry.classification.criteria?.used ?? [] : [];
    const referenceLines = used.flatMap((u) => {
      const cr = registry.criteria.find((x) => x.id === u.id);
      if (!cr) return [];
      const edges = new Map<number, string>();
      for (const b of cr.bands) {
        if (b.lower !== null) edges.set(b.lower, `${b.label} ${b.lowerInclusive ? "≥" : ">"} ${b.lower}`);
      }
      return [...edges].map(([value, label]) => ({ value, label }));
    });
    const prof = c.trend.profile;
    const pts = prof?.points ?? [];
    const lastIdx = pts.length - 1;
    if (pts.length >= 2) {
      line.push({
        key: c.key,
        kind: "line",
        metricId: c.metricId,
        name: c.name,
        unit: c.unit,
        domainLabel: c.domainLabel,
        findingTitle: finding,
        points: pts.map((p, i) => ({
          day: p.day,
          label: p.day.slice(5),
          value: p.value,
          valueText: p.valueText,
          severity: i === lastIdx ? c.severity : "neutral",
          annotation: prof?.intermediate && prof.intermediate.point.day === p.day ? prof.intermediate.kind : null,
        })),
        referenceLines,
        severity: c.severity,
        flagged: flagOf(c),
        caption: c.trend.text,
        limitation: c.review.flags.find((f) => f.kind === "data_quality")?.text ?? (referenceLines.length ? null : "No approved reference criterion applies, so no reference band is drawn."),
      });
      continue;
    }
    const v = c.trend.latest.value.trim();
    if (!NUMERIC.test(v)) {
      if (important(c)) omitted.push({ name: c.name, reason: "result is not numeric; shown as text in the findings" });
      continue;
    }
    if (!important(c)) continue;
    single.push({
      key: c.key,
      kind: "single",
      metricId: c.metricId,
      name: c.name,
      unit: c.unit,
      domainLabel: c.domainLabel,
      findingTitle: finding,
      points: [{ day: c.trend.latest.at.slice(0, 10), label: c.trend.latest.at.slice(5, 10), value: Number(v), valueText: v, severity: c.severity, annotation: null }],
      referenceLines,
      severity: c.severity,
      flagged: flagOf(c),
      caption: `Single examination in this period (${c.trend.latest.at.slice(0, 10)}); no trend can be shown.`,
      limitation: referenceLines.length ? null : "No approved reference criterion applies; the value is shown without a reference band.",
    });
  }

  const score = (x: ReportChart) =>
    (x.severity === "red" ? 0 : x.severity === "amber" ? 1 : 2) * 10_000 + (x.flagged === "priority_review" ? 0 : x.flagged === "data_quality_review" ? 1 : 2) * 1_000 + rankOf(x.metricId);
  line.sort((x, y) => score(x) - score(y) || x.name.localeCompare(y.name));
  single.sort((x, y) => score(x) - score(y) || x.name.localeCompare(y.name));
  const keptLine = line.filter((x, i) => opts.uncapped || i < MAX_LINE_CHARTS || x.severity !== "neutral" || x.flagged === "priority_review");
  for (const x of line.filter((y) => !keptLine.includes(y))) omitted.push({ name: x.name, reason: "lower clinical priority; full series in the technical appendix" });
  const keptSingle = single.filter((x, i) => opts.uncapped || i < MAX_SINGLE_VISUALS || x.severity !== "neutral");
  for (const x of single.filter((y) => !keptSingle.includes(y))) omitted.push({ name: x.name, reason: "single lower-priority value; listed in the findings" });
  const charts = [...keptLine, ...keptSingle];
  return {
    charts,
    omitted,
    note: charts.length
      ? `${keptLine.length} trend chart${keptLine.length === 1 ? "" : "s"} (every comparable examination, original units, never converted) and ${keptSingle.length} single-examination visual${keptSingle.length === 1 ? "" : "s"}. Markers are coloured only for a result classified by an approved criterion; review flags use the dashed blue marker.`
      : "No result in this period can be charted: no numeric series or prioritised single value was recorded.",
  };
}
