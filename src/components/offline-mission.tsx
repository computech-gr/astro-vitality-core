import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  LockKeyhole,
  RefreshCw,
  LogIn,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getOfflineMissionStatus,
  initializeOfflineMissionRuntime,
} from "@/infrastructure/offline";
import { getCloudMissionContext, syncRecordedMissionQueue } from "@/infrastructure/mission-records";
import type { OfflineMissionStatus } from "@/domain/offline-mission";

const emptyStatus: OfflineMissionStatus = {
  supported: false,
  encryptedStoreReady: false,
  protocolCacheReady: false,
  serviceWorkerState: "not_registered",
  connectivity: "unknown",
  pendingSyncItems: 0,
  conflictItems: 0,
  storedRecords: 0,
};

function StatusLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/40 p-3">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      ) : (
        <CloudOff className="mt-0.5 size-4 shrink-0 text-amber-400" />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function OfflineMissionPage() {
  const [status, setStatus] = useState<OfflineMissionStatus>(emptyStatus);
  const [busy, setBusy] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [cloudState, setCloudState] = useState<"checking" | "configuration_required" | "local_only" | "authenticated" | "error">("checking");
  const [cloudDetail, setCloudDetail] = useState("Checking governed Supabase access…");

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await initializeOfflineMissionRuntime();
      setStatus(await getOfflineMissionStatus());
      const cloud = await getCloudMissionContext();
      if (cloud.configuration === "missing") {
        setCloudState("configuration_required");
        setCloudDetail(
          "Cloud synchronization is not configured for this published deployment. Encrypted local capture and review remain available.",
        );
      } else if (cloud.error) {
        setCloudState("error");
        setCloudDetail(cloud.error);
      } else if (!cloud.signedIn) {
        setCloudState("local_only");
        setCloudDetail("No signed-in mission identity. Encrypted local capture continues; Supabase sync remains locked.");
      } else {
        setCloudState("authenticated");
        setCloudDetail(`${cloud.memberships.length} active mission membership(s) available for governed cloud access.`);
      }
    } catch (error) {
      setCloudState("error");
      setCloudDetail(error instanceof Error ? error.message : "Cloud status check failed.");
    } finally {
      setBusy(false);
    }
  }, []);


  const syncNow = useCallback(async () => {
    setSyncBusy(true);
    try {
      const result = await syncRecordedMissionQueue();
      if (result === "configuration_required") {
        setCloudState("configuration_required");
        setCloudDetail(
          "Cloud synchronization is not configured for this published deployment. Local encrypted capture is unaffected.",
        );
      } else if (result === "anonymous") {
        setCloudState("local_only");
        setCloudDetail("Cloud sync requires a signed-in user with an active mission membership. Local encrypted capture is unaffected.");
      } else if (result === "unavailable") {
        setCloudDetail("Cloud sync is unavailable while this device is offline.");
      } else {
        setCloudState("authenticated");
        setCloudDetail("Governed Supabase synchronization completed.");
      }
      setStatus(await getOfflineMissionStatus());
    } catch (error) {
      setCloudState("error");
      setCloudDetail(error instanceof Error ? error.message : "Cloud synchronization failed");
      setStatus(await getOfflineMissionStatus());
    } finally {
      setSyncBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const updateConnectivity = () => void refresh();
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    return () => {
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, [refresh]);

  return (
    <div className="min-h-screen bg-background text-foreground">

      <main className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="section-kicker">Offline Mission Mode · mission autonomy</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
              Earth can disappear. <span className="text-primary">The health loop must not.</span>
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              P14 keeps mission health data encrypted locally, preserves reviewed protocol content, and queues records for deterministic store-and-forward synchronization. The cloud is not in the critical sensor-to-astronaut path.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><a href="/mission/records"><Database />Recorded data</a></Button>
            <Button onClick={() => void syncNow()} disabled={syncBusy || status.connectivity !== "online"}><Cloud className={syncBusy ? "animate-pulse" : ""} />Sync now</Button>
            <Button onClick={() => void refresh()} disabled={busy} variant="secondary"><RefreshCw className={busy ? "animate-spin" : ""} />Refresh status</Button>
            {cloudState === "local_only" ? <Button asChild variant="outline"><a href="/mission/identity"><LogIn />Mission sign-in</a></Button> : null}
          </div>
        </section>

        <h2 id="offline-state-heading" className="mt-10 font-display text-2xl font-semibold">Local mission state</h2>
        <section aria-labelledby="offline-state-heading" className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><LockKeyhole className="text-primary" />Encrypted local store</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-xl">{status.encryptedStoreReady ? "READY" : "NOT READY"}</p><p className="mt-2 text-xs text-muted-foreground">AES-GCM encrypted records; non-extractable device-local key held by the browser origin.</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Database className="text-primary" />Local records</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-2xl">{status.storedRecords}</p><p className="mt-2 text-xs text-muted-foreground">Append-only encrypted event records available on this device.</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Cloud className="text-primary" />Sync queue</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-2xl">{status.pendingSyncItems}</p><p className="mt-2 text-xs text-muted-foreground">Pending/failed records remain queued until a governed remote transport is available.</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><ShieldCheck className="text-primary" />Protocol cache</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-xl">{status.protocolCacheReady ? "READY" : "NOT READY"}</p><p className="mt-2 text-xs text-muted-foreground">Versioned P13 protocol definitions are cached locally with SHA-256 integrity metadata.</p></CardContent>
          </Card>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/60 p-4" aria-label="Governed cloud synchronization status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Supabase synchronization boundary</p>
              <p className="mt-1 text-sm text-muted-foreground">{cloudDetail}</p>
            </div>
            <span className={`rounded-md border px-3 py-1 font-mono text-xs ${cloudState === "authenticated" ? "border-emerald-400/40 text-emerald-300" : cloudState === "error" ? "border-rose-400/40 text-rose-300" : "border-amber-400/40 text-amber-300"}`}>{cloudState.replaceAll("_", " ").toUpperCase()}</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Mission events are never written anonymously. When authenticated mission membership is unavailable, records remain encrypted on this device and queued for later idempotent synchronization.</p>
        </section>

        <h2 id="offline-readiness-heading" className="mt-12 font-display text-2xl font-semibold">Offline readiness and autonomy</h2>
        <section aria-labelledby="offline-readiness-heading" className="mt-5 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="bg-card/70">
            <CardHeader><CardTitle>Offline readiness</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <StatusLine ok={status.connectivity === "online"} label={`Connectivity: ${status.connectivity.toUpperCase()}`} detail="Local monitoring and storage do not require network connectivity. Connectivity only affects remote synchronization." />
              <StatusLine ok={status.serviceWorkerState === "ready"} label={`Application shell: ${status.serviceWorkerState.replaceAll("_", " ").toUpperCase()}`} detail="The service worker caches only public shell/assets. It deliberately does not cache health API responses." />
              <StatusLine ok={status.conflictItems === 0} label={`Sync conflicts: ${status.conflictItems}`} detail="Conflict resolution is deterministic by payload identity, source version, event timestamp and source priority; ambiguous ties require manual review." />
              <StatusLine ok={!status.lastError} label={status.lastError ? "Runtime issue detected" : "Runtime health nominal"} detail={status.lastError ?? "No local offline runtime error is currently recorded."} />
            </CardContent>
          </Card>

          <Card className="bg-deep">
            <CardHeader><CardTitle>What continues without Earth</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>• Live device streams continue locally when the device transport itself is available.</p>
              <p>• Accepted observations and private readiness records can be encrypted into the append-only local event store.</p>
              <p>• P12 intelligence and P13 protocol logic remain local, deterministic software modules.</p>
              <p>• Reviewed P13 protocols are cached locally with version/authority integrity metadata.</p>
              <p>• Remote synchronization is transport-agnostic. P14 provides queue/conflict semantics; the secure Supabase persistence target is connected with the ground/backend work rather than granting unsafe browser write access here.</p>
              {status.lastSyncAt && <p className="pt-2 font-mono text-xs">Last successful transport sync: {new Date(status.lastSyncAt).toLocaleString()}</p>}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
