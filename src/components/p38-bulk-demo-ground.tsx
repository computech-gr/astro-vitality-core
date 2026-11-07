/**
 * P38 Ground Medical bulk SYNTHETIC DEMO activation on the Ground console. Lists
 * every synthetic demo proposal of the mission, previews what would be skipped
 * (already active, revoked, own decision, crew scope, label/unit conflicts),
 * and activates the selection through bounded transactional server batches.
 * After activation the device installs the newly signed mission demo catalog,
 * so later synthetic examinations recognize the entries automatically.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, RotateCcw, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getSignedSyntheticDemoSnapshot,
  getSyntheticDemoLifecycle,
} from "@/lib/p37-synthetic-demo.functions";
import type { DemoLifecycleRow, DemoScopeTerm } from "@/lib/p37-synthetic-demo.server";
import { bulkDemoActivateFn } from "@/lib/p38-bulk-demo.functions";
import {
  activationPreview,
  runBulkBatches,
  summarizeBulk,
  type ActivationCategory,
  type ActivationRow,
  type BulkItemResult,
  type BulkProgress,
} from "@/domain/health-intelligence/p38-bulk-demo-batches";
import { installOfferedDemoCatalog } from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { browserSnapshotStorage } from "@/domain/health-intelligence/active-catalog-runtime";
import { SYNTHETIC_DEMO_LABEL } from "@/domain/health-intelligence/synthetic-demo-catalog";

const PAGE = 25;
const LABEL: Record<ActivationCategory, string> = {
  eligible: "Pending · eligible",
  already_active: "Already active",
  revoked: "Revoked",
  decided_by_caller: "Your own decision",
  not_authorized: "Outside your crew scope",
  conflict: "Label/unit conflict",
};

export function P38BulkDemoGround({ missionId }: { missionId: string }) {
  const lifecycle = useServerFn(getSyntheticDemoLifecycle);
  const activateFn = useServerFn(bulkDemoActivateFn);
  const sync = useServerFn(getSignedSyntheticDemoSnapshot);
  const [data, setData] = useState<{
    canActivate: boolean;
    terms: Map<string, DemoScopeTerm>;
    events: DemoLifecycleRow[];
  } | null>(null);
  const [note, setNote] = useState("Reading synthetic demo proposals…");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ActivationCategory | "all">("all");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<{
    progress: BulkProgress;
    results: BulkItemResult[];
    failure: string | null;
    remaining: ActivationRow[];
  } | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await lifecycle({ data: { missionId } }).catch(() => null);
    if (!r || !r.ok) {
      setData(null);
      setNote(r?.message ?? "Synthetic demo proposals are unavailable. Nothing was changed.");
      return;
    }
    setData({
      canActivate: r.canActivate,
      terms: new Map(r.terms.map((t) => [`${t.submissionId}:${t.termId}`, t])),
      events: r.events,
    });
  }, [lifecycle, missionId]);
  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      data
        ? activationPreview(
            data.events,
            (p) => data.terms.get(`${p.submissionId}:${p.termId}`)?.callerMayActivate === true,
          )
        : [],
    [data],
  );
  const count = (c: ActivationCategory) => rows.filter((r) => r.category === c).length;
  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.category !== filter) return false;
    const q = query.trim().toLowerCase();
    const e = r.proposal.entry;
    return (
      !q ||
      r.proposal.termId.includes(q) ||
      e.displayName.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q)) ||
      e.domain.includes(q)
    );
  });
  useEffect(() => setPage(0), [query, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const eligible = rows.filter((r) => r.category === "eligible");
  const chosen = eligible.filter((r) => selected.has(r.proposal.decisionEventId));
  const excludedSelected = rows.filter(
    (r) => selected.has(r.proposal.decisionEventId) && r.category !== "eligible",
  );

  const installDevice = async () => {
    const r = await sync({ data: { missionId } }).catch(() => null);
    const storage = browserSnapshotStorage();
    if (!r || !r.ok || !storage) {
      setSyncNote(
        (r && !r.ok && r.message) ||
          "Demo catalog sync unavailable; devices refresh automatically when online.",
      );
      return;
    }
    const res = await installOfferedDemoCatalog(r.signed, missionId, { storage });
    setSyncNote(res.reason);
  };

  const start = async (items: ActivationRow[]) => {
    setBusy(true);
    const send = (batch: ActivationRow[]) =>
      activateFn({
        data: {
          missionId,
          items: batch.map((r) => ({
            decisionEventId: r.proposal.decisionEventId,
            expectedEntrySha256: r.proposal.entrySha256,
          })),
        },
      });
    const res = await runBulkBatches(items, send, (progress) =>
      setRun({ progress, results: [], failure: null, remaining: [] }),
    );
    setRun({ progress: res.progress, results: res.results, failure: res.failure, remaining: res.remaining });
    setSelected(new Set());
    await load();
    if (res.results.some((r) => r.status === "recorded" || r.status === "duplicate")) await installDevice();
    setBusy(false);
  };
  const summary = run ? summarizeBulk(run.results) : null;

  return (
    <section
      aria-labelledby="p38-g-title"
      className="mt-6 space-y-3 rounded-lg border-2 border-dashed border-border p-4"
      data-testid="p38-bulk-ground"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id="p38-g-title" className="font-semibold">
            Bulk synthetic demo catalog activation
          </h3>
          <Badge variant="outline">SYNTHETIC DEMO</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {SYNTHETIC_DEMO_LABEL}. Researcher decisions never activate anything by themselves; only
          an independent Ground Medical member of this mission activates them here.
        </p>
      </div>
      {!data ? (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs" data-testid="p38-activation-counts">
            <Badge>Pending · eligible {count("eligible")}</Badge>
            <Badge variant="secondary">Already active {count("already_active")}</Badge>
            <Badge variant="outline">Your own decision {count("decided_by_caller")}</Badge>
            <Badge variant="outline">Outside your crew scope {count("not_authorized")}</Badge>
            <Badge variant="outline">Label/unit conflict {count("conflict")}</Badge>
            <Badge variant="outline">Revoked {count("revoked")}</Badge>
          </div>
          {!data.canActivate ? (
            <p className="text-xs text-muted-foreground">
              Activation is performed by an active Ground Medical member of this mission.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="p38-g-search" className="text-xs">
                Search name, label, domain or term ID
              </Label>
              <Input id="p38-g-search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p38-g-filter" className="text-xs">
                Status
              </Label>
              <select
                id="p38-g-filter"
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All</option>
                {(Object.keys(LABEL) as ActivationCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {LABEL[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelected(new Set(eligible.map((r) => r.proposal.decisionEventId)))}
            >
              <ListChecks className="mr-1 h-4 w-4" aria-hidden />
              Select All Eligible ({eligible.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSelected(
                  (s) =>
                    new Set([
                      ...s,
                      ...pageRows.filter((r) => r.category === "eligible").map((r) => r.proposal.decisionEventId),
                    ]),
                )
              }
            >
              Select Page
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Deselect All
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Synthetic demo proposals">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-1">Select</th>
                  <th className="p-1">Demo entry</th>
                  <th className="p-1">Matches (label · exact unit)</th>
                  <th className="p-1">Domain</th>
                  <th className="p-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.proposal.decisionEventId} className="border-t border-border align-top">
                    <td className="p-1">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.proposal.entry.displayName}`}
                        disabled={r.category !== "eligible"}
                        checked={selected.has(r.proposal.decisionEventId)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(r.proposal.decisionEventId);
                            else n.delete(r.proposal.decisionEventId);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="p-1">
                      <span className="font-medium">{r.proposal.entry.displayName}</span>
                      <div className="font-mono text-muted-foreground">{r.proposal.demoId}</div>
                    </td>
                    <td className="p-1">
                      {[...new Set([r.proposal.entry.displayName, ...r.proposal.entry.aliases])].join(", ")} ·{" "}
                      {r.proposal.entry.unit}
                    </td>
                    <td className="p-1">{r.proposal.entry.domain}</td>
                    <td className="p-1">
                      <Badge variant={r.category === "eligible" ? "default" : "outline"}>{LABEL[r.category]}</Badge>
                      <div className="text-muted-foreground">{r.reason}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page + 1} of {pages} · {filtered.length} shown of {rows.length}
            </span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3" data-testid="p38-activation-preview">
            <p className="text-sm font-medium">Bulk activation preview</p>
            <p className="text-xs">
              {chosen.length} selected for activation in the mission SYNTHETIC DEMO catalog ·{" "}
              {excludedSelected.length} selected entries excluded.
            </p>
            <Button size="sm" disabled={busy || !data.canActivate || !chosen.length} onClick={() => void start(chosen)}>
              <Zap className="mr-1 h-4 w-4" aria-hidden />
              Activate Selected in SYNTHETIC DEMO Catalog ({chosen.length})
            </Button>
          </div>
          {run ? (
            <div role="status" className="space-y-1 rounded-md border border-border p-3 text-xs" data-testid="p38-activation-run">
              <p className="font-medium">
                Batch {run.progress.batchesDone} of {run.progress.batchesTotal} · {run.progress.itemsDone} of{" "}
                {run.progress.itemsTotal} proposals processed
              </p>
              {summary ? (
                <p>
                  Activated {summary.recorded} · already activated (retry) {summary.duplicate} · skipped{" "}
                  {summary.skipped} · rejected {summary.rejected}
                </p>
              ) : null}
              {run.results
                .filter((r) => r.status === "rejected")
                .slice(0, 20)
                .map((r) => (
                  <p key={r.ref} className="text-destructive">
                    {r.termId}: {r.detail ?? r.status}
                  </p>
                ))}
              {run.failure ? (
                <p role="alert" className="text-destructive">
                  {run.failure}
                </p>
              ) : null}
              {run.remaining.length ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void start(run.remaining)}>
                  <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
                  Retry remaining batches
                </Button>
              ) : null}
              {syncNote ? <p>Device demo catalog: {syncNote}</p> : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
