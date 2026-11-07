/**
 * Ground Medical catalog activation (P37, role-based). Lists biomarkers the
 * Researcher already approved scientifically for the selected mission and lets
 * an active Ground Medical member of that mission activate or revoke them. This
 * is a technical catalog step, not another scientific review; every action is
 * authorized by caller-scoped database functions, never by this UI.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryActions } from "@/components/p37-catalog-panel";
import { getCatalogActivationQueue } from "@/lib/p37-catalog.functions";
import type { LifecycleRow } from "@/lib/p37-catalog.server";

export function P37GroundMedicalActivationPanel({
  missionId,
  missionLabel,
}: {
  missionId: string;
  missionLabel: string;
}) {
  const queue = useServerFn(getCatalogActivationQueue);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<LifecycleRow[]>([]);

  const load = useCallback(async () => {
    setState("loading");
    const r = await queue({ data: { missionId } }).catch(() => null);
    if (!r || !r.ok) {
      setRows([]);
      setNote(r?.message ?? "Catalog activation is unavailable. Nothing was changed.");
      setState("error");
      return;
    }
    setRows(r.events);
    setState("ready");
  }, [queue, missionId]);
  useEffect(() => {
    void load();
  }, [load]);

  const waiting = rows.filter((r) => !r.activationEventId).length;
  return (
    <Card className="mt-6" aria-labelledby="p37-gm-title">
      <CardHeader>
        <CardTitle id="p37-gm-title">New biomarker catalog activation</CardTitle>
        <p className="text-sm text-muted-foreground">
          Biomarkers the Researcher has already scientifically approved for {missionLabel}. As Ground
          Medical for this mission you can activate them in the catalog; future compatible
          examinations are then recognized automatically, online and offline, after each device's
          next verified catalog sync. No further Researcher decision is needed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Reading approved proposals…
          </p>
        ) : null}
        {state === "error" ? (
          <p role="status" className="text-sm text-muted-foreground">
            {note}
          </p>
        ) : null}
        {state === "ready" ? (
          rows.length ? (
            <>
              <p className="text-xs text-muted-foreground">
                {waiting} awaiting activation · {rows.length - waiting} activated or revoked
              </p>
              <ul className="space-y-3">
                {rows.map((e) => (
                  <li
                    key={e.approvalEventId}
                    className="space-y-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.entry.canonicalName}</span>
                      <span className="font-mono text-xs">{e.canonicalId}</span>
                      <Badge
                        variant={
                          e.revocationEventId
                            ? "outline"
                            : e.activationEventId
                              ? "default"
                              : "secondary"
                        }
                      >
                        {e.revocationEventId
                          ? "REVOKED"
                          : e.activationEventId
                            ? "CATALOG_ACTIVE"
                            : "SCIENTIFICALLY APPROVED · ready to activate"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Labels {e.entry.aliases.join(", ")} · unit {e.entry.unit} · specimen{" "}
                      {e.entry.specimen} · method {e.entry.method} · domain {e.entry.domain}
                    </p>
                    <p className="break-all font-mono text-xs text-muted-foreground">
                      Approved proposal SHA-256 {e.entrySha256}
                    </p>
                    {e.revocationReason ? (
                      <p className="text-xs">Revoked: {e.revocationReason}</p>
                    ) : null}
                    <EntryActions row={e} canActivate={e.callerMayActivate === true} onDone={load} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No scientifically approved biomarkers are waiting for this mission.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
