/**
 * P61.3 mapping decision register — read-only display. Shows each incoming name + unit, its decision
 * category, proposed catalog identity, verification notes and the Researcher approval still required.
 * Nothing here approves, saves or changes classification.
 */
import { Badge } from "@/components/ui/badge";
import {
  MAPPING_CATEGORY_LABELS,
  MAPPING_DECISIONS,
  type MappingDecision,
} from "@/domain/health-intelligence/p613-mapping-decision-register";

export const MAPPING_REGISTER_ANCHOR = "p613-mapping-decision-register";
export const MAPPING_REGISTER_HEADING = "Biomarker mapping decision register (P61.3)";

function DecisionRow({ d }: { d: MappingDecision }) {
  const target = d.proposal.catalogId
    ? `${d.proposal.catalogName} (${d.proposal.catalogId}) · ${d.proposal.catalogUnit}`
    : `No catalog entry — proposed new definition: ${d.proposal.catalogName} · ${d.proposal.catalogUnit}`;
  return (
    <li className="space-y-1 rounded-md border border-border p-3 text-sm" data-testid="p613-mapping-decision">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {d.label} <span className="text-muted-foreground">· {d.reportedUnit}</span>
        </span>
        <Badge variant={d.applied ? "secondary" : "outline"}>
          {d.applied ? "Applied — synthetic data only" : "Held — not saved"}
        </Badge>
        <Badge variant="outline">{d.approval.status === "PENDING_RESEARCHER_CONFIRMATION" ? "Pending Researcher confirmation" : "Pending Researcher review"}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{d.categories.map((c) => MAPPING_CATEGORY_LABELS[c]).join(" · ")}</p>
      <details className="text-xs">
        <summary className="cursor-pointer text-primary">Proposal, verification and approval path</summary>
        <dl className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
          <dt className="font-medium">Proposed identity</dt>
          <dd className="break-words">{target}{d.proposal.domain ? ` · domain ${d.proposal.domain}` : ""}</dd>
          <dt className="font-medium">Specimen</dt>
          <dd className="break-words">{d.verification.specimen}</dd>
          <dt className="font-medium">Method</dt>
          <dd className="break-words">{d.verification.method}</dd>
          <dt className="font-medium">Unit</dt>
          <dd className="break-words">{d.verification.unit}</dd>
          <dt className="font-medium">Domain</dt>
          <dd className="break-words">{d.verification.domain}</dd>
          <dt className="font-medium">Evidence</dt>
          <dd className="break-words">{d.evidence.join(" ")}</dd>
          <dt className="font-medium">Uncertainty</dt>
          <dd className="break-words">{d.uncertainty.join(" ") || "None recorded."}</dd>
          <dt className="font-medium">Approval needed</dt>
          <dd className="break-words">{d.approval.path}</dd>
        </dl>
      </details>
    </li>
  );
}

export function P613MappingDecisionRegister(props: {
  /** Show only these "label|unit" keys (exact reported unit); all entries when omitted. */
  only?: ReadonlySet<string>;
  compact?: boolean;
}) {
  const all = MAPPING_DECISIONS ?? [];
  const shown = props.only ? all.filter((d) => props.only!.has(`${d.label.trim().toLowerCase()}|${d.reportedUnit}`)) : all;
  if (props.only && !shown.length) return null;
  const held = shown.filter((d) => !d.applied).length;
  return (
    <section
      id={props.compact ? undefined : MAPPING_REGISTER_ANCHOR}
      aria-label={MAPPING_REGISTER_HEADING}
      className={props.compact ? "space-y-2" : "mx-auto max-w-6xl space-y-3 px-4 py-8 sm:px-5"}
      data-testid="p613-mapping-register"
    >
      {props.compact ? (
        <h3 className="text-sm font-semibold">Mapping decisions for these measurements</h3>
      ) : (
        <h2 className="text-2xl font-semibold">{MAPPING_REGISTER_HEADING}</h2>
      )}
      <p className="text-xs text-muted-foreground">
        {MAPPING_DECISIONS
          ? `${shown.length} name(s): ${shown.length - held} applied to synthetic data only, ${held} held until a Researcher decides. This register is read-only; no mapping here is a scientific approval, and units are never converted.`
          : "The mapping decision register failed validation and is not shown."}
      </p>
      <ul className="space-y-2">
        {shown.map((d) => (
          <DecisionRow key={d.id} d={d} />
        ))}
      </ul>
    </section>
  );
}
