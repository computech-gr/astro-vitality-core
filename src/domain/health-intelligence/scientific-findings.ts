/** Deterministic, read-only research interpretation of authorized report rows.
 * No medical thresholds, diagnosis, causality, risk classification or treatment advice.
 */
import type { UnifiedHealthReport, ReportRow } from "./unified-health-report";

export interface ScientificMetricFinding {
  metricId: string;
  label: string;
  unit: string;
  count: number;
  first: string;
  last: string;
  earliestValue: number | null;
  latestValue: number | null;
  delta: number | null;
  trend: "descriptive_change" | "insufficient_evidence";
  evidenceIds: string[];
  note: string;
}
export interface ScientificCrossDomainFinding {
  domains: string[];
  signals: string[];
  evidenceIds: string[];
  statement: string;
  missingSignals: string[];
  observedTimeRange: string | null;
  observedSignalCounts: string[];
}
export interface ScientificFindings {
  metrics: ScientificMetricFinding[];
  crossDomain: ScientificCrossDomainFinding[];
  missingDomains: string[];
  reviewItems: string[];
  limitations: string[];
}

// Source: data/scientific/nikolas-cross-domain-context.v1.json.
// These are research context links only, never diagnostic or causal rules.
const CONTEXT_LINKS = [
  { domains: ["immune", "behavioral"], signals: ["salivary cortisol", "sleep duration", "immune cell function"] },
  { domains: ["immune", "bone"], signals: ["IL-6", "CTX", "25(OH) vitamin D"] },
  { domains: ["behavioral", "cardiovascular"], signals: ["HRV RMSSD", "sleep duration", "workload"] },
] as const;

function recordedDecimals(value: string): number {
  const fraction = value.trim().split(".")[1];
  return fraction ? fraction.length : 0;
}

function differenceAtRecordedPrecision(firstText: string, lastText: string, first: number, last: number): number {
  const decimals = Math.max(recordedDecimals(firstText), recordedDecimals(lastText));
  return Number((last - first).toFixed(decimals)) + 0; // + 0 normalizes -0 to 0
}

function finiteNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildScientificFindings(report: UnifiedHealthReport): ScientificFindings {
  const grouped = new Map<string, ReportRow[]>();
  for (const row of report.rows) {
    const key = `${row.badge}|${row.metricId}|${row.unit}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const metrics: ScientificMetricFinding[] = [...grouped.values()].map((unsorted) => {
    const rows = [...unsorted].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const firstNumber = finiteNumber(first.value);
    const lastNumber = finiteNumber(last.value);
    const distinctTimes = new Set(rows.map((r) => r.observedAt)).size;
    const canCompare = rows.length >= 2 && distinctTimes >= 2 && firstNumber !== null && lastNumber !== null;
    // Express the difference at the recorded precision so binary floating-point artefacts
    // (e.g. 5.9 - 6.1 = -0.1999999999999993) never appear as reported values.
    const delta = canCompare ? differenceAtRecordedPrecision(first.value, last.value, firstNumber, lastNumber) : null;
    return {
      metricId: first.metricId,
      label: first.metricLabel,
      unit: first.unit,
      count: rows.length,
      first: first.observedAt,
      last: last.observedAt,
      earliestValue: firstNumber,
      latestValue: lastNumber,
      delta,
      trend: canCompare ? "descriptive_change" : "insufficient_evidence",
      evidenceIds: rows.map((r) => r.recordId),
      note: canCompare
        ? "First-to-last descriptive difference only. Not a statistically established trend or clinical change."
        : "Insufficient comparable time points for a descriptive change; no trend inferred.",
    };
  });
  // Provisional exact catalog-ID mappings; scientific review remains pending. No fuzzy matching or invented aliases.
  const signalIds: Record<string, readonly string[]> = {
    "HRV RMSSD": ["cv-027"],
    "sleep duration": ["BSC-001"],
    "25(OH) vitamin D": ["IMM-030"],
    "CTX": ["bone-001"],
    // No reviewed canonical mapping for salivary cortisol, immune cell function,
    // IL-6 or workload in this reporting pipeline: keep them explicitly missing.
  };
  const crossDomain: ScientificCrossDomainFinding[] = CONTEXT_LINKS.map((link) => {
    const matched = link.signals.map((signal) => ({ signal, rows: report.rows.filter((r) =>
      (signalIds[signal] ?? []).includes(r.metricId) && link.domains.includes(r.badge as never)),
    }));
    const present = matched.filter((item) => item.rows.length > 0);
    const missingSignals = matched.filter((item) => item.rows.length === 0).map((item) => item.signal);
    const evidenceIds = [...new Set(present.flatMap((item) => item.rows.map((r) => r.recordId)))];
    const times = present.flatMap((item) => item.rows.map((r) => r.observedAt)).filter((t) => Number.isFinite(Date.parse(t))).sort((a, b) => Date.parse(a) - Date.parse(b));
    const observedTimeRange = times.length ? `${times[0]} to ${times[times.length - 1]}` : null;
    const observedSignalCounts = present.map((item) => `${item.signal}: ${item.rows.length} observation(s)`);
    return {
      domains: [...link.domains], signals: [...link.signals], evidenceIds, missingSignals, observedTimeRange, observedSignalCounts,
      statement: missingSignals.length
        ? `Partial signal coverage (${present.map((item) => item.signal).join(", ") || "none"}); missing: ${missingSignals.join(", ")}. Observed counts: ${observedSignalCounts.join("; ") || "none"}. Time coverage: ${observedTimeRange || "none"}. No cross-domain association inferred.`
        : `All named signals observed. Observed counts: ${observedSignalCounts.join("; ")}. Time coverage: ${observedTimeRange || "none"}. Co-observation is research context only; temporal alignment, statistical association, causal effect and clinical significance are not established.`,
    };
  });
  const missingDomains = report.summaries.filter((s) => s.missing).map((s) => s.badge);
  const reviewItems = [
    ...metrics.filter((m) => m.trend === "insufficient_evidence").map((m) => `${m.label}: additional comparable time points required.`),
    ...crossDomain.filter((c) => c.missingSignals.length === 0).map((c) => `${c.domains.join(" + ")}: qualified human scientific review required before interpretation.`),
    ...(report.coverage.pendingReview > 0 ? [`${report.coverage.pendingReview} records pending review.`] : []),
    ...(report.coverage.excluded > 0 ? [`${report.coverage.excluded} excluded records require provenance/quality review.`] : []),
  ];
  return {
    metrics, crossDomain, missingDomains, reviewItems,
    limitations: [
      "Research-use-only; no automated medical opinion, diagnosis, treatment or fitness-for-duty determination.",
      "Descriptive first/last comparisons do not establish statistical significance, clinical relevance, causality or a sustained trend.",
      "Cross-domain links require relevant co-observed signals and are context hypotheses, not calculated correlations.",
      "Interpretation is limited to authorized, included rows within the selected mission, crew, provenance and date filters.",
      "A qualified medical professional must independently review evidence before issuing any clinical opinion.",
    ],
  };
}

export function scientificFindingsPlainText(findings: ScientificFindings): string {
  return [
    "SCIENTIFIC FINDINGS & INTERPRETATION — RESEARCH ONLY",
    ...findings.metrics.map((m) => `${m.label} (${m.metricId}): ${m.count} observations; ${m.delta === null ? "insufficient time points" : `first ${m.earliestValue} → last ${m.latestValue} ${m.unit}; difference ${m.delta} ${m.unit}`} | evidence ${m.evidenceIds.join(", ")}. ${m.note}`),
    "CROSS-DOMAIN CONTEXT",
    ...findings.crossDomain.map((c) => `${c.domains.join(" / ")}: ${c.statement} Evidence: ${c.evidenceIds.join(", ") || "none"}`),
    `MISSING DOMAINS: ${findings.missingDomains.join(", ") || "none in selected scope"}`,
    "HUMAN REVIEW: ", ...findings.reviewItems,
    "LIMITATIONS:", ...findings.limitations,
  ].join("\n");
}
