import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import logoAsset from "@/assets/mitochondria-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getOfflineMissionStatus,
  initializeOfflineMissionRuntime,
} from "@/infrastructure/offline";
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

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      await initializeOfflineMissionRuntime();
      setStatus(await getOfflineMissionStatus());
    } finally {
      setBusy(false);
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
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[96rem] items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-4">
            <a href="/" className="rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Back to public site">
              <img src={logoAsset.url} alt="" className="h-10 w-auto" />
            </a>
            <div>
              <p className="font-display text-lg font-semibold">Offline Mission Mode</p>
              <p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-foreground">P14 · local autonomy & store-and-forward</p>
            </div>
          </div>
          <Button asChild variant="outline">
            <a href="/mission/live"><ArrowLeft />Live dashboard</a>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="section-kicker">Mission autonomy</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
              Earth can disappear. <span className="text-primary">The health loop must not.</span>
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              P14 keeps mission health data encrypted locally, preserves reviewed protocol content, and queues records for deterministic store-and-forward synchronization. The cloud is not in the critical sensor-to-astronaut path.
            </p>
          </div>
          <Button onClick={() => void refresh()} disabled={busy} variant="secondary">
            <RefreshCw className={busy ? "animate-spin" : ""} />Refresh status
          </Button>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
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
