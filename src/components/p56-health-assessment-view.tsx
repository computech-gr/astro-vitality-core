import { ArrowDownRight, ArrowRight, ArrowUpRight, Flag, Minus, SearchCheck } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SeverityBadge } from "@/components/biomarker-health-assessment-view";
import type { Severity } from "@/domain/health-intelligence/biomarker-health-assessment";
import {
  DATA_QUALITY_LABEL,
  PATTERN_LABELS,
  REVIEW_FLAG_LABEL,
  TREND_LABELS,
  formatResult,
  type Contributor,
  type Finding,
  type FindingState,
  type HealthAssessment,
  type ReviewPriority,
  type TrendChart,
  type TrendDirection,
} from "@/domain/health-intelligence/p56-health-assessment";
import { RECOMMENDATION_CATEGORY_LABELS } from "@/domain/health-intelligence/p56-pattern-library";

const STATE_LABELS: Record<FindingState, string> = {
  validated_concern: "Validated concern",
  changed: "Changed between examinations",
  stable: "No recorded change",
  baseline: "Baseline — single examination",
};
const TREND_ICON: Record<TrendDirection, typeof ArrowUpRight> = { increase: ArrowUpRight, decrease: ArrowDownRight, stable: ArrowRight, insufficient: Minus };
/** Validated adverse findings are shown in red/amber text throughout (always with a text marker). */
const SEVERITY_TEXT: Record<Severity, string> = { red: "text-severity-red", amber: "text-severity-amber", normal: "", neutral: "" };

function TrendMark({ direction }: { direction: TrendDirection }) {
  const Icon = TREND_ICON[direction];
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={TREND_LABELS[direction]}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {TREND_LABELS[direction]}
    </span>
  );
}

/** Review-triage indicator: icon + text, distinct from clinical severity colours. */
export function ReviewBadge({ kind }: { kind: Exclude<ReviewPriority, "none"> }) {
  const Icon = kind === "priority_review" ? Flag : SearchCheck;
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-dashed border-review-flag px-1.5 py-0.5 text-xs font-semibold text-review-flag"
      data-review={kind}
      title="Review triage under explicit rules — not a clinical classification"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {kind === "priority_review" ? REVIEW_FLAG_LABEL : DATA_QUALITY_LABEL}
    </span>
  );
}

function ContributorRow({ c }: { c: Contributor }) {
  const p = c.trend.profile;
  return (
    <li className="space-y-0.5 border-b border-border py-1.5 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`break-words font-medium ${SEVERITY_TEXT[c.severity]}`}>
          {formatResult(c.name, c.trend.latest.value, c.unit)}
          <span className="font-normal text-muted-foreground"> · {c.trend.latest.at.slice(0, 10)}{c.trend.latest.precision === "date" ? " (date only)" : ""}</span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <TrendMark direction={c.trend.direction} />
          {c.review.flags.some((f) => f.kind === "priority_review") ? <ReviewBadge kind="priority_review" /> : c.review.flags.length ? <ReviewBadge kind="data_quality_review" /> : null}
          {c.severity !== "neutral" ? <SeverityBadge severity={c.severity} /> : null}
        </span>
      </div>
      <p className="break-words text-muted-foreground">{c.trend.text}</p>
      {p && p.steps.length ? (
        <p className="break-words text-muted-foreground">
          {c.trend.pattern !== "not_comparable" ? PATTERN_LABELS[c.trend.pattern] : "Not comparable"} · {p.points.length} examinations · min {p.min.valueText} ({p.min.day}) · max {p.max.valueText} ({p.max.day}) · {p.reversals} reversal{p.reversals === 1 ? "" : "s"}
        </p>
      ) : null}
      {c.review.flags.map((f) => (
        <p key={f.ruleId} className="break-words text-review-flag">{f.ruleId}: {f.text}</p>
      ))}
      <p className="break-words text-muted-foreground">Mathematical: {c.interpretability.mathematical} Biological plausibility: {c.interpretability.biological} Clinical: {c.interpretability.clinical}</p>
      {c.syntheticDemo ? <p className="font-semibold text-muted-foreground">Synthetic demonstration catalog entry — not scientifically validated.</p> : null}
      <p className="break-all font-mono text-muted-foreground">{c.metricId} · evidence {c.evidenceIds.join(", ")}</p>
    </li>
  );
}

function FindingCard({ f }: { f: Finding }) {
  const tone = SEVERITY_TEXT[f.severity];
  return (
    <article className="report-avoid-break space-y-2 rounded-lg border border-border p-4" data-testid="p56-finding" data-state={f.state} data-severity={f.severity} data-review={f.reviewPriority}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={`text-base font-semibold ${tone}`}>{f.title}</h4>
        <span className="flex flex-wrap items-center gap-2 text-xs">
          {f.severity !== "neutral" ? <SeverityBadge severity={f.severity} /> : null}
          {f.reviewPriority !== "none" ? <ReviewBadge kind={f.reviewPriority} /> : null}
          <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">{STATE_LABELS[f.state]}</span>
          {f.exploratory ? <span className="rounded border border-dashed border-border px-1.5 py-0.5 text-muted-foreground">Exploratory</span> : null}
        </span>
      </header>
      <p className={`break-words text-sm ${tone}`}><span className="font-medium">What changed: </span>{f.whatChanged}</p>
      {f.combined ? <p className="break-words text-sm"><span className="font-medium">Together: </span>{f.combined}</p> : null}
      <p className="break-words text-sm"><span className="font-medium">How they relate: </span><span className="text-muted-foreground">{f.relationship} {f.spaceflightContext}</span></p>
      <p className={`break-words text-sm ${tone}`}><span className="font-medium">Interpretation: </span>{f.interpretation}</p>
      {f.uncertainty.length ? (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
          {f.uncertainty.map((u) => <li key={u} className="break-words">{u}</li>)}
        </ul>
      ) : null}
      <details className="rounded-md border border-border p-2 text-xs print:hidden" data-testid="p56-why">
        <summary className="cursor-pointer font-medium">Why this conclusion?</summary>
        <div className="mt-2 space-y-2">
          <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
            <dt className="font-medium">Observations</dt><dd className="break-words">{f.reasoning.observations}</dd>
            <dt className="font-medium">Changes over time</dt><dd className="break-words">{f.reasoning.changes}</dd>
            <dt className="font-medium">Relationship status</dt><dd className="break-words">{f.reasoning.relationshipStatus}</dd>
            <dt className="font-medium">Combined interpretation</dt><dd className="break-words">{f.reasoning.combinedSupport}</dd>
            <dt className="font-medium">Missing evidence</dt><dd className="break-words">{f.reasoning.missingEvidence}</dd>
            <dt className="font-medium">Justified follow-up</dt><dd className="break-words">{f.reasoning.followUp}</dd>
          </dl>
          <div>
            <p className="font-medium">Supporting measurements ({f.contributors.length})</p>
            <ul>{f.contributors.map((c) => <ContributorRow key={c.key} c={c} />)}</ul>
          </div>
          <div>
            <p className="font-medium">Rules applied</p>
            <ul className="list-disc pl-4">{f.why.rules.map((r) => <li key={r} className="break-words">{r}</li>)}</ul>
          </div>
          <p><span className="font-medium">Confidence: </span>{f.why.confidence.level} — {f.why.confidence.basis}</p>
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
  const x = t.trend.profile?.intermediate?.point;
  return (
    <figure className="report-avoid-break space-y-1 rounded-lg border border-border p-3" data-testid="p56-trend">
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
        <span>
          {t.name} <span className="font-normal text-muted-foreground">[{t.unit}] · {t.findingTitle}</span>
        </span>
        {t.flagged ? <ReviewBadge kind={t.trend.profile && t.trend.profile.steps.length && t.trend.pattern !== "not_comparable" && t.points.length ? "priority_review" : "data_quality_review"} /> : null}
      </figcaption>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={t.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={44} domain={["auto", "auto"]} />
            <Tooltip formatter={(v) => [`${v} ${t.unit}`, t.name]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
            <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
            {x ? <ReferenceDot x={x.day} y={x.value} r={5} fill="var(--review-flag)" stroke="var(--background)" /> : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">{t.trend.text}</p>
    </figure>
  );
}

function PriorityList({ title, items, kind }: { title: string; items: { text: string; ruleId?: string }[]; kind?: Exclude<ReviewPriority, "none"> }) {
  return (
    <div className="space-y-1">
      <h5 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {title} <span className="font-normal text-muted-foreground">({items.length})</span>
      </h5>
      {items.length ? (
        <ul className="space-y-1 text-sm">
          {items.map((i) => (
            <li key={i.text} className={`flex items-start gap-2 break-words ${kind ? "text-review-flag" : ""}`}>
              {kind ? (kind === "priority_review" ? <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Review flag" /> : <SearchCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-label="Data check" />) : null}
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None.</p>
      )}
    </div>
  );
}

/** P56 concise health assessment: the main report view (detailed evidence lives in the technical appendix). */
export function HealthAssessmentView({ assessment: a, automatedStatus }: { assessment: HealthAssessment; automatedStatus: string }) {
  const h = a.header;
  const pr = a.priorities;
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

      <section aria-label="Overall assessment" className="report-avoid-break space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-lg font-semibold">Overall assessment</h3>
        {a.overview.map((p) => <p key={p} className="text-sm">{p}</p>)}
        <div>
          <h4 className="text-sm font-semibold">Most important findings</h4>
          <ul className="mt-1 space-y-1 text-sm" data-testid="p56-key-findings">
            {a.keyFindings.map((k) => (
              <li key={k.findingId} className={`flex items-start gap-2 ${SEVERITY_TEXT[k.severity]}`}>
                {k.severity !== "neutral" ? (
                  <SeverityBadge severity={k.severity} />
                ) : k.review !== "none" ? (
                  k.review === "priority_review" ? <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-review-flag" aria-label={REVIEW_FLAG_LABEL} /> : <SearchCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-review-flag" aria-label={DATA_QUALITY_LABEL} />
                ) : (
                  <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                )}
                <span className="break-words">{k.text}</span>
              </li>
            ))}
            {!a.keyFindings.length ? <li className="text-muted-foreground">No reviewed results in this period.</li> : null}
          </ul>
        </div>
        <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-2" data-testid="p56-priorities">
          <div className="space-y-1 md:col-span-2">
            <h4 className="text-sm font-semibold">Validated clinical alerts</h4>
            <p className="text-sm">{a.warningsStatement}</p>
            {a.warnings.length ? (
              <ul className="mt-1 space-y-1 text-sm">
                {a.warnings.map((w) => (
                  <li key={w.text} className={`flex items-start gap-2 ${SEVERITY_TEXT[w.severity]}`}><SeverityBadge severity={w.severity} /><span className="break-words">{w.text}</span></li>
                ))}
              </ul>
            ) : null}
          </div>
          <PriorityList title="Significant changes requiring review" items={pr.reviewRequired} kind="priority_review" />
          <PriorityList title="Data-quality and plausibility checks" items={pr.dataQuality} kind="data_quality_review" />
          {pr.exploratory.length ? <PriorityList title="Exploratory observations" items={pr.exploratory} /> : null}
          <div className="space-y-1">
            <h5 className="text-sm font-semibold">Routine</h5>
            <p className="text-sm text-muted-foreground">{pr.routine.text}</p>
          </div>
        </div>
        <p className="text-sm"><span className="font-semibold">Clinical severity: </span>{a.followUp.clinicalSeverity}</p>
        <p className="text-sm"><span className="font-semibold">Follow-up priority: {a.followUp.label}</span> — {a.followUp.text}</p>
        <p className="text-xs text-muted-foreground">{a.completeness}</p>
        <p className="text-xs text-muted-foreground" data-testid="p56-methodology">{a.methodology}</p>
      </section>

      <section aria-label="Key biological findings" className="space-y-3">
        <h3 className="text-lg font-semibold">Key biological findings</h3>
        {a.findings.map((f) => <FindingCard key={f.id} f={f} />)}
        {a.otherResults.statement ? <p className="text-xs text-muted-foreground">{a.otherResults.statement}</p> : null}
      </section>

      <section aria-label="Recommendations" className="report-avoid-break space-y-3 rounded-lg border border-border p-4">
        <h3 className="text-lg font-semibold">Recommendations</h3>
        <ul className="space-y-2 text-sm" data-testid="p56-recommendations">
          {a.recommendations.map((r) => (
            <li key={r.id} className="space-y-0.5">
              <p className="break-words">
                <span className="font-mono text-xs text-muted-foreground">{r.id}</span>{" "}
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{RECOMMENDATION_CATEGORY_LABELS[r.category]}</span>{" "}
                {r.priority ? <Flag className="inline h-3.5 w-3.5 text-review-flag" aria-label="Answers a review flag" /> : null} {r.text}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className={r.authorization === "clinician_required" ? "font-semibold" : ""}>{r.authorizationLabel}</span> · Based on: {r.basis.join("; ")}
              </p>
            </li>
          ))}
          {!a.recommendations.length ? <li className="text-muted-foreground">No recommendations: no reviewed results in this period.</li> : null}
        </ul>
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <dt className="font-medium">Observed abnormal (validated)</dt>
          <dd className={a.assessment.abnormal.length ? "text-severity-red" : ""}>{a.assessment.abnormal.length ? a.assessment.abnormal.join("; ") : "None — no result met verified reference criteria."}</dd>
          <dt className="font-medium">Possible condition-related patterns</dt>
          <dd>{a.assessment.possiblePatterns.length ? a.assessment.possiblePatterns.join("; ") : "None could be assessed: each requires verified criteria or clinician-confirmed evidence."}</dd>
          <dt className="font-medium">Confirmed diagnoses</dt>
          <dd>{a.assessment.confirmedDiagnoses}</dd>
        </dl>
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
