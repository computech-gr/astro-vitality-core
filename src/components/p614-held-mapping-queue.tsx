/**
 * P61.4 — governance view of held mapping proposals inside the P61 import exception queue. Display only:
 * it reads the existing caller-scoped synthetic demo lifecycle (when this account may) and this device's
 * verified signed demo catalog, and links to Scientific Review. Held rows stay locked; nothing is saved.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { getSyntheticDemoLifecycle } from "@/lib/p37-synthetic-demo.functions";
import { getSyntheticDemoCatalogs, subscribeSyntheticDemoCatalogs } from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import {
  NEXT_ROLE_LABELS,
  heldMappingViews,
  mappingRecovery,
  type GovernanceInputs,
} from "@/domain/health-intelligence/p614-mapping-governance";
import { MappingApprovalDistinction, MAPPING_GOVERNANCE_ANCHOR } from "@/components/p614-mapping-governance-panel";

type Row = { key: string; label: string; unit: string; observedAt: string };

export function P614HeldMappingQueue(props: {
  rows: readonly Row[];
  statuses: ReadonlyMap<string, { kind: string }>;
  missionId?: string | undefined;
  provenance?: "" | "synthetic" | "real" | undefined;
}) {
  const lifecycle = useServerFn(getSyntheticDemoLifecycle);
  const catalogs = useSyncExternalStore(subscribeSyntheticDemoCatalogs, getSyntheticDemoCatalogs, getSyntheticDemoCatalogs);
  const [live, setLive] = useState<Pick<GovernanceInputs, "scopeTerms" | "demoEvents"> | null>(null);
  const synthetic = props.provenance === "synthetic" && !!props.missionId;
  useEffect(() => {
    setLive(null);
    if (!synthetic || !props.missionId) return;
    let cancelled = false;
    void lifecycle({ data: { missionId: props.missionId } })
      .then((l) => {
        if (!cancelled && l.ok) setLive({ scopeTerms: l.terms, demoEvents: l.events });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [synthetic, props.missionId, lifecycle]);

  const views = useMemo(
    () =>
      heldMappingViews(props.rows, props.statuses, {
        missionId: props.missionId ?? "",
        submittedTerms: null,
        scopeTerms: live?.scopeTerms ?? null,
        triage: [],
        demoEvents: live?.demoEvents ?? [],
        catalogs,
      }),
    [props.rows, props.statuses, props.missionId, live, catalogs],
  );
  const recovery = useMemo(() => mappingRecovery(props.rows, props.statuses), [props.rows, props.statuses]);
  if (!views.length && !recovery.newlyEligible) return null;

  return (
    <div className="space-y-2 rounded-md border border-border p-3" data-testid="p614-held-mapping-queue">
      <h3 className="text-sm font-semibold">Held measurement names — scientific mapping status</h3>
      {recovery.newlyEligible ? (
        <p role="status" className="text-sm" data-testid="p614-recovery">
          {recovery.newlyEligible} previously held observation(s) are now eligible through an approved and activated mapping
          ({recovery.newlyEligibleByDate.map((d) => `${d.date}: ${d.rows}`).join(", ")}); {recovery.duplicates} already stored
          observation(s) are duplicates and excluded. Nothing is saved automatically — confirm them below.
        </p>
      ) : null}
      {props.provenance === "real" ? (
        <p className="text-xs text-muted-foreground">Synthetic demonstration mappings never apply to real data; these rows need the production catalog lifecycle.</p>
      ) : null}
      <ul className="space-y-2">
        {views.map((v) => (
          <li key={v.safeguard.registerId} className="space-y-1 rounded-md border border-border/70 p-2 text-xs" data-testid="p614-held-mapping">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{v.safeguard.label} · {v.safeguard.reportedUnit}</span>
              <span className="text-muted-foreground">{v.rows} row(s) · {v.dates.join(", ")}</span>
              <Badge variant="outline" className="border-destructive text-destructive">Held — locked</Badge>
            </div>
            <p><span className="font-medium">Why held:</span> {v.whyHeld}. {v.safeguard.rule}</p>
            <p><span className="font-medium">Missing evidence:</span> {v.missingEvidence.join("; ")}.</p>
            <p><span className="font-medium">Governance status:</span> {v.status.label}.</p>
            <p><span className="font-medium">Who acts next:</span> {NEXT_ROLE_LABELS[v.status.nextRole]} — {v.status.nextStep}</p>
            <p><span className="font-medium">Approved and activated mapping available:</span> {v.status.eligible ? `Yes (${v.status.activeDemoId}) — re-import the original file` : "No"}</p>
          </li>
        ))}
      </ul>
      <MappingApprovalDistinction />
      <Link to="/mission/scientific-review" hash={MAPPING_GOVERNANCE_ANCHOR} className="inline-block text-sm font-medium text-primary underline underline-offset-4" data-testid="p614-open-review">
        Open these proposals in Scientific Review
      </Link>
    </div>
  );
}
