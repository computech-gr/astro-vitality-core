/**
 * Compact, searchable view of the mission's verified synthetic demo catalog on
 * Medical Intake. Presentation only: filtering is local and in-memory (works
 * offline) and never changes recognition, units or catalog status.
 */
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompactScrollRegion } from "@/components/compact-review";
import { DOMAIN_LABELS } from "@/domain/health-domains/document-domain-projection";
import type { EvaluatedDemoCatalog } from "@/domain/health-intelligence/synthetic-demo-catalog";

export interface DemoParameterRow {
  key: string;
  demoId: string;
  displayName: string;
  aliases: readonly string[];
  unit: string;
  category: string;
  status: "ACTIVE" | "REVOKED";
}

export function demoParameterRows(
  catalog: Pick<EvaluatedDemoCatalog, "active" | "revoked">,
): DemoParameterRow[] {
  return [
    ...catalog.active.map((e) => ({
      key: `a-${e.demoId}`,
      demoId: e.demoId,
      displayName: e.displayName,
      aliases: e.aliases,
      unit: e.unit,
      category: DOMAIN_LABELS[e.domain],
      status: "ACTIVE" as const,
    })),
    ...catalog.revoked.map((e) => ({
      key: `r-${e.demoId}-${e.activation.activationEventId}`,
      demoId: e.demoId,
      displayName: e.displayName,
      aliases: e.aliases,
      unit: e.unit,
      category: DOMAIN_LABELS[e.domain],
      status: "REVOKED" as const,
    })),
  ];
}

/** Case-insensitive match on name, observed labels, identifier, category or unit. */
export function filterDemoParameters(
  rows: readonly DemoParameterRow[],
  query: string,
): DemoParameterRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) =>
    [r.displayName, r.demoId, r.category, r.unit, ...r.aliases].some((v) =>
      v.toLowerCase().includes(q),
    ),
  );
}

export function MissionDemoParametersPanel({
  catalog,
}: {
  catalog: Pick<EvaluatedDemoCatalog, "active" | "revoked" | "demoCatalogVersion">;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const rows = useMemo(() => demoParameterRows(catalog), [catalog]);
  const shown = filterDemoParameters(rows, query);
  return (
    <div
      className="space-y-2 rounded-md border border-dashed border-border p-3"
      data-testid="mission-demo-parameters"
    >
      <p className="text-sm font-medium">
        Mission synthetic demo parameters (verified demo catalog v{catalog.demoCatalogVersion},
        available offline)
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1 sm:max-w-sm">
          <Label htmlFor={searchId} className="text-xs">
            Search demo parameters
          </Label>
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, identifier, category or unit"
            className="h-9"
          />
        </div>
        <p className="text-xs text-muted-foreground" data-testid="mission-demo-parameters-count">
          {rows.length} parameter{rows.length === 1 ? "" : "s"} ({catalog.active.length} active,{" "}
          {catalog.revoked.length} revoked)
        </p>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        Showing {shown.length} of {rows.length} demo parameters
      </p>
      <CompactScrollRegion
        label="Mission synthetic demo parameters list; scroll to see all"
        maxHeight="demoParameters"
        className="p-2"
        testId="mission-demo-parameters-scroll"
      >
        {shown.length ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {shown.map((e) =>
              e.status === "ACTIVE" ? (
                <li key={e.key}>
                  <span className="font-medium text-foreground">{e.displayName}</span> ({e.demoId})
                  · label {e.aliases.map((a) => `“${a}”`).join(", ")} · exact unit {e.unit} →{" "}
                  {e.category} · ACTIVE — recognized automatically in synthetic examinations of
                  this mission
                </li>
              ) : (
                <li key={e.key}>
                  {e.displayName} ({e.demoId}) · {e.unit} · REVOKED — no longer recognized; earlier
                  records are kept
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No demo parameter matches this search.</p>
        )}
      </CompactScrollRegion>
      <p className="text-xs text-muted-foreground">
        SYNTHETIC DEMO — not a scientific approval, source validation or production catalog entry.
        Applies to synthetic data of this mission only; units are never converted.
      </p>
    </div>
  );
}
