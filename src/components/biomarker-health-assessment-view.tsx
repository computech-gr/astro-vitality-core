import { AlertOctagon, AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import {
  MEASUREMENT_STATUS_LABELS,
  SEVERITY_LABELS,
  SEVERITY_MARKERS,
  SEVERITY_ORDER,
  severityCountsLine,
  type BiomarkerAssessment,
  type BiomarkerAssessmentReport,
  type Classification,
  type Severity,
} from "@/domain/health-intelligence/biomarker-health-assessment";

const TONE: Record<Severity, string> = {
  red: "border-severity-red text-severity-red bg-severity-red/10",
  amber: "border-severity-amber text-severity-amber bg-severity-amber/10",
  normal: "border-severity-normal text-severity-normal bg-severity-normal/10",
  neutral: "border-severity-neutral text-severity-neutral",
};
const ICON: Record<Severity, typeof AlertOctagon> = { red: AlertOctagon, amber: AlertTriangle, normal: CheckCircle2, neutral: CircleHelp };

/** Severity marker: icon + explicit text + colour (never colour alone). */
export function SeverityBadge({ severity, status }: { severity: Severity; status: Classification["status"] }) {
  const Icon = ICON[severity];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold ${TONE[severity]}`}
      data-severity={severity}
      title={SEVERITY_LABELS[severity]}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      <span>{SEVERITY_MARKERS[severity]}</span>
      <span className="font-normal">· {MEASUREMENT_STATUS_LABELS[status]}</span>
    </span>
  );
}

function Entry({ e }: { e: BiomarkerAssessment }) {
  const when = (at: string, p: "date" | "instant") => `${at}${p === "date" ? " (date only)" : ""}`;
  return (
    <li className="report-avoid-break min-w-0 space-y-1.5 rounded-md border border-border p-3 text-sm" data-testid="biomarker-assessment" data-severity={e.classification.severity}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="break-words font-semibold">
          {e.name}
          {e.name !== e.metricId ? <span className="font-normal text-muted-foreground"> ({e.metricId})</span> : null}
        </p>
        <SeverityBadge severity={e.classification.severity} status={e.classification.status} />
      </div>
      {e.nonClinicalLabel ? <p className="text-xs font-semibold text-muted-foreground">{e.nonClinicalLabel}</p> : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
        <dt className="text-muted-foreground">Result</dt>
        <dd className="tabular-nums">{e.latest.value} {e.unit} · {when(e.latest.observedAt, e.latest.precision)}</dd>
        <dt className="text-muted-foreground">Domain</dt>
        <dd>{e.domainLabel}</dd>
        <dt className="text-muted-foreground">Previous</dt>
        <dd className="break-words">{e.previous ? `${e.previous.value} ${e.unit} · ${when(e.previous.observedAt, e.previous.precision)}` : "None comparable"}</dd>
        <dt className="text-muted-foreground">Change</dt>
        <dd className="break-words">{e.change.text}</dd>
        <dt className="text-muted-foreground">Reference</dt>
        <dd className="break-words">{e.referenceText ?? "None verified for this exact biomarker, unit and domain"}{e.referenceCitation ? ` · ${e.referenceCitation}` : ""}</dd>
      </dl>
      <p className="break-words text-xs"><span className="font-medium">Classification basis: </span>{e.classification.explanation}</p>
      <p className="break-words"><span className="font-medium">What it measures: </span>{e.explanation}</p>
      {e.higherValues ? <p className="break-words text-xs"><span className="font-medium">Higher values: </span>{e.higherValues}</p> : null}
      {e.lowerValues ? <p className="break-words text-xs"><span className="font-medium">Lower values: </span>{e.lowerValues}</p> : null}
      {e.spaceflightContext ? <p className="break-words text-xs"><span className="font-medium">Spaceflight context: </span>{e.spaceflightContext}</p> : null}
      <details className="text-xs">
        <summary className="cursor-pointer">Citations, evidence quality, reviewer status and limitations</summary>
        <div className="mt-1 space-y-1">
          <p className="font-medium">Citations</p>
          {e.citations.length ? <ul className="space-y-0.5">{e.citations.map((c) => <li key={c} className="break-words">{c}</li>)}</ul> : <p className="text-muted-foreground">None</p>}
          <p><span className="font-medium">Evidence quality: </span>{e.evidenceQuality}</p>
          <p className="break-words"><span className="font-medium">Reviewer status: </span>{e.reviewerStatus}</p>
          <ul className="list-disc pl-4 text-muted-foreground">{e.limitations.map((l) => <li key={l} className="break-words">{l}</li>)}</ul>
          <p className="break-all font-mono text-muted-foreground">Evidence: {e.evidenceIds.join(", ")}</p>
        </div>
      </details>
    </li>
  );
}

/** Astronaut Health Report section (same read model as the PDF and TXT). */
export function BiomarkerHealthAssessmentView({ assessment }: { assessment: BiomarkerAssessmentReport }) {
  return (
    <section aria-label="Biomarker health assessment" className="space-y-3 rounded-lg border p-4" id="biomarker-health-assessment">
      <div className="report-avoid-break space-y-2">
        <h3 className="text-lg font-semibold">Biomarker health assessment</h3>
        <p className="text-sm font-semibold">Research use only — not a diagnosis. Status comes only from verified references.</p>
        <p className="text-sm" role="status">{severityCountsLine(assessment)}</p>
        <ul className="flex flex-wrap gap-2" aria-label="Severity key">
          {SEVERITY_ORDER.map((s) => (
            <li key={s} className="flex items-center gap-1 text-xs">
              <SeverityBadge severity={s} status={s === "red" ? "clinically_concerning" : s === "amber" ? "above_verified_reference" : s === "normal" ? "within_verified_reference" : "insufficient_evidence"} />
            </li>
          ))}
        </ul>
        <ul className="list-disc pl-5 text-xs text-muted-foreground">{assessment.policy.map((p) => <li key={p}>{p}</li>)}</ul>
      </div>
      {assessment.entries.length ? (
        <ul className="grid gap-2 md:grid-cols-2">{assessment.entries.map((e) => <Entry key={e.key} e={e} />)}</ul>
      ) : (
        <p className="text-sm text-muted-foreground">No included biomarker observations in this scope. Nothing is inferred.</p>
      )}
    </section>
  );
}
