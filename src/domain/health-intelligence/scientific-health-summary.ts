/**
 * Scientific Health Summary — concise, deterministic, read-only digest of the
 * built Unified Health Report, Scientific Findings and Medical Intake report.
 *
 * Six sections: measured/changed, supported vs insufficient, handbook-documented
 * possible biological implications, Nikolas-governed cross-domain context,
 * missing data/uncertainty/confounders, and qualified Ground Medical follow-up
 * considerations. Biological text comes only from the English handbook layers
 * joined by exact catalog ID; nothing is invented. No diagnosis, thresholds,
 * risk score, treatment or fitness-for-duty judgment.
 */
import type { UnifiedHealthReport, ReportRow } from "./unified-health-report";
import { REPORT_SOURCE_LABELS } from "./unified-health-report";
import type { ScientificFindings } from "./scientific-findings";
import type { HealthHistoryReport } from "./health-history-report";
import type { AttestationSummary } from "./evidence-attestation";
import {
  localizedBoneVariables,
  localizedCardiovascularMetrics,
} from "@/domain/scientific-localization/handbooks";

export type EvidenceTier = "stored_observation" | "reviewer_accepted_intake" | "device_observation";

export const EVIDENCE_TIER_LABELS: Record<EvidenceTier | "validated_interpretation", string> = {
  stored_observation: "Stored module observations (Health module entries)",
  reviewer_accepted_intake: "Reviewer-accepted intake observations (Unified Intake)",
  device_observation: "Persisted device / wearable observations",
  validated_interpretation: "Scientifically validated interpretations",
};

export interface HandbookImplication {
  metricId: string;
  label: string;
  direction: "increase" | "decrease" | "unchanged";
  /** Verbatim English handbook text joined by exact catalog ID. */
  statement: string;
  handbook: string;
  reviewStatus: string;
  evidenceIds: string[];
}

export interface DomainReconciliation {
  domain: string;
  reportIncluded: number;
  storedObservations: number;
  reviewerAcceptedIntake: number;
  medicalIntakeAccepted: number;
  explanation: string;
}

export interface DomainInterpretationStatus {
  domain: string;
  present: boolean;
  source: string | null;
  status: string;
}

export const FRONT_PAGE_EVIDENCE_ID_LIMIT = 12;

/** Concise evidence-ID line shared by screen, PDF and TXT (full lists stay in Scientific Findings). */
export function frontPageEvidenceLine(ids: readonly string[]): string {
  if (!ids.length) return "Evidence IDs for recorded differences: none";
  const shown = ids.slice(0, FRONT_PAGE_EVIDENCE_ID_LIMIT).join(", ");
  const more = ids.length - FRONT_PAGE_EVIDENCE_ID_LIMIT;
  return `Evidence IDs for recorded differences (${ids.length}): ${shown}${more > 0 ? ` … and ${more} more, all listed per metric in Scientific Findings` : ""}`;
}

export interface ScientificHealthSummary {
  frontPage: { keyPoints: string[]; evidenceIds: string[]; interpretationStatus: string };
  domainInterpretation: DomainInterpretationStatus[];
  evidenceTiers: { tier: keyof typeof EVIDENCE_TIER_LABELS; count: number; note: string }[];
  measured: string[];
  supported: string[];
  insufficient: string[];
  implications: HandbookImplication[];
  implicationGaps: string[];
  crossDomain: string[];
  uncertainty: string[];
  followUp: string[];
  reconciliation: DomainReconciliation[];
  boundaries: string[];
}

export function evidenceTierOf(row: ReportRow): EvidenceTier {
  if (row.badge === "wearable" || row.badge === "device") return "device_observation";
  return row.evidence.startsWith("unified-intake") ? "reviewer_accepted_intake" : "stored_observation";
}

type HandbookEntry = { handbook: string; reviewStatus: string; what?: string | null; increase?: string | null; decrease?: string | null; context?: string | null; linkage?: string | null };
let handbookCache: Map<string, HandbookEntry> | null = null;
function handbookIndex(): Map<string, HandbookEntry> {
  if (handbookCache) return handbookCache;
  const map = new Map<string, HandbookEntry>();
  for (const v of localizedBoneVariables())
    map.set(v.id, { handbook: "Astronaut Bone Health Handbook v7 (Nikolas)", reviewStatus: v.reviewStatus, what: v.what, increase: v.increase, decrease: v.decrease });
  for (const m of localizedCardiovascularMetrics())
    map.set(m.id, { handbook: "NASA Cardiovascular Handbook (Nikolas)", reviewStatus: m.reviewStatus, what: m.biology, context: m.context, linkage: m.linkage });
  handbookCache = map;
  return map;
}

const DOMAIN_BADGES = ["bone", "immune", "cardiovascular", "behavioral"] as const;

export function buildScientificHealthSummary(
  report: UnifiedHealthReport,
  findings: ScientificFindings,
  intake: HealthHistoryReport | null,
  attestation?: AttestationSummary | null,
): ScientificHealthSummary {
  const tierCount = (tier: EvidenceTier) => report.rows.filter((r) => evidenceTierOf(r) === tier).length;
  const evidenceTiers: ScientificHealthSummary["evidenceTiers"] = [
    { tier: "stored_observation", count: tierCount("stored_observation"), note: "Recorded in a Health module; a data-entry record, not a scientific approval." },
    { tier: "reviewer_accepted_intake", count: tierCount("reviewer_accepted_intake"), note: "Accepted row by row in Unified Intake; reviewer confirmation is not scientific validation." },
    { tier: "device_observation", count: tierCount("device_observation"), note: "Scalar device rows with declared provenance; device quality is shown as recorded." },
    { tier: "validated_interpretation", count: 0, note: "None. All handbook interpretations and catalog mappings remain pending independent scientific review (PENDING_NIKOLAS_REVIEW)." },
  ];

  const measured = report.summaries
    .filter((s) => s.included > 0)
    .map((s) => {
      const metrics = findings.metrics.filter((m) => report.rows.some((r) => r.badge === s.badge && r.metricId === m.metricId && r.unit === m.unit));
      const changed = metrics.filter((m) => m.trend === "descriptive_change" && m.delta !== 0).length;
      return `${REPORT_SOURCE_LABELS[s.badge]}: ${s.included} observation(s) across ${s.metrics} metric(s), ${s.firstAt} to ${s.lastAt}; ${changed} metric(s) show a first-to-last recorded difference.`;
    });

  const supported = findings.metrics
    .filter((m) => m.trend === "descriptive_change")
    .map((m) => `${m.label} (${m.metricId}): ${m.count} observations; ${m.earliestValue} → ${m.latestValue} ${m.unit} (difference ${m.delta} ${m.unit}). Descriptive only.`);
  const insufficient = findings.metrics
    .filter((m) => m.trend === "insufficient_evidence")
    .map((m) => `${m.label} (${m.metricId}): ${m.count} observation(s) — fewer than two comparable time points.`);

  const index = handbookIndex();
  const implications: HandbookImplication[] = [];
  const implicationGaps: string[] = [];
  for (const m of findings.metrics) {
    if (m.trend !== "descriptive_change" || m.delta === null) continue;
    const entry = index.get(m.metricId);
    const direction = m.delta > 0 ? "increase" : m.delta < 0 ? "decrease" : "unchanged";
    if (!entry) {
      implicationGaps.push(`${m.label} (${m.metricId}): no English handbook interpretation is documented for this catalog ID; no biological implication stated.`);
      continue;
    }
    if (direction === "unchanged") continue;
    const statement =
      direction === "increase" && entry.increase ? `Handbook context for an increase: ${entry.increase}`
      : direction === "decrease" && entry.decrease ? `Handbook context for a decrease: ${entry.decrease}`
      : entry.context ? `Handbook context: ${entry.context}`
      : null;
    if (!statement) {
      implicationGaps.push(`${m.label} (${m.metricId}): the handbook documents no direction-specific interpretation; no biological implication stated.`);
      continue;
    }
    implications.push({
      metricId: m.metricId,
      label: m.label,
      direction,
      statement: `${entry.what ? `${entry.what} ` : ""}${statement}`.trim(),
      handbook: entry.handbook,
      reviewStatus: entry.reviewStatus,
      evidenceIds: m.evidenceIds,
    });
  }

  const crossDomain = findings.crossDomain.map((c) => {
    const observed = c.signals.filter((s) => !c.missingSignals.includes(s));
    return `${c.domains.join(" + ")}: observed ${observed.join(", ") || "none"}; missing ${c.missingSignals.join(", ") || "none"}. ${c.missingSignals.length ? "No cross-domain association inferred." : "Co-observation only; association, causality and clinical significance are not established."}`;
  });

  const confounders = new Set<string>();
  for (const m of findings.metrics) {
    const linkage = index.get(m.metricId)?.linkage;
    if (linkage) confounders.add(`${m.label} (${m.metricId}) — handbook-listed related measures: ${linkage}`);
  }
  const uncertainty = [
    ...(findings.missingDomains.length ? [`No included data for: ${findings.missingDomains.map((d) => REPORT_SOURCE_LABELS[d as keyof typeof REPORT_SOURCE_LABELS] ?? d).join(", ")}. Missing data is not a negative finding.`] : []),
    ...(report.coverage.pendingReview ? [`${report.coverage.pendingReview} intake record(s) await human review and are not included.`] : []),
    ...(report.coverage.excluded ? [`${report.coverage.excluded} record(s) are excluded (erroneous, superseded, duplicate or incomplete) and listed with reasons below.`] : []),
    "Two-point differences carry no statistical significance; measurement method, timing, specimen handling and device quality are not evaluated by this summary.",
    ...[...confounders].map((c) => `Possible confounding or related context (documented): ${c}.`),
  ];

  const changedLabels = findings.metrics.filter((m) => m.trend === "descriptive_change" && m.delta !== 0).map((m) => m.label);
  const followUp = [
    ...(changedLabels.length ? [`A qualified Ground Medical reviewer may consider whether the recorded differences in ${changedLabels.join(", ")} are relevant in the crew member's full clinical context.`] : []),
    ...(insufficient.length ? [`Consider whether additional comparable measurements are needed for: ${findings.metrics.filter((m) => m.trend === "insufficient_evidence").map((m) => m.label).join(", ")}.`] : []),
    ...(report.coverage.pendingReview ? [`Consider completing human review of ${report.coverage.pendingReview} pending intake record(s) in Unified Intake.`] : []),
    ...findings.crossDomain.filter((c) => c.missingSignals.length).map((c) => `${c.domains.join(" + ")} context cannot be evaluated without: ${c.missingSignals.join(", ")}.`),
    "These are considerations for qualified human review only — not recommendations, diagnoses, treatment or fitness-for-duty judgments.",
  ];

  const reconciliation: DomainReconciliation[] = DOMAIN_BADGES.filter((b) => report.filters.sources.includes(b)).map((badge) => {
    const rows = report.rows.filter((r) => r.badge === badge);
    const stored = rows.filter((r) => evidenceTierOf(r) === "stored_observation").length;
    const accepted = rows.filter((r) => evidenceTierOf(r) === "reviewer_accepted_intake").length;
    const medicalIntakeAccepted = intake ? intake.observations.filter((o) => o.domain === badge).length : 0;
    const explanation =
      stored > 0 && medicalIntakeAccepted === 0
        ? "Included rows come from Health module entries; the Medical Intake section lists only reviewer-accepted Unified Intake observations, so it shows none for this domain."
        : medicalIntakeAccepted !== accepted
          ? "Medical Intake covers the full period without date or source filters and before cross-store deduplication; the domain overview applies the selected filters and counts identical readings once."
          : "Counts are consistent.";
    return { domain: REPORT_SOURCE_LABELS[badge], reportIncluded: rows.length, storedObservations: stored, reviewerAcceptedIntake: accepted, medicalIntakeAccepted, explanation };
  });

  const domainInterpretation: DomainInterpretationStatus[] = DOMAIN_BADGES.map((badge) => {
    const present = report.rows.some((r) => r.badge === badge);
    const governed = badge === "bone" || badge === "cardiovascular";
    return {
      domain: REPORT_SOURCE_LABELS[badge],
      present,
      source: governed
        ? badge === "bone" ? "Astronaut Bone Health Handbook v7 (Nikolas)" : "NASA Cardiovascular Handbook (Nikolas)"
        : null,
      status: governed
        ? "Handbook text quoted by exact catalog ID; machine-assisted English pending independent scientific review."
        : "No governed handbook interpretation is available; interpretation is pending scientific review and none is stated.",
    };
  });

  const presentDomains = report.summaries.filter((s) => s.included > 0).map((s) => REPORT_SOURCE_LABELS[s.badge]);
  const missingDomains = report.summaries.filter((s) => s.missing && report.filters.sources.includes(s.badge)).map((s) => REPORT_SOURCE_LABELS[s.badge]);
  const changed = findings.metrics.filter((m) => m.trend === "descriptive_change" && m.delta !== 0);
  const evidenceIds = [...new Set(changed.flatMap((m) => m.evidenceIds))];
  const frontPage = {
    keyPoints: [
      `${report.coverage.included} included observation(s) for ${report.scope.provenance.toUpperCase()} provenance across ${presentDomains.length ? presentDomains.join(", ") : "no domain"}.`,
      `${changed.length} metric(s) show a descriptive first-to-last recorded difference; ${insufficient.length} metric(s) have fewer than two comparable time points.`,
      missingDomains.length ? `No included data for ${missingDomains.join(", ")} — missing data is not a negative finding.` : "Every selected source has included data.",
      `${implications.length} handbook-quoted statement(s) apply to observed changes; 0 interpretations are scientifically validated (${"PENDING_NIKOLAS_REVIEW"}).`,
      ...(attestation ? [`Ground Medical attestation: ${attestation.attested} attested, ${attestation.notAttested} accepted without attestation, ${attestation.revoked} revoked.`] : []),
    ],
    evidenceIds,
    interpretationStatus: "Research summary only. Interpretations are quoted from governed handbooks, pending independent scientific review; immune and behavioral interpretations are not available until governed review is complete.",
  };

  return {
    frontPage,
    domainInterpretation,
    evidenceTiers,
    measured,
    supported,
    insufficient,
    implications,
    implicationGaps,
    crossDomain,
    uncertainty,
    followUp,
    reconciliation,
    boundaries: [
      "Research-use-only. No diagnosis, treatment, risk score or fitness-for-duty judgment is generated.",
      "Biological implications are quoted from Nikolas's handbooks (machine-assisted English, pending independent scientific review) and describe the measure, not this crew member's condition.",
      "AI-assisted drafts are unverified, are kept separate from these findings and are excluded from PDF and TXT exports.",
    ],
  };
}

export function scientificHealthSummaryPlainText(s: ScientificHealthSummary): string {
  const list = (items: readonly string[], empty: string) => (items.length ? items.map((i) => `- ${i}`) : [`- ${empty}`]);
  return [
    "SCIENTIFIC HEALTH SUMMARY — RESEARCH ONLY",
    "At a glance:",
    ...s.frontPage.keyPoints.map((p) => `- ${p}`),
    `- ${frontPageEvidenceLine(s.frontPage.evidenceIds)}`,
    `- ${s.frontPage.interpretationStatus}`,
    "Interpretation review status by domain:",
    ...s.domainInterpretation.map((d) => `- ${d.domain} (${d.present ? "data present" : "no included data"}): ${d.source ? `${d.source}. ` : ""}${d.status}`),
    "Evidence tiers:",
    ...s.evidenceTiers.map((t) => `- ${EVIDENCE_TIER_LABELS[t.tier]}: ${t.count}. ${t.note}`),
    "1. What was measured and changed",
    ...list(s.measured, "No included observations in this scope."),
    "2. Supported versus insufficient",
    ...list(s.supported.map((x) => `Supported (descriptive): ${x}`), "No metric has two comparable time points."),
    ...s.insufficient.map((x) => `- Insufficient: ${x}`),
    "3. Possible biological implications (handbook-documented, pending review)",
    ...list(s.implications.map((i) => `${i.label} (${i.metricId}, ${i.direction}): ${i.statement} [${i.handbook}; ${i.reviewStatus}; evidence ${i.evidenceIds.join(", ")}]`), "None documented for the observed changes."),
    ...s.implicationGaps.map((g) => `- Gap: ${g}`),
    "4. Nikolas-governed cross-domain context",
    ...list(s.crossDomain, "None."),
    "5. Missing data, uncertainty and confounders",
    ...list(s.uncertainty, "None listed."),
    "6. Qualified Ground Medical follow-up considerations",
    ...list(s.followUp, "None."),
    "Domain coverage vs Medical Intake:",
    ...s.reconciliation.map((r) => `- ${r.domain}: ${r.reportIncluded} included (${r.storedObservations} module, ${r.reviewerAcceptedIntake} intake); Medical Intake accepted ${r.medicalIntakeAccepted}. ${r.explanation}`),
    ...s.boundaries,
  ].join("\n");
}
