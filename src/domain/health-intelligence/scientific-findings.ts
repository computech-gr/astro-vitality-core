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
    const delta = canCompare ? lastNumber - firstNumber : null;
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
  const crossDomain: ScientificCrossDomainFinding[] = [];
  for (const link of CONTEXT_LINKS) {
    const related = report.rows.filter((row) => link.domains.includes(row.badge as never) &&
      link.signals.some((signal) => row.metricLabel.toLowerCase().includes(signal.toLowerCase())));
    const represented = new Set(related.map((row) => row.badge));
    if (!link.domains.every((domain) => represented.has(domain as ReportRow["badge"]))) continue;
    crossDomain.push({
      domains: [...link.domains],
      signals: [...link.signals],
      evidenceIds: related.map((row) => row.recordId),
      statement: "Co-observed research signals from the Nikolas cross-domain context. No temporal association, causal effect or clinical conclusion established.",
    });
  }
  const missingDomains = report.summaries.filter((s) => s.missing).map((s) => s.badge);
  const reviewItems = [
    ...metrics.filter((m) => m.trend === "insufficient_evidence").map((m) => `${m.label}: additional comparable time points required.`),
    ...crossDomain.map((c) => `${c.domains.join(" + ")}: qualified human scientific review required before interpretation.`),
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
    ...(findings.crossDomain.length ? findings.crossDomain.map((c) => `${c.domains.join(" / ")}: ${c.statement} Evidence: ${c.evidenceIds.join(", ")}`) : ["No governed cross-domain link has sufficient co-observed signal coverage."]),
    `MISSING DOMAINS: ${findings.missingDomains.join(", ") || "none in selected scope"}`,
    "HUMAN REVIEW: ", ...findings.reviewItems,
    "LIMITATIONS:", ...findings.limitations,
  ].join("\n");
}
