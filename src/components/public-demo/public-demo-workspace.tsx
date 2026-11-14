import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Copy, LogOut, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getPublicDemoWorkspaceFn,
  resetDemoWorkspaceFn,
  restoreDemoWorkspaceFn,
  startPublicDemoRoleFn,
  submitDemoExaminationFn,
  transitionDemoRecordFn,
} from "@/lib/p69-public-demo.functions";
import type { DemoWorkspaceSession } from "@/lib/p69-public-demo.server";
import { P69_DEMO_CREW_SUBJECT, P69_DEMO_MISSION_CODE, P69_SEED_CONTEXT } from "@/domain/public-demo/catalog";
import {
  DEMO_DISCLOSURE,
  DEMO_ROLES,
  DEMO_ROLE_LABELS,
  canSubmitExamination,
  createOfflineDemoState,
  currentEpochRecords,
  offlineReset,
  offlineRestore,
  offlineSubmit,
  offlineTransition,
  projectRecordForRole,
  queueFor,
  type DemoRecord,
  type DemoRole,
  type DemoTransitionAction,
  type ExaminationInput,
  type OfflineDemoState,
} from "@/domain/public-demo/workflow";
import {
  clearStoredDemoWorkspace,
  readStoredDemoWorkspace,
  writeStoredDemoWorkspace,
  type StoredDemoWorkspace,
} from "@/domain/public-demo/session-storage";
import type { SharedContextReadingInput } from "@/domain/mission-context/shared-context";
import { SharedMissionContextPanel } from "@/components/shared-mission-context-panel";
import { PublicDemoRoleEntry } from "./public-demo-role-entry";
import { PublicDemoExamForm } from "./public-demo-exam-form";
import { PublicDemoRecordCard } from "./public-demo-record-card";

type Live = { session: DemoWorkspaceSession; records: DemoRecord[]; context: SharedContextReadingInput[] };

const OFFLINE_CONTEXT: SharedContextReadingInput[] = P69_SEED_CONTEXT.map((c, i) => ({
  id: `offline-context-${i + 1}`,
  parameterId: c.parameterId,
  value: c.value,
  unit: c.unit,
  observedAt: c.observedAt,
  sourceId: c.sourceId,
  sourceLabel: c.sourceLabel,
  quality: c.sourceQuality,
  simulated: true,
  measurementSite: c.measurementSite,
  measurementMethod: c.measurementMethod,
}));

function key(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function PublicDemoWorkspace({ offline }: { offline: boolean }) {
  const [mode, setMode] = useState<"loading" | "entry" | "live" | "offline">(offline ? "offline" : "loading");
  const [live, setLive] = useState<Live | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stored, setStored] = useState<StoredDemoWorkspace | null>(null);
  const [offlineState, setOfflineState] = useState<OfflineDemoState>(() => createOfflineDemoState(new Date().toISOString()));
  const [offlineRole, setOfflineRole] = useState<DemoRole>("astronaut");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user.app_metadata?.["mitochondria_public_demo"] !== true) {
        setMode("entry");
        return;
      }
      const result = await getPublicDemoWorkspaceFn();
      if (!result.ok) {
        setNotice(result.message);
        setMode("entry");
        return;
      }
      setLive(result);
      setMode("live");
      setStored(readStoredDemoWorkspace());
    } catch {
      setNotice("The demo service could not be reached. You can use the offline rehearsal.");
      setMode("entry");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (offline) {
      setMode("offline");
      return;
    }
    void refresh();
  }, [offline, refresh]);

  const role: DemoRole = mode === "live" && live ? live.session.role : offlineRole;
  const records = useMemo(() => {
    const raw = mode === "live" && live ? live.records : currentEpochRecords(offlineState);
    return raw.map((r) => projectRecordForRole(r, role));
  }, [mode, live, offlineState, role]);

  async function submitExam(input: ExaminationInput): Promise<string | null> {
    if (mode === "offline") {
      const result = offlineSubmit(offlineState, role, input, new Date().toISOString());
      if (!result.ok) return result.message;
      setOfflineState(result.state);
      return null;
    }
    const result = await submitDemoExaminationFn({
      data: { observedOn: input.observedOn, sourceQuality: input.sourceQuality as "good", measurements: [...input.measurements], idempotencyKey: key() },
    });
    if (!result.ok) return result.message;
    await refresh();
    return null;
  }

  async function transition(args: { recordId: string; action: DemoTransitionAction; outcome: string; note: string; expectedRevision: number }): Promise<string | null> {
    if (mode === "offline") {
      const result = offlineTransition(offlineState, { ...args, role }, new Date().toISOString());
      if (!result.ok) return result.message;
      setOfflineState(result.state);
      return null;
    }
    const result = await transitionDemoRecordFn({ data: { ...args, idempotencyKey: key() } });
    if (!result.ok) {
      if (result.code === "stale" || result.code === "invalid_state") await refresh();
      return result.message;
    }
    await refresh();
    return null;
  }

  async function reset() {
    if (!window.confirm("Reset this demo workspace to the deterministic seed? Earlier versions stay restorable.")) return;
    if (mode === "offline") {
      const result = offlineReset(offlineState, offlineState.revision, new Date().toISOString());
      if (result.ok) setOfflineState(result.state);
      return;
    }
    if (!live) return;
    const result = await resetDemoWorkspaceFn({ data: { expectedRevision: live.session.workspaceRevision } });
    setNotice(result.ok ? "Workspace reset to the deterministic seed." : result.message);
    await refresh();
  }

  async function restore(epoch: number) {
    if (mode === "offline") {
      const result = offlineRestore(offlineState, epoch, offlineState.revision);
      if (result.ok) setOfflineState(result.state);
      return;
    }
    if (!live) return;
    const result = await restoreDemoWorkspaceFn({ data: { epoch, expectedRevision: live.session.workspaceRevision } });
    setNotice(result.ok ? `Workspace version ${epoch} restored.` : result.message);
    await refresh();
  }

  async function switchRole(next: DemoRole) {
    if (mode === "offline") {
      setOfflineRole(next);
      return;
    }
    if (!stored?.joinCode) {
      setNotice("This tab does not hold the workspace code. Open a new private window and join with the code instead.");
      return;
    }
    setBusy(true);
    const result = await startPublicDemoRoleFn({ data: { role: next, joinCode: stored.joinCode } }).catch(() => null);
    if (!result || !result.ok) {
      setNotice(result?.message ?? "The demo service could not be reached.");
      setBusy(false);
      return;
    }
    await supabase.auth.setSession({ access_token: result.session.accessToken, refresh_token: result.session.refreshToken });
    writeStoredDemoWorkspace({ joinCode: stored.joinCode, role: next, expiresAt: result.workspace.expiresAt });
    await refresh();
  }

  async function leave() {
    await supabase.auth.signOut({ scope: "local" });
    clearStoredDemoWorkspace();
    setLive(null);
    setStored(null);
    setMode("entry");
  }

  const epoch = mode === "live" && live ? live.session.epoch : offlineState.epoch;
  const maxEpoch = mode === "live" && live ? live.session.maxEpoch : offlineState.maxEpoch;
  const queue = queueFor(role, records);

  return (
    <main className="mx-auto max-w-[92rem] px-5 py-8 text-foreground lg:px-8">
      <p className="section-kicker">P69–P71 · NASA live demonstration</p>
      <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Astronaut → Researcher → Medical</h1>
      <p role="note" className="mt-4 max-w-4xl rounded-md border border-signal/60 bg-deep/50 p-3 text-sm">
        <ShieldCheck className="mr-2 inline size-4 text-signal" aria-hidden="true" />
        {DEMO_DISCLOSURE}
      </p>
      {notice ? <p role="status" className="mt-4 rounded-md border border-border p-3 text-sm">{notice}</p> : null}

      {mode === "loading" ? <p className="mt-8 text-muted-foreground">Opening your demo workspace…</p> : null}

      {mode === "entry" ? (
        <section className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]" aria-label="Choose a demo role">
          <PublicDemoRoleEntry variant="panel" onStarted={() => setNotice(null)} />
          <div className="rounded-xl border border-border p-5 text-sm">
            <p className="font-semibold">Offline rehearsal</p>
            <p className="mt-2 text-muted-foreground">
              The same workflow and rules in this browser tab only. Nothing is saved or sent; use it if the live demo is unavailable.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/mission/demo" search={{ offline: true }}>Start offline rehearsal</Link>
            </Button>
          </div>
        </section>
      ) : null}

      {mode === "live" || mode === "offline" ? (
        <>
          <section className="mt-6 grid gap-4 rounded-xl border border-border bg-card p-5 lg:grid-cols-[1fr_auto]" aria-label="Demo workspace">
            <div className="grid gap-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{DEMO_ROLE_LABELS[role].title}</Badge>
                <Badge variant="outline">{mode === "offline" ? "Offline rehearsal · not saved" : "Live · saved to your demo workspace"}</Badge>
              </div>
              <p>Mission <span className="font-mono">{P69_DEMO_MISSION_CODE}</span> · subject {P69_DEMO_CREW_SUBJECT.name}</p>
              <p className="text-muted-foreground">
                Workspace version {epoch} of {maxEpoch}
                {mode === "live" && live ? ` · expires ${new Date(live.session.expiresAt).toLocaleString()} · members: ${live.session.members.astronaut} astronaut, ${live.session.members.researcher} researcher, ${live.session.members.medical} medical` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                The synthetic Alex Morgan here is not the MITO_DEMO_2026 crew record or any real person's account.
              </p>
              {mode === "live" && stored?.joinCode ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  Workspace code <span className="rounded bg-muted px-2 py-0.5 font-mono">{stored.joinCode}</span>
                  <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(stored.joinCode ?? "")}>
                    <Copy /> Copy
                  </Button>
                  <span className="text-xs text-muted-foreground">Open another browser profile, pick a role and enter this code to join.</span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <label className="text-xs text-muted-foreground">
                {mode === "offline" ? "Role" : "Switch role"}
                <select
                  className="mt-1 block rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                  value={role}
                  disabled={busy}
                  onChange={(e) => void switchRole(e.target.value as DemoRole)}
                >
                  {DEMO_ROLES.map((r) => <option key={r} value={r}>{DEMO_ROLE_LABELS[r].title}</option>)}
                </select>
              </label>
              {mode === "live" ? (
                <Button variant="outline" size="sm" className="mt-5" onClick={() => void refresh()} disabled={busy}>
                  <RefreshCw className={busy ? "animate-spin" : ""} /> Refresh
                </Button>
              ) : null}
              <Button variant="outline" size="sm" className="mt-5" onClick={() => void reset()} disabled={busy}>
                <RotateCcw /> Reset workspace
              </Button>
              {maxEpoch > 1 ? (
                <label className="text-xs text-muted-foreground">
                  Restore version
                  <select
                    className="mt-1 block rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
                    value=""
                    onChange={(e) => e.target.value && void restore(Number(e.target.value))}
                  >
                    <option value="">Choose…</option>
                    {Array.from({ length: maxEpoch }, (_, i) => i + 1).filter((n) => n !== epoch).map((n) => (
                      <option key={n} value={n}>Version {n}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {mode === "live" ? (
                <Button variant="ghost" size="sm" className="mt-5" onClick={() => void leave()}>
                  <LogOut /> Leave demo
                </Button>
              ) : (
                <Button asChild variant="ghost" size="sm" className="mt-5">
                  <Link to="/mission/demo" search={{}}>Use the live demo</Link>
                </Button>
              )}
            </div>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-xl border border-border p-5">
              <h2 className="text-xl font-semibold">{DEMO_ROLE_LABELS[role].title} task</h2>
              <p className="mt-1 text-sm text-muted-foreground">{DEMO_ROLE_LABELS[role].responsibility}</p>
              <div className="mt-4">
                {canSubmitExamination(role) ? (
                  <PublicDemoExamForm key={`${role}-${epoch}`} role={role} onSubmit={submitExam} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Researchers do not submit examinations. Open a record below that is awaiting scientific assessment.
                  </p>
                )}
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                {role === "researcher" ? "Awaiting scientific assessment" : role === "medical" ? "Awaiting medical review" : "In progress"} ({queue.length})
              </h2>
              <div className="mt-3 max-h-[640px] space-y-3 overflow-y-auto pr-1">
                {queue.length ? queue.map((r) => <PublicDemoRecordCard key={`${r.id}-${r.revision}`} record={r} role={role} onTransition={transition} />) : (
                  <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Nothing is waiting for this role.</p>
                )}
              </div>
            </div>
          </section>

          <section className="mt-8" aria-labelledby="all-records-title">
            <h2 id="all-records-title" className="text-xl font-semibold">All examinations in this workspace version ({records.length})</h2>
            <div className="mt-3 grid max-h-[720px] gap-3 overflow-y-auto pr-1 lg:grid-cols-2">
              {records.map((r) => <PublicDemoRecordCard key={`all-${r.id}-${r.revision}`} record={r} role={role} onTransition={transition} actionable={false} />)}
            </div>
          </section>

          <SharedMissionContextPanel domainId="cardiovascular" readings={mode === "live" && live ? live.context : OFFLINE_CONTEXT} />
        </>
      ) : null}
    </main>
  );
}
