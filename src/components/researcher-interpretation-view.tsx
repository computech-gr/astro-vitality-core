import {
  approvalLayersFor,
  attestationLine,
  crossDomainFor,
  INTERPRETATION_APPROVAL_STATUS,
  interpretationSourceLine,
  type DomainInterpretation,
  type ResearcherDomain,
  type ResearcherInterpretationModel,
} from "@/domain/health-intelligence/researcher-interpretation";
import type { SeriesInterpretation } from "@/domain/health-intelligence/biomarker-interpretation";

const STATUS_LABEL: Record<SeriesInterpretation["status"], string> = {
  approved: "Approved interpretation",
  pending: "Pending scientific review",
  revoked: "Interpretation revoked",
};

/** Interpretation record shown beside each series: status, context, citations, uncertainty, alerts (same text as PDF/TXT). */
export function SeriesInterpretationBlock({ value }: { value: SeriesInterpretation }) {
  return (
    <div className="space-y-1 rounded-md border border-border bg-background p-2 text-xs" data-testid="series-interpretation" data-status={value.status}>
      <p className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded border px-1.5 py-0.5 font-semibold ${value.status === "approved" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
          {STATUS_LABEL[value.status]}
        </span>
        {value.syntheticDemo && <span className="rounded border border-border px-1.5 py-0.5 font-semibold text-muted-foreground">SYNTHETIC DEMO</span>}
      </p>
      <p className="break-words"><span className="font-medium">Interpretation status: </span>{value.statusLine}</p>
      {value.contextLines.map((l) => <p key={l} className="break-words">{l}</p>)}
      <div>
        <p className="font-medium">Citations</p>
        {value.citations.length ? (
          <ul className="list-none space-y-0.5">{value.citations.map((c) => <li key={c} className="break-words">{c}</li>)}</ul>
        ) : <p className="text-muted-foreground">None</p>}
      </div>
      <ul className="list-disc pl-4 text-muted-foreground">{value.uncertainty.map((u) => <li key={u}>Uncertainty: {u}</li>)}</ul>
      <p><span className="font-medium">Alerts: </span>{value.alert}</p>
    </div>
  );
}

/** Renders one domain of the shared v9.5 interpretation model (same text as PDF/TXT). */
export function DomainInterpretationCard({ domain, headingLevel = 3 }: { domain: DomainInterpretation; headingLevel?: 3 | 4 }) {
  const H = headingLevel === 3 ? "h3" : "h4";
  return (
    <article aria-label={`${domain.label} interpretation`} className="report-avoid-break space-y-2 rounded-md border border-border p-3">
      <H className="font-semibold">{domain.label}</H>
      <p className="text-sm">{domain.summary}</p>
      <p className="text-xs text-muted-foreground">
        Governance: {domain.governance.source ? `${domain.governance.source}. ` : ""}
        {domain.governance.status}
      </p>
      {domain.coverage.first && (
        <p className="text-xs text-muted-foreground">
          Coverage: {domain.coverage.first} to {domain.coverage.last}; {domain.coverage.distinctUtcDays} {domain.coverage.dateOnly ? "recorded calendar day(s); timezone not supplied for date-only records" : "UTC day(s)"}.
        </p>
      )}
      {domain.series.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {domain.series.map((s) => (
            <li key={`${s.metricId}|${s.unit}`} className="min-w-0 space-y-1 rounded-md bg-muted/40 p-3 text-sm">
              <p className="break-words font-medium">
                {s.label !== s.metricId ? `${s.label} (${s.metricId})` : s.metricId}{" "}
                <span className="font-normal text-muted-foreground">· {s.unit}</span>
              </p>
              <p className="break-words">{s.observation}</p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Sampling</dt>
                <dd>{s.readings} reading(s), {s.distinctTimePoints} time point(s), {s.distinctUtcDays} {s.dateOnly ? "calendar day(s); timezone not supplied" : "UTC day(s)"}</dd>
                <dt className="text-muted-foreground">Provenance</dt>
                <dd className="break-words">{s.provenance}</dd>
                <dt className="text-muted-foreground">Quality</dt>
                <dd className="break-words">{s.quality}</dd>
                <dt className="text-muted-foreground">Accepted via</dt>
                <dd>{s.evidenceTiers.storedModule} module · {s.evidenceTiers.intakeAccepted} intake · {s.evidenceTiers.device} device</dd>
                <dt className="text-muted-foreground">Ground Medical</dt>
                <dd>{attestationLine(s.attestation)}</dd>
                <dt className="text-muted-foreground">Evidence</dt>
                <dd className="break-all font-mono">{s.evidenceIds.join(", ")}</dd>
              </dl>
              <SeriesInterpretationBlock value={s.interpretation} />
              {s.handbook.kind === "quoted_pending_hypothesis" && s.handbook.about && (
                <details className="text-xs text-muted-foreground print:hidden">
                  <summary className="cursor-pointer">About this measure (handbook, pending review)</summary>
                  <p className="mt-1">{s.handbook.about}</p>
                </details>
              )}
              <ul className="list-disc pl-4 text-xs text-muted-foreground">
                {s.limitations.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function ApprovalLayers({ layers }: { layers: ResearcherInterpretationModel["approvalLayers"] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-3" aria-label="Separate approval layers">
      {layers.map((l) => (
        <li key={l.layer} className="rounded-md border border-border p-2 text-xs">
          <p className="font-semibold">{l.layer}: {l.count ?? "n/a"}</p>
          <p className="text-muted-foreground">{l.meaning}</p>
        </li>
      ))}
    </ul>
  );
}

export function CrossDomainList({ items }: { items: ResearcherInterpretationModel["crossDomain"] }) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <h4 className="font-semibold">Cross-domain comparability</h4>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((c) => (
          <li key={c.domains.join("+")} className="break-words">
            {c.statement} <span className="text-xs text-muted-foreground">Evidence: {c.evidenceIds.join(", ") || "none"}.</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full four-domain view for the Medical Report. */
export function ResearcherInterpretationView({ model }: { model: ResearcherInterpretationModel }) {
  return (
    <section aria-label="Researcher module physiological evidence interpretation" className="space-y-3 rounded-lg border p-4">
      <h3 className="text-lg font-semibold">Researcher module physiological evidence interpretation (research only)</h3>
      <p className="text-sm text-muted-foreground">
        Recorded changes are kept separate from possible biological context. Validated interpretations: {model.validatedInterpretations}{model.validatedInterpretations ? "" : ` (${INTERPRETATION_APPROVAL_STATUS})`}.
        {model.syntheticDemoInterpretations ? ` SYNTHETIC DEMO interpretations (not production validation): ${model.syntheticDemoInterpretations}.` : ""}
      </p>
      <InterpretationPolicy model={model} />
      <ApprovalLayers layers={model.approvalLayers} />
      <div className="space-y-3">
        {model.domains.map((d) => <DomainInterpretationCard key={d.domain} domain={d} headingLevel={4} />)}
      </div>
      <CrossDomainList items={model.crossDomain} />
      <ul className="list-disc pl-5 text-xs text-muted-foreground">
        {model.boundaries.map((b) => <li key={b}>{b}</li>)}
      </ul>
    </section>
  );
}

export function InterpretationPolicy({ model }: { model: ResearcherInterpretationModel }) {
  return (
    <div className="space-y-1 text-xs text-muted-foreground">
      <p className="break-all">{interpretationSourceLine(model)}</p>
      <ul className="list-disc pl-5">{model.changePolicy.map((p) => <li key={p}>{p}</li>)}</ul>
    </div>
  );
}

/** Single-domain view used inside each Researcher module page. */
export function ModuleInterpretationView({ model, domain }: { model: ResearcherInterpretationModel; domain: ResearcherDomain }) {
  const d = model.domains.find((x) => x.domain === domain);
  if (!d) return null;
  return (
    <div className="space-y-3">
      <ApprovalLayers layers={approvalLayersFor(d.series)} />
      <InterpretationPolicy model={model} />
      <DomainInterpretationCard domain={d} />
      <CrossDomainList items={crossDomainFor(model, domain)} />
      <ul className="list-disc pl-5 text-xs text-muted-foreground">
        {model.boundaries.map((b) => <li key={b}>{b}</li>)}
      </ul>
    </div>
  );
}
