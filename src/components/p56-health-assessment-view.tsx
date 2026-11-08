import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SeverityBadge } from "@/components/biomarker-health-assessment-view";
import {
  TREND_LABELS,
  formatResult,
  type Contributor,
  type Finding,
  type FindingState,
  type HealthAssessment,
  type TrendChart,
  type TrendDirection,
} from "@/domain/health-intelligence/p56-health-assessment";
import { RECOMMENDATION_CATEGORIES, RECOMMENDATION_CATEGORY_LABELS } from "@/domain/health-intelligence/p56-pattern-library";

const STATE_LABELS: Record<FindingState, string> = {
  validated_concern: "Validated concern",
  changed: "Changed between examinations",
  stable: "No recorded change",
  baseline: "Baseline — single examination",
};
const TREND_ICON: Record<TrendDirection, typeof ArrowUpRight> = { increase: ArrowUpRight, decrease: ArrowDownRight, stable: ArrowRight, insufficient: Minus };

function TrendMark({ direction }: { direction: TrendDirection }) {
  const Icon = TREND_ICON[direction];
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={TREND_LABELS[direction]}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {TREND_LABELS[direction]}
    </span>
  );
}

function ContributorRow({ c }: { c: Contributor }) {
  return (
    <li className="space-y-0.5 border-b border-border py-1.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="break-words font-medium">
          {formatResult(c.name, c.trend.latest.value, c.unit)}
          <span className="font-normal text-muted-foreground"> · {c.trend.latest.at.slice(0, 10)}{c.trend.latest.precision === "date" ? " (date only)" : ""}</span>
        </span>
        <span className="flex items-center gap-2">
          <TrendMark direction={c.trend.direction} />
          {c.severity !== "neutral" ? <SeverityBadge severity={c.severity} /> : null}
        </span>
      </div>
      <p className="break-words text-muted-foreground">{c.trend.text}</p>
      <p className="break-words text-muted-foreground">Classification: {c.classification}</p>
      {c.syntheticDemo ? <p className="font-semibold text-muted-foreground">Synthetic demonstration catalog entry — not scientifically validated.</p> : null}
      <p className="break-all font-mono text-muted-foreground">{c.metricId} · evidence {c.evidenceIds.join(", ")}</p>
    </li>
  );
}

function FindingCard({ f }: { f: Finding }) {
  return (
    <article className="report-avoid-break space-y-2 rounded-lg border border-border p-4" data-testid="p56-finding" data-state={f.state} data-severity={f.severity}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-base font-semibold">{f.title}</h4>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          {f.severity !== "neutral" ? <SeverityBadge severity={f.severity} /> : null}
          <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{STATE_LABELS[f.state]}</span>
          {f.exploratory ? <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-muted-foreground">Exploratory</span> : null}
        </span>
      </header>
      <p className="break-words text-sm"><span className="font-medium">What changed: </span>{f.whatChanged}</p>
      <p className="break-words text-sm text-muted-foreground"><span className="font-medium text-foreground">How they relate: </span>{f.relationship} {f.spaceflightContext}</p>
      <p className="break-words text-sm"><span className="font-medium">Interpretation: </span>{f.interpretation}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
        {f.uncertainty.map((u) => <li key={u} className="break-words">{u}</li>)}
      </ul>
      <details className="rounded-md border border-border p-2 text-xs print:hidden" data-testid="p56-why">
        <summary className="cursor-pointer font-medium">Why this conclusion?</summary>
        <div className="mt-2 space-y-2">
          <div>
            <p className="font-medium">Supporting measurements ({f.contributors.length})</p>
            <ul>{f.contributors.map((c) => <ContributorRow key={c.key} c={c} />)}</ul>
          </div>
          <div>
            <p className="font-medium">Rules applied</p>
            <ul className="list-disc pl-4">{f.why.rules.map((r) => <li key={r} className="break-words">{r}</li>)}</ul>
          </div>
          <p><span className="font-medium">Confidence: </span>{f.why.confidence.level} — {f.why.confidence.basis}</p>
          <p className="break-words">
            <span className="font-medium">Missing data: </span>
            {f.missingKeyEvidence.length ? f.missingKeyEvidence.join(", ") : "No key measurement of this group is missing."}
          </p>
          <div>
            <p className="font-medium">Condition patterns considered</p>
            <ul className="list-disc pl-4">
              {f.conditions.map((c) => (
                <li key={c.name} className="break-words">
                  {c.name}: {c.status === "possible_requires_evaluation" ? "possible — requires further evaluation" : "not assessable"}; requires {c.requires}.
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">Review status</p>
            <ul className="list-disc pl-4">{f.why.review.map((r) => <li key={r} className="break-words">{r}</li>)}</ul>
          </div>
          {f.why.references.length ? (
            <div>
              <p className="font-medium">Governed handbook context (exact catalog ID)</p>
              <ul className="list-disc pl-4">{f.why.references.map((r) => <li key={r} className="break-words">{r}</li>)}</ul>
            </div>
          ) : null}
          {f.why.automatedNotes.length ? (
            <div>
              <p className="font-medium">Validated automated notes</p>
              <ul className="list-disc pl-4">{f.why.automatedNotes.map((r) => <li key={r} className="break-words">{r}</li>)}</ul>
            </div>
          ) : null}
        </div>
      </details>
    </article>
  );
}

function TrendCard({ t }: { t: TrendChart }) {
  return (
    <figure className="report-avoid-break space-y-1 rounded-lg border border-border p-3" data-testid="p56-trend">
      <figcaption className="text-sm font-medium">
        {t.name} <span className="font-normal text-muted-foreground">[{t.unit}] · {t.findingTitle}</span>
      </figcaption>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={t.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={44} domain={["auto", "auto"]} />
            <Tooltip formatter={(v) => [`${v} ${t.unit}`, t.name]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
            <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">{t.trend.text}</p>
    </figure>
  );
}

/** P56 concise health assessment: the main report view (detailed evidence lives in the technical appendix). */
export function HealthAssessmentView({ assessment: a, automatedStatus }: { assessment: HealthAssessment; automatedStatus: string }) {
  const h = a.header;
  return (
    <section aria-label="Health assessment" className="space-y-6" data-testid="p56-health-assessment">
      <div className="space-y-1">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground">MITOCHONDRIA</p>
        <h2 className="text-2xl font-semibold">Health Assessment</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-sm">
          <dt className="text-muted-foreground">Astronaut</dt>
          <dd className="font-medium" data-testid="p56-astronaut">{h.astronaut}</dd>
          <dt className="text-muted-foreground">Mission</dt>
          <dd>{h.mission}</dd>
          <dt className="text-muted-foreground">Reporting period</dt>
          <dd>{h.period}</dd>
          <dt className="text-muted-foreground">Examinations</dt>
          <dd>{h.examinationDates.length ? h.examinationDates.join(", ") : "none in this period"}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd>{h.provenanceLabel}</dd>
        </dl>
      </div>

      <section aria-label="Overall health status" className="report-avoid-break space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-lg font-semibold">Overall health status</h3>
        {a.overview.map((p) => <p key={p} className="text-sm">{p}</p>)}
        <div>
          <h4 className="text-sm font-semibold">Most important findings</h4>
          <ul className="mt-1 space-y-1 text-sm" data-testid="p56-key-findings">
            {a.keyFindings.map((k) => (
              <li key={k.findingId} className="flex items-start gap-2">
                {k.severity !== "neutral" ? <SeverityBadge severity={k.severity} /> : <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />}
                <span className="break-words">{k.text}</span>
              </li>
            ))}
            {!a.keyFindings.length ? <li className="text-muted-foreground">No reviewed results in this period.</li> : null}
          </ul>
        </div>
        <div className="rounded-md border border-border p-3">
          <h4 className="text-sm font-semibold">Validated health warnings</h4>
          <p className="text-sm">{a.warningsStatement}</p>
          {a.warnings.length ? (
            <ul className="mt-1 space-y-1 text-sm">
              {a.warnings.map((w) => (
                <li key={w.text} className="flex items-start gap-2"><SeverityBadge severity={w.severity} /><span className="break-words">{w.text}</span></li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="text-sm"><span className="font-semibold">Follow-up priority: {a.followUp.label}</span> — {a.followUp.text}</p>
        <p className="text-xs text-muted-foreground">{a.completeness}</p>
      </section>

      <section aria-label="Key biological findings" className="space-y-3">
        <h3 className="text-lg font-semibold">Key biological findings</h3>
        <p className="text-xs text-muted-foreground">Related results are explained together. Colour and markers appear only for results classified against verified reference criteria.</p>
        {a.findings.map((f) => <FindingCard key={f.id} f={f} />)}
        {a.otherResults.statement ? <p className="text-xs text-muted-foreground">{a.otherResults.statement}</p> : null}
      </section>

      <section aria-label="Health assessment and recommendations" className="report-avoid-break space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-lg font-semibold">Health assessment and recommendations</h3>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <dt className="font-medium">Observed abnormal measurements (validated)</dt>
          <dd>{a.assessment.abnormal.length ? a.assessment.abnormal.join("; ") : "None — no result met verified reference criteria."}</dd>
          <dt className="font-medium">Longitudinal changes</dt>
          <dd>{a.assessment.changes.length ? <ul className="list-disc pl-4">{a.assessment.changes.map((c) => <li key={c}>{c}</li>)}</ul> : "None measurable in this period."}</dd>
          <dt className="font-medium">Possible condition-related patterns</dt>
          <dd>{a.assessment.possiblePatterns.length ? a.assessment.possiblePatterns.join("; ") : "None could be assessed: each requires verified criteria or clinician-confirmed evidence."}</dd>
          <dt className="font-medium">Requires further evaluation</dt>
          <dd><ul className="list-disc pl-4">{a.assessment.furtherEvaluation.map((c) => <li key={c}>{c}</li>)}</ul></dd>
          <dt className="font-medium">Confirmed diagnoses</dt>
          <dd>{a.assessment.confirmedDiagnoses}</dd>
        </dl>
        <div className="space-y-2" data-testid="p56-recommendations">
          <h4 className="text-sm font-semibold">Recommendations</h4>
          {RECOMMENDATION_CATEGORIES.filter((cat) => a.recommendations.some((r) => r.category === cat)).map((cat) => (
            <div key={cat} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{RECOMMENDATION_CATEGORY_LABELS[cat]}</p>
              <ul className="space-y-1.5 text-sm">
                {a.recommendations.filter((r) => r.category === cat).map((r) => (
                  <li key={r.id} className="space-y-0.5">
                    <p className="break-words">{r.text}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className={r.authorization === "clinician_required" ? "font-semibold" : ""}>{r.authorizationLabel}</span> · Based on: {r.basis.join("; ")}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Longitudinal trends" className="space-y-3">
        <h3 className="text-lg font-semibold">Longitudinal trends</h3>
        <p className="text-xs text-muted-foreground">{a.trendNote}</p>
        {a.trends.length ? <div className="grid gap-3 md:grid-cols-2">{a.trends.map((t) => <TrendCard key={t.key} t={t} />)}</div> : null}
      </section>

      <p className="text-xs text-muted-foreground" data-testid="p56-disclosure">
        {a.disclosure} <span className="print:hidden">{automatedStatus}</span>
      </p>
    </section>
  );
}
