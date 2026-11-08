/**
 * P38 Ground Medical bulk SYNTHETIC DEMO activation on the Ground console, with
 * the P55 universal selection: domain, status, unit and search filters, Select
 * All Filtered across every page, Select Current Page, Deselect All, any-status
 * selection for inspection, a preflight that needs one confirmation, and
 * per-record outcomes with Retry Failed Selection. Only proposals that pass the
 * existing activation rules (never already active, revoked, the caller's own
 * decision, outside the caller's crew scope, label/unit conflicts or an
 * existing catalog identity) are sent, through the existing bounded
 * transactional server batches. After activation the device installs the newly
 * signed mission demo catalog. Clarification requests are prepared as a text
 * note only: Ground Medical has no governed write path for them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, RefreshCw } from "lucide-react";
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
  type BulkProgress,
} from "@/domain/health-intelligence/p38-bulk-demo-batches";
import { catalogExistingMatch } from "@/domain/health-intelligence/p38-bulk-demo-preflight";
import { installOfferedDemoCatalog } from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { browserSnapshotStorage } from "@/domain/health-intelligence/active-catalog-runtime";
import { SYNTHETIC_DEMO_LABEL } from "@/domain/health-intelligence/synthetic-demo-catalog";
import {
  buildBulkPreflight,
  deselectAll,
  executeBulk,
  pruneSelection,
  selectAllFiltered,
  selectIds,
  selectionScope,
  toggleId,
  type BulkPreflight,
  type RecordOutcome,
} from "@/domain/health-intelligence/p55-bulk-selection-engine";
import {
  GROUND_ACTION_LABEL,
  GROUND_STATUS_LABEL,
  activateFit,
  clarifyFit,
  groundRecord,
  type GroundBulkAction,
  type GroundRecord,
  type GroundStatus,
} from "@/domain/health-intelligence/p55-bulk-actions";
import {
  BulkActionTable,
  BulkOutcomePanel,
  BulkPreflightDialog,
  BulkSelectionToolbar,
} from "@/components/p55-bulk-controls";

const PAGE = 25;
const STATUSES = Object.keys(GROUND_STATUS_LABEL) as GroundStatus[];
const DOMAIN_LABEL: Record<string, string> = {
  bone: "Bone",
  cardiovascular: "Cardiovascular",
  immune: "Immune",
  behavioral: "Behavioral",
};
const ACTIONS: GroundBulkAction[] = ["activate", "clarify"];
const ACTION_DESCRIPTION: Record<GroundBulkAction, string> = {
  activate: "Only eligible entries are sent; activation is idempotent and safe to retry.",
  clarify: "Prepares a clarification note for the Researcher (text only; nothing is recorded).",
};
const idOf = (g: GroundRecord) => g.row.proposal.decisionEventId;

export function clarificationNote(missionLabel: string, records: readonly GroundRecord[], when: string) {
  return [
    `MITOCHONDRIA — Ground Medical clarification request (SYNTHETIC DEMO)`,
    `Mission: ${missionLabel}`,
    `Prepared: ${when}`,
    `Not recorded in any system; it activates or approves nothing.`,
    "",
    ...records.map((g) => {
      const e = g.row.proposal.entry;
      return `- ${e.displayName} · ${e.unit} · ${e.domain} (${g.row.proposal.termId}, decision ${g.row.proposal.decisionEventId}): ${GROUND_STATUS_LABEL[g.status]} — ${g.reason}`;
    }),
  ].join("\n");
}

export function P38BulkDemoGround({ missionId, missionLabel }: { missionId: string; missionLabel?: string }) {
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
  const [status, setStatus] = useState<GroundStatus | "all">("all");
  const [domain, setDomain] = useState("all");
  const [unit, setUnit] = useState("all");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ action: GroundBulkAction; preflight: BulkPreflight<GroundRecord> } | null>(null);
  const [run, setRun] = useState<{
    action: GroundBulkAction;
    progress: BulkProgress | null;
    outcomes: RecordOutcome[];
    failure: string | null;
  } | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const label = missionLabel ?? missionId;

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

  const existingMatch = useMemo(() => catalogExistingMatch(missionId), [missionId]);
  const records = useMemo(
    () =>
      data
        ? activationPreview(
            data.events,
            (p) => data.terms.get(`${p.submissionId}:${p.termId}`)?.callerMayActivate === true,
          ).map((row) => groundRecord(row, existingMatch))
        : [],
    [data, existingMatch],
  );
  const eventById = useMemo(
    () => new Map((data?.events ?? []).map((e) => [e.decisionEventId, e])),
    [data],
  );
  useEffect(() => {
    if (data) setSelected((s) => pruneSelection(s, records.map(idOf)));
  }, [data, records]);

  const domains = useMemo(
    () => [...new Set(records.map((g) => g.row.proposal.entry.domain))].sort(),
    [records],
  );
  const units = useMemo(
    () => [...new Set(records.map((g) => g.row.proposal.entry.unit))].sort(),
    [records],
  );
  const byDomain = (g: GroundRecord) => domain === "all" || g.row.proposal.entry.domain === domain;
  const statusCount = (s: GroundStatus) => records.filter((g) => g.status === s && byDomain(g)).length;
  const filtered = records.filter((g) => {
    if (status !== "all" && g.status !== status) return false;
    if (!byDomain(g)) return false;
    const e = g.row.proposal.entry;
    if (unit !== "all" && e.unit !== unit) return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      g.row.proposal.termId.includes(q) ||
      g.row.proposal.demoId.toLowerCase().includes(q) ||
      e.displayName.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q)) ||
      e.unit.toLowerCase().includes(q)
    );
  });
  useEffect(() => setPage(0), [query, status, domain, unit]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const filteredIds = filtered.map(idOf);
  const scope = selectionScope(selected, filteredIds);
  const recordById = useMemo(() => new Map(records.map((g) => [idOf(g), g])), [records]);
  const labelOf = (id: string) => {
    const g = recordById.get(id);
    return g ? `${g.row.proposal.entry.displayName} · ${g.row.proposal.entry.unit} (${g.row.proposal.termId})` : id;
  };

  const fitFor = (a: GroundBulkAction) => (g: GroundRecord) =>
    a === "activate" ? activateFit(g, !!data?.canActivate) : clarifyFit(g);
  const preflightFor = (a: GroundBulkAction, sel: ReadonlySet<string> = selected) =>
    buildBulkPreflight({
      records,
      idOf,
      selected: sel,
      filteredIds,
      fit: fitFor(a),
      missionLabel: label,
      roleLabel: "Ground Medical",
      actionLabel: GROUND_ACTION_LABEL[a],
    });
  const actionOptions = ACTIONS.map((id) => {
    const p = preflightFor(id);
    return {
      id,
      label: GROUND_ACTION_LABEL[id],
      description: ACTION_DESCRIPTION[id],
      actionable: p.actionable.length,
      already: p.already.length,
      blocked: p.blocked.length,
      unavailable:
        id === "activate" && data && !data.canActivate
          ? "Activation is performed by an active Ground Medical member of this mission."
          : null,
    };
  });

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

  const confirmPending = async () => {
    if (!pending) return;
    const { action, preflight } = pending;
    setPending(null);
    if (action === "clarify") {
      setClarification(clarificationNote(label, preflight.actionable, new Date().toISOString()));
      setRun({
        action,
        progress: null,
        failure: null,
        outcomes: [
          ...preflight.actionable.map((g) => ({
            id: idOf(g),
            label: labelOf(idOf(g)),
            outcome: "success" as const,
            detail: "Included in the clarification note (not recorded anywhere).",
            retryAvailable: false,
          })),
          ...preflight.blocked.map((x) => ({
            id: idOf(x.record),
            label: labelOf(idOf(x.record)),
            outcome: "blocked" as const,
            detail: x.reason,
            retryAvailable: false,
          })),
        ],
      });
      return;
    }
    setBusy(true);
    setSyncNote(null);
    setRun({ action, progress: null, outcomes: [], failure: null });
    const res = await executeBulk({
      preflight,
      idOf,
      labelOf,
      send: (batch) =>
        activateFn({
          data: {
            missionId,
            items: batch.map((g) => ({
              decisionEventId: g.row.proposal.decisionEventId,
              expectedEntrySha256: g.row.proposal.entrySha256,
            })),
          },
        }),
      onProgress: (progress) => setRun({ action, progress, outcomes: [], failure: null }),
    });
    setRun({ action, ...res });
    await load();
    if (res.outcomes.some((o) => o.outcome === "success" || o.outcome === "already_completed"))
      await installDevice();
    setBusy(false);
  };

  const downloadNote = () => {
    if (!clarification) return;
    const url = URL.createObjectURL(new Blob([clarification], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mitochondria-clarification-${missionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          an independent Ground Medical member of this mission activates them here. Acceptance for
          scientific review never creates an activation-ready entry.
        </p>
      </div>
      {!data ? (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="p38-activation-counts">
            {STATUSES.map((s) => (
              <Badge key={s} variant={s === "awaiting_activation" ? "default" : s === "already_active" ? "secondary" : "outline"}>
                {GROUND_STATUS_LABEL[s]} {statusCount(s)}
              </Badge>
            ))}
            <Badge variant="outline">All {records.filter(byDomain).length}</Badge>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load()}>
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden />
              Refresh queue
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus("already_active")}>
              View Already Active Entries
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Counts follow the domain filter. Blocked: revoked, your own decision, or outside your
            crew scope. Requires clarification: the same label and exact unit as another entry.
          </p>
          {!data.canActivate ? (
            <p className="text-xs text-muted-foreground">
              Activation is performed by an active Ground Medical member of this mission.
            </p>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4" data-testid="p55-ground-filters">
            <div className="space-y-1 sm:col-span-4 md:col-span-1">
              <Label htmlFor="p38-g-search" className="text-xs">
                Search name, label, unit, demo or term ID
              </Label>
              <Input id="p38-g-search" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p55-g-domain" className="text-xs">
                Health domain
              </Label>
              <select
                id="p55-g-domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All domains ({records.length})</option>
                {domains.map((d) => (
                  <option key={d} value={d}>
                    {DOMAIN_LABEL[d] ?? d} ({records.filter((g) => g.row.proposal.entry.domain === d).length})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p38-g-filter" className="text-xs">
                Workflow status
              </Label>
              <select
                id="p38-g-filter"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All records</option>
                {STATUSES.map((c) => (
                  <option key={c} value={c}>
                    {GROUND_STATUS_LABEL[c]} ({statusCount(c)})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p55-g-unit" className="text-xs">
                Exact unit
              </Label>
              <select
                id="p55-g-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All units</option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <BulkSelectionToolbar
            idPrefix="p55-ground"
            scope={scope}
            pageCount={pageRows.length}
            onSelectAllFiltered={() => setSelected((s) => selectAllFiltered(s, filteredIds))}
            onSelectPage={() => setSelected((s) => selectIds(s, pageRows.map(idOf)))}
            onDeselectAll={() => setSelected(deselectAll())}
            onKeepOnlyFiltered={() => setSelected((s) => pruneSelection(s, filteredIds))}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-xs" aria-label="Synthetic demo proposals">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-1">Select</th>
                  <th className="p-1">Demo entry</th>
                  <th className="p-1">Matches (label · exact unit)</th>
                  <th className="p-1">Domain</th>
                  <th className="p-1">Researcher decision</th>
                  <th className="p-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((g) => {
                  const p = g.row.proposal;
                  const ev = eventById.get(p.decisionEventId);
                  return (
                    <tr key={p.decisionEventId} className="border-t border-border align-top">
                      <td className="p-1">
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.entry.displayName}`}
                          checked={selected.has(p.decisionEventId)}
                          onChange={(e) => setSelected((s) => toggleId(s, p.decisionEventId, e.target.checked))}
                        />
                      </td>
                      <td className="p-1">
                        <span className="font-medium">{p.entry.displayName}</span>
                        <div className="font-mono text-muted-foreground">{p.demoId}</div>
                      </td>
                      <td className="p-1">
                        {[...new Set([p.entry.displayName, ...p.entry.aliases])].join(", ")} · {p.entry.unit}
                        {g.existingMatch ? (
                          <div className="text-muted-foreground">Existing catalog identity: {g.existingMatch}</div>
                        ) : null}
                      </td>
                      <td className="p-1">{DOMAIN_LABEL[p.entry.domain] ?? p.entry.domain}</td>
                      <td className="p-1 text-muted-foreground">
                        {ev ? `${ev.decidedAt.slice(0, 16).replace("T", " ")} UTC` : "—"}
                        {" · "}
                        {p.decidedByCaller ? "you" : "independent Researcher"}
                        <div className="font-mono">{p.decisionEventId.slice(0, 8)}…</div>
                        {ev?.activatedAt ? (
                          <div>Activated {ev.activatedAt.slice(0, 16).replace("T", " ")} UTC</div>
                        ) : null}
                      </td>
                      <td className="p-1">
                        <Badge variant={g.status === "awaiting_activation" ? "default" : "outline"}>
                          {GROUND_STATUS_LABEL[g.status]}
                        </Badge>
                        <div className="text-muted-foreground">{g.reason}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length ? (
            <p className="text-xs text-muted-foreground">No synthetic demo proposal matches these filters.</p>
          ) : null}
          <div className="flex items-center gap-2 text-xs">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span>
              Page {page + 1} of {pages} · {filtered.length} shown of {records.length}
            </span>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
          <BulkActionTable
            idPrefix="p55-ground"
            actions={actionOptions}
            selected={selected.size}
            busy={busy}
            onReview={(id) => setPending({ action: id as GroundBulkAction, preflight: preflightFor(id as GroundBulkAction) })}
            onClear={() => setSelected(deselectAll())}
          />
          <BulkPreflightDialog
            preflight={pending?.preflight ?? null}
            labelOf={(g) => labelOf(idOf(g))}
            confirmLabel={pending?.action === "clarify" ? "Prepare clarification note" : "Confirm activation"}
            confirmDisabled={busy}
            safeguard={
              pending?.action === "clarify"
                ? "Builds a text note listing the selected records and their blocking reasons. Nothing is recorded or activated."
                : `${SYNTHETIC_DEMO_LABEL}. Only eligible entries are activated in this mission's SYNTHETIC DEMO catalog; the production catalog is never touched.`
            }
            onCancel={() => setPending(null)}
            onConfirm={() => void confirmPending()}
          />
          {run ? (
            <BulkOutcomePanel
              idPrefix="p55-ground"
              title={GROUND_ACTION_LABEL[run.action]}
              progress={run.progress}
              outcomes={run.outcomes}
              failure={run.failure}
              busy={busy}
              onRetryFailed={(ids) => {
                const sel = new Set(ids);
                setSelected(sel);
                setPending({ action: run.action, preflight: preflightFor(run.action, sel) });
              }}
              footer={syncNote ? <p>Device demo catalog: {syncNote}</p> : null}
            />
          ) : null}
          {clarification ? (
            <div className="space-y-2 rounded-md border border-border p-3 text-xs" data-testid="p55-clarification-note">
              <p className="font-medium">Clarification note (not recorded; share it with the Researcher)</p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2">{clarification}</pre>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void navigator.clipboard?.writeText(clarification)}>
                  <Copy className="mr-1 h-4 w-4" aria-hidden />
                  Copy
                </Button>
                <Button size="sm" variant="outline" onClick={downloadNote}>
                  <Download className="mr-1 h-4 w-4" aria-hidden />
                  Download .txt
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
