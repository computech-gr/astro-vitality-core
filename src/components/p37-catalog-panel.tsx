/**
 * P37 governed catalog: scientific approval of new biomarkers, separate catalog
 * activation/revocation, signed offline catalog sync, and an isolated synthetic
 * lifecycle demonstration. Every write goes through caller-scoped RPCs; the
 * device installs only a verified signed snapshot and never activates locally.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash, Lock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listGlobalReviewMissions, listGlobalReviewSubmissions } from "@/lib/p36-global-review.functions";
import { activateCatalogEntryFn, approveNewBiomarkerFn, getCatalogLifecycle, getSignedCatalogSnapshot, revokeCatalogEntryFn } from "@/lib/p37-catalog.functions";
import type { LifecycleRow, ReceiptRow } from "@/lib/p37-catalog.server";
import type { GlobalReviewMission, GlobalReviewSubmission } from "@/lib/p36-global-review.server";
import { browserSnapshotStorage, getActiveCatalog, getInstalledSnapshot, installOfferedCatalog, subscribeActiveCatalog } from "@/domain/health-intelligence/active-catalog-runtime";
import { runSyntheticCatalogLifecycleDemo, type DemoStep } from "@/domain/health-intelligence/catalog-lifecycle-demo";

type Msg = { ok: boolean; text: string } | null;
const DOMAINS = ["immune", "bone", "cardiovascular", "behavioral"] as const;

function useActiveCatalog() {
  return useSyncExternalStore(subscribeActiveCatalog, getActiveCatalog, getActiveCatalog);
}

function OfflineCatalogStatus() {
  const catalog = useActiveCatalog();
  const sync = useServerFn(getSignedCatalogSnapshot);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const installed = getInstalledSnapshot();
  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await sync().catch(() => null);
      if (!r || !r.ok) { setMsg({ ok: false, text: r?.message ?? "Catalog sync unavailable. This device keeps its last verified catalog." }); return; }
      const storage = browserSnapshotStorage();
      if (!storage) { setMsg({ ok: false, text: "Device storage unavailable." }); return; }
      const res = await installOfferedCatalog(r.signed, { storage });
      setMsg({ ok: res.installed, text: res.reason });
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Activated catalog on this device</p>
          <p className="text-xs text-muted-foreground">
            {installed ? `Verified version ${catalog.catalogVersion} · ${catalog.active.length} active · ${catalog.historical.length - catalog.active.length} revoked · issued ${installed.snapshot.issuedAt.slice(0, 16).replace("T", " ")} UTC` : "No synchronized catalog yet; only the bundled catalog is used."}
            {" "}Recognition works offline from the last verified snapshot.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}><RefreshCw className="mr-1 h-4 w-4" aria-hidden />{busy ? "Verifying…" : "Sync catalog"}</Button>
      </div>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs" : "text-xs text-destructive"}>{msg.text}</p> : null}
    </div>
  );
}

function SyntheticDemo() {
  const [steps, setSteps] = useState<DemoStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const all = steps?.every((s) => s.pass);
  return (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer font-medium">Synthetic end-to-end demonstration (isolated, test-only)</summary>
      <p className="mt-2 text-xs text-muted-foreground">Runs in this browser's memory with a throwaway test key and an explicitly synthetic validation fixture. Nothing is saved, synchronized or added to the real catalog.</p>
      <Button className="mt-2" size="sm" disabled={busy} onClick={() => { setBusy(true); void runSyntheticCatalogLifecycleDemo().then(setSteps).finally(() => setBusy(false)); }}>
        {busy ? "Running…" : "Run synthetic lifecycle"}
      </Button>
      {steps ? (
        <div className="mt-3 space-y-2">
          <p role="status" className="font-medium">{all ? `All ${steps.length} steps passed` : `${steps.filter((s) => !s.pass).length} step(s) failed`}</p>
          <ol className="space-y-1 text-xs">
            {steps.map((s) => (
              <li key={s.step} className="flex items-start gap-2">
                {s.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="pass" /> : <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="fail" />}
                <span><span className="font-medium">{s.step}:</span> {s.actual}{s.pass ? "" : ` (expected ${s.expected})`}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </details>
  );
}

function ApproveForm({ receipt, submissions, mission, onDone }: { receipt: ReceiptRow; submissions: GlobalReviewSubmission[]; mission: GlobalReviewMission; onDone: () => Promise<void> }) {
  const approve = useServerFn(approveNewBiomarkerFn);
  const matches = submissions.filter((s) => s.terms.some((t) => t.termId === receipt.termId));
  const [submissionId, setSubmissionId] = useState(matches[0]?.submissionId ?? "");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]>("immune");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [key] = useState(() => crypto.randomUUID());
  if (!matches.length) return <p className="text-xs text-muted-foreground">No submitted term in this mission matches this receipt.</p>;
  return (
    <div className="space-y-2">
      {matches.length > 1 ? (
        <select aria-label="Submission" value={submissionId} onChange={(e) => setSubmissionId(e.target.value)} className="w-full rounded-md border border-border bg-background p-1 text-xs">
          {matches.map((s) => <option key={s.submissionId} value={s.submissionId}>{s.requestId}</option>)}
        </select>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <div className="space-y-1"><Label htmlFor={`name-${receipt.validationReference}`} className="text-xs">Canonical name</Label>
          <Input id={`name-${receipt.validationReference}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-8 w-56" /></div>
        <div className="space-y-1"><Label htmlFor={`dom-${receipt.validationReference}`} className="text-xs">Scientific domain</Label>
          <select id={`dom-${receipt.validationReference}`} value={domain} onChange={(e) => setDomain(e.target.value as (typeof DOMAINS)[number])} className="h-8 rounded-md border border-border bg-background px-1 text-xs">
            {DOMAINS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select></div>
      </div>
      <Button size="sm" disabled={busy || name.trim().length < 3} onClick={() => {
        setBusy(true);
        void approve({ data: { missionId: mission.missionId, provenance: "synthetic", submissionId, termId: receipt.termId, validationReference: receipt.validationReference, canonicalName: name.trim(), domain, idempotencyKey: key } })
          .then(async (r) => { setMsg(r.ok ? { ok: true, text: "Scientific approval recorded; catalog proposal created. Activation is a separate step." } : { ok: false, text: r.message }); if (r.ok) await onDone(); })
          .catch(() => setMsg({ ok: false, text: "Nothing was recorded. Try again; the same request will not be duplicated." }))
          .finally(() => setBusy(false));
      }}>{busy ? "Recording…" : "Record scientific approval"}</Button>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs" : "text-xs text-destructive"}>{msg.text}</p> : null}
    </div>
  );
}

function EntryActions({ row, canActivate, onDone }: { row: LifecycleRow; canActivate: boolean; onDone: () => Promise<void> }) {
  const activate = useServerFn(activateCatalogEntryFn);
  const revoke = useServerFn(revokeCatalogEntryFn);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [key] = useState(() => crypto.randomUUID());
  const act = async (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) => {
    setBusy(true);
    try { const r = await fn(); setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.message ?? "Nothing was recorded." }); if (r.ok) await onDone(); }
    catch { setMsg({ ok: false, text: "Nothing was recorded. Try again." }); } finally { setBusy(false); }
  };
  if (!canActivate) return <p className="text-xs text-muted-foreground"><Lock className="mr-1 inline h-3 w-3" aria-hidden />Activation needs a separate owner-provisioned catalog activator grant.</p>;
  if (row.revocationEventId) return null;
  if (!row.activationEventId)
    return (
      <div className="space-y-1">
        <Button size="sm" disabled={busy || row.approvedByCaller} onClick={() => void act(() => activate({ data: { approvalEventId: row.approvalEventId, expectedEntrySha256: row.entrySha256, idempotencyKey: key } }), "Catalog entry activated. Devices recognize it after their next verified catalog sync.")}>Activate catalog entry</Button>
        {row.approvedByCaller ? <p className="text-xs text-muted-foreground">You approved this entry; a different authorized activator must activate it.</p> : null}
        {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs" : "text-xs text-destructive"}>{msg.text}</p> : null}
      </div>
    );
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1"><Label htmlFor={`rev-${row.activationEventId}`} className="text-xs">Revocation reason</Label>
        <Input id={`rev-${row.activationEventId}`} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} className="h-8 w-64" /></div>
      <Button size="sm" variant="outline" disabled={busy || reason.trim().length < 8} onClick={() => void act(() => revoke({ data: { activationEventId: row.activationEventId!, reason: reason.trim(), idempotencyKey: key } }), "Catalog entry revoked. Historical records are unchanged.")}>Revoke</Button>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "w-full text-xs" : "w-full text-xs text-destructive"}>{msg.text}</p> : null}
    </div>
  );
}

export function P37CatalogPanel() {
  const listMissions = useServerFn(listGlobalReviewMissions);
  const listSubs = useServerFn(listGlobalReviewSubmissions);
  const lifecycle = useServerFn(getCatalogLifecycle);
  const [missions, setMissions] = useState<GlobalReviewMission[]>([]);
  const [missionId, setMissionId] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [note, setNote] = useState("");
  const [data, setData] = useState<{ canApprove: boolean; canActivate: boolean; events: LifecycleRow[]; receipts: ReceiptRow[] } | null>(null);
  const [subs, setSubs] = useState<GlobalReviewSubmission[]>([]);

  useEffect(() => {
    void listMissions({ data: { provenance: "synthetic" } }).then((r) => {
      if (r.ok) { setMissions(r.missions); if (r.missions.length === 1) setMissionId(r.missions[0]!.missionId); }
    }).catch(() => undefined);
  }, [listMissions]);

  const load = useCallback(async () => {
    if (!missionId) return;
    setState("loading");
    const [l, s] = await Promise.all([lifecycle({ data: { missionId, provenance: "synthetic" } }).catch(() => null), listSubs({ data: { missionId, provenance: "synthetic" } }).catch(() => null)]);
    if (!l || !l.ok) { setState("error"); setNote(l?.message ?? "Catalog lifecycle unavailable. Nothing was changed."); setData(null); return; }
    setData({ canApprove: l.canApprove, canActivate: l.canActivate, events: l.events, receipts: l.receipts });
    setSubs(s && s.ok ? s.submissions : []);
    setState("ready");
  }, [missionId, lifecycle, listSubs]);
  useEffect(() => { void load(); }, [load]);

  const mission = missions.find((m) => m.missionId === missionId) ?? null;
  const approvedKeys = new Set(data?.events.map((e) => `${e.termId}|${e.entry.canonicalId}`) ?? []);
  const openReceipts = data?.receipts.filter((r) => !approvedKeys.has(`${r.termId}|${r.canonicalMetricId}`)) ?? [];

  return (
    <section aria-labelledby="p37-title" className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h2 id="p37-title" className="text-lg font-semibold">New biomarker catalog: approval, activation and recognition</h2>
        <p className="text-sm text-muted-foreground">
          Triage acceptance → independently provisioned source validation → scientific approval (creates the catalog proposal) → separate catalog activation → automatic recognition in later compatible examinations, online or offline. Approver and activator must be different authorized accounts; nothing here changes stored observations.
        </p>
      </div>
      <OfflineCatalogStatus />
      <SyntheticDemo />

      {missions.length ? (
        <div className="space-y-1">
          <Label htmlFor="p37-mission">Mission (synthetic submissions)</Label>
          <select id="p37-mission" value={missionId} onChange={(e) => setMissionId(e.target.value)} className="w-full max-w-md rounded-md border border-border bg-background p-2 text-sm">
            <option value="">Choose a mission</option>
            {missions.map((m) => <option key={m.missionId} value={m.missionId}>{m.missionName} ({m.missionCode})</option>)}
          </select>
        </div>
      ) : <p className="text-sm text-muted-foreground">Sign in with a scientific review account to manage catalog approvals.</p>}

      {state === "loading" ? <p role="status" className="text-sm text-muted-foreground">Reading catalog lifecycle…</p> : null}
      {state === "error" ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
      {state === "ready" && data && mission ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant={data.canApprove ? "secondary" : "outline"}>{data.canApprove ? "You may record scientific approvals" : "No scientific approver grant"}</Badge>
            <Badge variant={data.canActivate ? "secondary" : "outline"}>{data.canActivate ? "You may activate / revoke catalog entries" : "No catalog activator grant"}</Badge>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Source-validated terms awaiting scientific approval</h3>
            {!openReceipts.length ? <p className="text-sm text-muted-foreground">No independently provisioned source-validation receipt is waiting. Receipts are never created in the app.</p> : (
              <ul className="space-y-3">
                {openReceipts.map((r) => (
                  <li key={`${r.termId}|${r.validationReference}`} className="space-y-2 rounded-md border border-border p-3 text-sm">
                    <p className="font-mono text-xs">{r.termId} → {r.canonicalMetricId}</p>
                    <p className="text-xs text-muted-foreground">Unit {r.exactUnit} · specimen {r.specimen} · method {r.method} · protocol {r.protocol} {r.protocolVersion} · receipt {r.validationReference}</p>
                    {data.canApprove ? <ApproveForm receipt={r} submissions={subs} mission={mission} onDone={load} /> : <p className="text-xs text-muted-foreground"><Lock className="mr-1 inline h-3 w-3" aria-hidden />Approval needs a separate owner-provisioned scientific approver grant.</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Approved catalog proposals</h3>
            {!data.events.length ? <p className="text-sm text-muted-foreground">No scientific approvals recorded for this mission.</p> : (
              <ul className="space-y-3">
                {data.events.map((e) => (
                  <li key={e.approvalEventId} className="space-y-2 rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.entry.canonicalName}</span>
                      <span className="font-mono text-xs">{e.canonicalId}</span>
                      <Badge variant={e.revocationEventId ? "outline" : e.activationEventId ? "default" : "secondary"}>
                        {e.revocationEventId ? "Revoked" : e.activationEventId ? "Catalog active" : "Approved · awaiting activation"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Aliases {e.entry.aliases.join(", ")} · unit {e.entry.unit} · specimen {e.entry.specimen} · method {e.entry.method} · domain {e.entry.domain}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">Proposal SHA-256 {e.entrySha256}</p>
                    {e.revocationReason ? <p className="text-xs">Revoked: {e.revocationReason}</p> : null}
                    <EntryActions row={e} canActivate={data.canActivate} onDone={load} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
