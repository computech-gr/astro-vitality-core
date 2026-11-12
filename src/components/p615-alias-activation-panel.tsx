/**
 * P61.5 Ground Medical activation of Researcher alias decisions (Ground console).
 * A Researcher-decided alias maps a submitted synthetic label to ONE existing
 * active demo biomarker with the identical exact unit. Ground Medical activates
 * it (never the decider) or revokes it with a documented reason; the server
 * re-checks membership, digest, target state and label conflicts. After a change
 * the device installs the newly signed mission demo catalog. Synthetic demo only.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  activateDemoAliasFn,
  getDemoGovernanceFn,
  revokeDemoAliasFn,
} from "@/lib/p615-demo-scope.functions";
import type { AliasLifecycleRow } from "@/lib/p615-demo-scope.server";
import { getSignedSyntheticDemoSnapshot } from "@/lib/p37-synthetic-demo.functions";
import { installOfferedDemoCatalog } from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { browserSnapshotStorage } from "@/domain/health-intelligence/active-catalog-runtime";

export function P615AliasActivationPanel({ missionId }: { missionId: string }) {
  const governance = useServerFn(getDemoGovernanceFn);
  const activateFn = useServerFn(activateDemoAliasFn);
  const revokeFn = useServerFn(revokeDemoAliasFn);
  const sync = useServerFn(getSignedSyntheticDemoSnapshot);
  const [rows, setRows] = useState<AliasLifecycleRow[] | null>(null);
  const [canActivate, setCanActivate] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await governance({ data: { missionId } }).catch(() => null);
    if (!r?.ok) {
      setRows(null);
      setNote(r?.message ?? "Synthetic demo alias decisions are unavailable. Nothing was changed.");
      return;
    }
    setRows(r.aliases);
    setCanActivate(r.canActivate);
  }, [governance, missionId]);
  useEffect(() => {
    void load();
  }, [load]);

  const installCatalog = async () => {
    const r = await sync({ data: { missionId } }).catch(() => null);
    const storage = browserSnapshotStorage();
    if (!r?.ok || !storage) return "Demo catalog sync unavailable; devices refresh automatically when online.";
    return (await installOfferedDemoCatalog(r.signed, missionId, { storage })).reason;
  };
  const act = async (id: string, call: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(id);
    const res = await call().catch(() => ({ ok: false, message: "The request failed. Nothing was recorded." }));
    const synced = res.ok ? await installCatalog() : "";
    setNote(res.ok ? `Recorded. ${synced}` : (res.message ?? "Not recorded."));
    await load();
    setBusy(null);
  };

  if (!rows) return note ? <p className="mt-4 text-xs text-muted-foreground">{note}</p> : null;
  if (!rows.length) return null;
  return (
    <section
      aria-labelledby="p615-alias-title"
      className="mt-6 space-y-3 rounded-lg border border-border p-4"
      data-testid="p615-alias-activation"
    >
      <div className="space-y-1">
        <h3 id="p615-alias-title" className="font-semibold">
          Synthetic demo alias mappings · Ground Medical activation
        </h3>
        <p className="text-sm text-muted-foreground">
          SYNTHETIC DEMO — not a scientific approval. Each alias was decided by a Researcher and
          points a submitted label at one existing active demo biomarker with the identical exact
          unit. Nothing is converted or merged and stored observations are never rewritten.
        </p>
      </div>
      <ul className="space-y-2 text-sm">
        {rows.map((a) => {
          const state = a.revocationEventId
            ? "Revoked"
            : a.activationEventId
              ? "Active"
              : "Awaiting Ground Medical activation";
          const mayActivate =
            canActivate && !a.activationEventId && a.callerMayActivate && !a.decidedByCaller;
          const mayRevoke = canActivate && !!a.activationEventId && !a.revocationEventId && a.callerMayActivate;
          const why = !a.activationEventId && a.decidedByCaller
            ? "You decided this alias; another Ground Medical member must activate it."
            : !a.activationEventId && !a.callerMayActivate
              ? "Your Ground Medical membership does not cover this submission."
              : null;
          return (
            <li key={a.decisionEventId} className="rounded-md border border-border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.entry.labels.join(", ")}</span>
                <span>· {a.entry.unit}</span>
                <span>→ {a.entry.targetDisplayName}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.entry.targetDemoId}</span>
                <Badge variant={a.activationEventId && !a.revocationEventId ? "default" : "outline"}>
                  {state}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Researcher rationale: {a.entry.rationale}</p>
              {why ? <p className="text-xs text-muted-foreground">{why}</p> : null}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {mayActivate ? (
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={() =>
                      void act(a.decisionEventId, () =>
                        activateFn({
                          data: { decisionEventId: a.decisionEventId, expectedEntrySha256: a.entrySha256 },
                        }),
                      )
                    }
                  >
                    Activate alias
                  </Button>
                ) : null}
                {mayRevoke ? (
                  <>
                    <Input
                      aria-label={`Revocation reason for ${a.entry.labels[0] ?? a.termId}`}
                      placeholder="Revocation reason (8+ characters)"
                      value={reason[a.decisionEventId] ?? ""}
                      maxLength={2000}
                      onChange={(e) => setReason((m) => ({ ...m, [a.decisionEventId]: e.target.value }))}
                      className="h-8 max-w-xs text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!busy || (reason[a.decisionEventId] ?? "").trim().length < 8}
                      onClick={() =>
                        void act(a.decisionEventId, () =>
                          revokeFn({
                            data: {
                              activationEventId: a.activationEventId!,
                              reason: reason[a.decisionEventId] ?? "",
                            },
                          }),
                        )
                      }
                    >
                      Revoke alias
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {note ? (
        <p role="status" className="text-xs text-muted-foreground">
          {note}
        </p>
      ) : null}
    </section>
  );
}
