/**
 * P58 — professional report read model (pure). One model feeds the screen,
 * the adaptive PDF and the TXT export: the P56 assessment (summary, findings),
 * the P58 preliminary clinical assessment, mandatory charts, merged
 * recommendations without duplicates, a deterministic Evidence ID and a
 * separate audit trail. There is no page cap: length follows the clinically
 * relevant content.
 */
import type { BiomarkerAssessmentReport } from "./biomarker-health-assessment";
import type { HealthAssessment } from "./p56-health-assessment";
import { AUTHORIZATION_LABELS, RECOMMENDATION_CATEGORIES, RECOMMENDATION_CATEGORY_LABELS, type RecommendationAuthorization, type RecommendationCategory } from "./p56-pattern-library";
import {
  CRITERION_STATUS_TEXT,
  buildPreliminaryClinicalAssessment,
  clinicalAuditTrail,
  concernReviewStatus,
  stableHash,
  type ClinicalAuditRecord,
  type ClinicianDecision,
  type ConcernReviewStatus,
  type PreliminaryClinicalAssessment,
} from "./p58-clinical-reasoning";
import { buildReportCharts, type ChartSection } from "./p58-report-charts";
import { redactProhibitedNames } from "./report-identity-redaction";

export const PROFESSIONAL_REPORT_SCHEMA = "mitochondria.p58-professional-report.v1" as const;
export const PROFESSIONAL_DISCLOSURE =
  "Research-use automated health assessment built only from reviewer-accepted records. The preliminary clinical assessment lists possible concerns for an authorized Ground Medical clinician to evaluate; it is not a diagnosis, assigns no probabilities and contains no medication or dose advice. Results are coloured only when an approved reference criterion applies.";

export interface MergedRecommendation {
  id: string;
  category: RecommendationCategory;
  categoryLabel: string;
  authorization: RecommendationAuthorization;
  authorizationLabel: string;
  text: string;
  basis: string[];
  origin: "clinical_concern" | "pattern" | "ai_lifestyle";
  priority: boolean;
}
export interface ProfessionalReport {
  schema: typeof PROFESSIONAL_REPORT_SCHEMA;
  evidenceId: string;
  assessment: HealthAssessment;
  clinical: PreliminaryClinicalAssessment;
  charts: ChartSection;
  recommendations: MergedRecommendation[];
  kpis: { validatedAlerts: number; concerns: number; reviewFlags: number; dataChecks: number; measurements: number; examinations: number };
  review: { label: string; statuses: Record<string, ConcernReviewStatus>; added: ClinicianDecision[] };
  audit: ClinicalAuditRecord[];
  disclosure: string;
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function evidenceIdOf(a: HealthAssessment, clinical: PreliminaryClinicalAssessment, biomarkers: BiomarkerAssessmentReport): string {
  const contributors = a.findings
    .flatMap((f) => f.contributors)
    .map((c) => [c.key, c.severity, (c.trend.profile?.points ?? []).map((p) => [p.day, p.valueText]), c.trend.latest.value])
    .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  const h = stableHash([PROFESSIONAL_REPORT_SCHEMA, a.header.astronaut, a.header.mission, a.header.period, a.header.examinationDates, a.header.provenance, contributors, clinical.concerns.map((c) => c.fingerprint), biomarkers.criteria?.approved ?? 0]);
  return `MITO-EV-${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}`.toUpperCase();
}

export interface ProfessionalReportInput {
  assessment: HealthAssessment;
  biomarkers: BiomarkerAssessmentReport;
  /** Pre-built (e.g. AI-merged) clinical assessment; built deterministically when omitted. */
  clinical?: PreliminaryClinicalAssessment;
  decisions?: readonly ClinicianDecision[];
  scope?: ClinicianDecision["scope"] | null;
}

export function buildProfessionalReport(input: ProfessionalReportInput): ProfessionalReport {
  const a = input.assessment;
  const clinical = input.clinical ?? buildPreliminaryClinicalAssessment({ assessment: a, biomarkers: input.biomarkers });
  const charts = buildReportCharts(a, input.biomarkers);
  const decisions = input.decisions ?? [];

  const recs: MergedRecommendation[] = [];
  const seen = new Set<string>();
  const push = (r: Omit<MergedRecommendation, "id" | "categoryLabel">) => {
    const k = norm(r.text);
    if (seen.has(k)) return;
    seen.add(k);
    recs.push({ ...r, id: "", categoryLabel: RECOMMENDATION_CATEGORY_LABELS[r.category] });
  };
  for (const c of clinical.concerns)
    for (const r of c.recommendations)
      push({ category: r.category, authorization: r.authorization, authorizationLabel: r.authorizationLabel, text: r.text, basis: r.basis, origin: "clinical_concern", priority: c.priority === "high" || c.priority === "prompt" });
  for (const l of clinical.lifestyle) {
    const c = clinical.concerns.find((x) => x.concernId === l.concernId);
    push({ category: l.category, authorization: "general_wellness", authorizationLabel: AUTHORIZATION_LABELS.general_wellness, text: `${l.text} (AI-assisted, validated)`, basis: c ? [c.title] : [], origin: "ai_lifestyle", priority: false });
  }
  for (const r of a.recommendations) {
    // A pattern recommendation in the same category as a concern recommendation for the same finding is the less specific duplicate.
    const dup = clinical.concerns.some((c) => c.findingId && r.findingIds.includes(c.findingId) && c.recommendations.some((x) => x.category === r.category));
    if (dup) continue;
    push({ category: r.category, authorization: r.authorization, authorizationLabel: r.authorizationLabel, text: r.text, basis: r.basis, origin: "pattern", priority: r.priority });
  }
  recs.sort((x, y) => RECOMMENDATION_CATEGORIES.indexOf(x.category) - RECOMMENDATION_CATEGORIES.indexOf(y.category) || Number(y.priority) - Number(x.priority));
  recs.forEach((r, i) => (r.id = `R${i + 1}`));

  const scope = input.scope ?? null;
  const statuses: Record<string, ConcernReviewStatus> = {};
  for (const c of clinical.concerns) statuses[c.concernId] = scope ? concernReviewStatus(c, decisions, scope) : { status: "pending", label: "Pending Ground Medical review", text: null };
  const reviewed = Object.values(statuses).filter((s) => s.status === "accepted" || s.status === "amended" || s.status === "rejected").length;
  const all = a.findings.flatMap((f) => f.contributors);

  return {
    schema: PROFESSIONAL_REPORT_SCHEMA,
    evidenceId: evidenceIdOf(a, clinical, input.biomarkers),
    assessment: a,
    clinical,
    charts,
    recommendations: recs,
    kpis: {
      validatedAlerts: a.warnings.length,
      concerns: clinical.concerns.length,
      reviewFlags: a.priorities.reviewRequired.length,
      dataChecks: a.priorities.dataQuality.length,
      measurements: new Set(all.map((c) => c.key)).size,
      examinations: a.header.examinationDates.length,
    },
    review: {
      label: !clinical.concerns.length
        ? "No preliminary clinical concern listed."
        : reviewed === 0
          ? "Pending Ground Medical review"
          : `${reviewed} of ${clinical.concerns.length} concern(s) reviewed by Ground Medical in this session (session review — not persisted, not a diagnosis)`,
      statuses,
      added: decisions.filter((d) => d.decision === "add" && scope && d.scope.missionId === scope.missionId && d.scope.crewMemberId === scope.crewMemberId),
    },
    audit: clinicalAuditTrail(clinical, decisions, a.header.generatedAt),
    disclosure: PROFESSIONAL_DISCLOSURE,
  };
}

/** TXT export: the same content and order as the PDF. */
export function professionalReportPlainText(r: ProfessionalReport): string {
  const a = r.assessment;
  const h = a.header;
  const L: string[] = [];
  const sec = (t: string) => L.push("", t.toUpperCase(), "=".repeat(Math.min(80, t.length)));
  L.push("MITOCHONDRIA — ASTRONAUT HEALTH ASSESSMENT", `Evidence ID: ${r.evidenceId}`, "");
  L.push(`Astronaut: ${h.astronaut}`, `Mission: ${h.mission}`, `Reporting period: ${h.period}`, `Examinations: ${h.examinationDates.join(", ") || "none"}`, `Data: ${h.provenanceLabel}`);
  sec("Key conclusions");
  L.push(...a.overview, "");
  for (const k of a.keyFindings) L.push(`- ${k.text}`);
  L.push("", `Validated clinical alerts: ${a.warningsStatement}`, ...a.warnings.map((w) => `  ${w.marker} ${w.text}`));
  L.push(`Clinical severity: ${a.followUp.clinicalSeverity}`, `Follow-up priority: ${a.followUp.label} — ${a.followUp.text}`, `Ground Medical review: ${r.review.label}`);
  sec("Key findings");
  for (const f of a.findings) {
    L.push("", `${f.title}${f.severity !== "neutral" ? ` [${f.marker}]` : ""}`, `What changed: ${f.whatChanged}`, `Interpretation: ${f.interpretation}`);
    for (const u of f.uncertainty) L.push(`  Uncertainty: ${u}`);
  }
  sec("Visual summary");
  L.push(r.charts.note);
  for (const c of r.charts.charts)
    L.push(`- ${c.name} [${c.unit}]: ${c.points.map((p) => `${p.day} ${p.valueText}${p.annotation ? ` (${p.annotation})` : ""}`).join(" → ")}. ${c.caption}${c.limitation ? ` ${c.limitation}` : ""}`);
  for (const o of r.charts.omitted) L.push(`  Not charted: ${o.name} — ${o.reason}`);
  sec(r.clinical.title);
  L.push(r.clinical.diagnosisStatement);
  for (const c of r.clinical.concerns) {
    const st = r.review.statuses[c.concernId];
    L.push("", `${c.title}`, `Review priority: ${c.priorityLabel}`, `Ground Medical status: ${st?.label ?? "Pending Ground Medical review"}${st?.text ? ` — ${st.text}` : ""}`);
    L.push(`What happened: ${c.narrative.whatHappened}`, `Why it matters: ${c.narrative.whyItMatters}`);
    const list = (title: string, items: string[]) => items.length && L.push(`${title}:`, ...items.map((x) => `  - ${x}`));
    list("Supporting evidence", c.supporting);
    list("Contradicting evidence", c.contradicting);
    list("Alternative explanations", c.alternatives);
    list("Missing tests and information", c.missing);
    list("Diagnostic criteria", c.criteria.map((x) => `${CRITERION_STATUS_TEXT[x.status]} — ${x.title} (${x.source}): ${x.detail}`));
    list("Confirmation steps", c.confirmation);
    list("Possible mechanisms", c.narrative.mechanisms);
    list("Ground Medical should verify", c.narrative.groundMedicalVerify);
    list("AI-assisted notes (validated)", c.aiNotes.map((n) => `${n.section}: ${n.text}`));
  }
  for (const x of r.clinical.crossDomain) L.push("", `Cross-domain (${x.origin === "ai_assisted" ? "AI-assisted, validated" : "deterministic"}): ${x.text}`);
  for (const d of r.review.added) L.push("", `Clinician-added assessment (${d.reviewedAt}): ${d.text}`);
  sec("Recommendations");
  for (const c of RECOMMENDATION_CATEGORIES) {
    const items = r.recommendations.filter((x) => x.category === c);
    if (!items.length) continue;
    L.push("", RECOMMENDATION_CATEGORY_LABELS[c]);
    for (const x of items) L.push(`  ${x.id}. ${x.text}`, `      ${x.authorizationLabel} · Based on: ${x.basis.join("; ")}`);
  }
  sec("Methodology and evidence");
  L.push(a.methodology, a.completeness, `Concern library v${r.clinical.library.version} (${r.clinical.library.status}). ${r.clinical.aiStatus}`);
  for (const g of r.clinical.evidenceGaps) L.push(`Evidence gap: ${g.label} — ${g.reason}`);
  L.push("", "Audit trail (kept separate from AI output):", ...r.audit.map((x) => `  ${x.at} ${x.kind}: ${x.summary}`));
  L.push("", r.disclosure, a.disclosure);
  return redactProhibitedNames(L.join("\n"));
}
