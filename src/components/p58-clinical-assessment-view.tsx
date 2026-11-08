import { useState } from "react";
import { Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CRITERION_STATUS_TEXT, type ClinicalConcern, type ClinicianDecisionKind } from "@/domain/health-intelligence/p58-clinical-reasoning";
import type { ProfessionalReport } from "@/domain/health-intelligence/p58-professional-report";

const PRIORITY_TONE: Record<ClinicalConcern["priority"], string> = {
  high: "border-severity-red text-severity-red",
  prompt: "border-dashed border-review-flag text-review-flag",
  measurement_check: "border-dashed border-review-flag text-review-flag",
  routine: "border-border text-muted-foreground",
};

function Rows({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <>
      <dt className="font-medium">{title}</dt>
      <dd>
        {items.length === 1 ? (
          <p className="break-words">{items[0]}</p>
        ) : (
          <ul className="list-disc space-y-0.5 pl-4">{items.map((x) => <li key={x} className="break-words">{x}</li>)}</ul>
        )}
      </dd>
    </>
  );
}

function ReviewControls({ concern, onDecide }: { concern: ClinicalConcern | null; onDecide: (concern: ClinicalConcern | null, decision: ClinicianDecisionKind, text: string) => string | null }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const act = (d: ClinicianDecisionKind) => {
    const problem = onDecide(concern, d, text);
    setMessage(problem ?? "Recorded for this session (not persisted; not a diagnosis).");
    if (!problem) setText("");
  };
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-2 print:hidden" aria-label={concern ? `Ground Medical review of ${concern.title}` : "Add clinician assessment"}>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={concern ? "Clinical note: reason for accepting, amended assessment or reason for rejecting." : "Your own clinical assessment for this period."} aria-label={concern ? "Clinical review note" : "Clinician assessment"} />
      <div className="flex flex-wrap gap-2">
        {concern ? (
          <>
            <Button type="button" size="sm" onClick={() => act("accept")}>Accept</Button>
            <Button type="button" size="sm" variant="outline" className="text-foreground" onClick={() => act("amend")}>Amend</Button>
            <Button type="button" size="sm" variant="outline" className="text-foreground" onClick={() => act("reject")}>Reject</Button>
          </>
        ) : (
          <Button type="button" size="sm" onClick={() => act("add")}>Add assessment</Button>
        )}
      </div>
      {message ? <p className="text-xs" role="status">{message}</p> : null}
    </div>
  );
}

/** P58 "Preliminary Clinical Assessment — Pending Ground Medical Review" with session-only clinician review. */
export function ClinicalAssessmentView({
  report,
  canReview,
  onDecide,
}: {
  report: ProfessionalReport;
  canReview: boolean;
  onDecide: (concern: ClinicalConcern | null, decision: ClinicianDecisionKind, text: string) => string | null;
}) {
  const c = report.clinical;
  return (
    <section aria-label={c.title} className="space-y-3" data-testid="p58-clinical-assessment">
      <h3 className="flex items-center gap-2 text-lg font-semibold">
        <Stethoscope className="h-5 w-5 text-primary" aria-hidden />
        {c.title}
      </h3>
      <p className="text-sm">{c.diagnosisStatement}</p>
      <p className="text-xs text-muted-foreground">{report.review.label} · {c.aiStatus}</p>
      {!c.concerns.length ? <p className="text-sm text-muted-foreground">No concern pattern is supported by the recorded evidence in this period.</p> : null}
      {c.concerns.map((x) => {
        const st = report.review.statuses[x.concernId];
        return (
          <article key={x.id} className="report-avoid-break space-y-2 rounded-lg border border-border p-4" data-testid="p58-concern" data-priority={x.priority}>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-base font-semibold">{x.title}</h4>
              <span className={`rounded border px-1.5 py-0.5 text-xs font-semibold ${PRIORITY_TONE[x.priority]}`}>{x.priorityLabel}</span>
            </header>
            <p className="text-sm font-medium" data-testid="p58-review-status">{st?.label ?? "Pending Ground Medical review"}{st?.text ? ` — ${st.text}` : ""}</p>
            <dl className="grid gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
              <Rows title="What happened" items={[x.narrative.whatHappened]} />
              <Rows title="Why it matters" items={[x.narrative.whyItMatters]} />
              <Rows title="Supporting evidence" items={x.supporting} />
              <Rows title="Contradicting evidence" items={x.contradicting} />
              <Rows title="Alternative explanations" items={x.alternatives} />
              <Rows title="Missing tests and information" items={x.missing} />
              <Rows title="Diagnostic criteria" items={x.criteria.length ? x.criteria.map((k) => `${CRITERION_STATUS_TEXT[k.status]} — ${k.title} (${k.source}): ${k.detail}`) : ["No standardized criterion is available for this concern in the registry."]} />
              <Rows title="Confirmation steps" items={x.confirmation} />
              <Rows title="Possible mechanisms" items={x.narrative.mechanisms} />
              <Rows title="Ground Medical should verify" items={x.narrative.groundMedicalVerify} />
              <Rows title="AI-assisted notes (validated)" items={x.aiNotes.map((n) => n.text)} />
            </dl>
            {canReview ? <ReviewControls concern={x} onDecide={onDecide} /> : null}
          </article>
        );
      })}
      {c.crossDomain.map((x) => (
        <p key={x.text} className="rounded-md border border-border bg-muted p-3 text-sm">
          <span className="font-medium">{x.origin === "ai_assisted" ? "Cross-domain (AI-assisted, validated): " : "Cross-domain observation: "}</span>
          {x.text}
        </p>
      ))}
      {report.review.added.map((d) => (
        <p key={d.id} className="rounded-md border border-border p-3 text-sm"><span className="font-medium">Clinician-added assessment: </span>{d.text}</p>
      ))}
      {canReview ? <ReviewControls concern={null} onDecide={onDecide} /> : null}
      <details className="rounded-md border border-border p-2 text-xs print:hidden" data-testid="p58-evidence-trail">
        <summary className="cursor-pointer font-medium">Evidence trail · {report.evidenceId}</summary>
        <div className="mt-2 space-y-2">
          <p>Concern library v{c.library.version} ({c.library.status === "PENDING_SCIENTIFIC_REVIEW" ? "pending scientific review" : c.library.status}). Concern fingerprints: {c.concerns.map((x) => `${x.concernId} ${x.fingerprint}`).join("; ") || "none"}.</p>
          {c.evidenceGaps.length ? (
            <div>
              <p className="font-medium">Evidence gaps (Researcher literature retrieval can address these)</p>
              <ul className="list-disc pl-4">{c.evidenceGaps.map((g) => <li key={g.id} className="break-words">{g.label} — {g.reason}</li>)}</ul>
            </div>
          ) : null}
          {c.rejectedAi.length ? (
            <div>
              <p className="font-medium">Rejected AI statements</p>
              <ul className="list-disc pl-4">{c.rejectedAi.map((r, i) => <li key={i} className="break-words">{r.section}: {r.reason}</li>)}</ul>
            </div>
          ) : null}
          <div>
            <p className="font-medium">Audit trail (separate from AI output)</p>
            <ul className="list-disc pl-4">{report.audit.map((a) => <li key={a.ref + a.at} className="break-words">{a.at} · {a.kind === "ai_generation" ? "assessment generation" : "clinician decision"} · {a.summary}</li>)}</ul>
          </div>
        </div>
      </details>
    </section>
  );
}
