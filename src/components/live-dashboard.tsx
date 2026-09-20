import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bluetooth,
  Camera,
  BrainCircuit,
  CircleGauge,
  CloudOff,
  HeartPulse,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Move3d,
  Download,
  Thermometer,
  Unplug,
  Waves,
  Wind,
  Zap,
} from "lucide-react";

import logoAsset from "@/assets/mitochondria-logo.png.asset.json";
import {
  createLiveDashboardState,
  deriveDashboardMetricView,
  ingestDashboardObservation,
  recordDashboardSelfCheck,
  setDashboardSourceState,
  type DashboardMetricView,
  type LiveDashboardState,
} from "@/app/live-dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ingestAdapterItem, type DeviceAdapter } from "@/integrations/device-adapters";
import { WebBluetoothHeartRateAdapter } from "@/integrations/wearables";
import {
  BrowserCameraPpgAdapter,
  BrowserDeviceMotionAdapter,
  detectBrowserLiveCapabilities,
  type BrowserLiveCapabilities,
  type CameraPpgPreviewState,
  type MotionPreviewState,
} from "@/integrations/browser-sensors";
import { persistOfflineMissionEvent } from "@/infrastructure/offline";

const LIVE_METRICS = [
  ["phys.heart_rate", "Heart rate", HeartPulse],
  ["phys.respiratory_rate", "Respiratory rate", Waves],
  ["phys.spo2", "SpO₂", Activity],
  ["environment.co2", "Cabin CO₂", Wind],
  ["environment.oxygen_fraction", "Cabin O₂", RadioTower],
  ["environment.cabin_pressure", "Cabin pressure", CircleGauge],
  ["environment.temperature", "Cabin temperature", Thermometer],
  ["radiation.dose_rate", "Radiation dose rate", Zap],
] as const;

const LIVE_DEVICE_CONTEXT = {
  missionId: "mission-local-p9",
  crewMemberId: "crew-local-p9",
  classification: "medical_sensitive" as const,
};

interface HardwareEvidenceReceipt {
  schemaVersion: "1.0";
  evidenceId: "P20-HW-001";
  generatedAt: string;
  adapterId: string;
  adapterVersion: string;
  transport: string;
  sourceId: string;
  sourceDisplayName: string;
  metricCodes: string[];
  sampleCount: number;
  firstSampleAt?: string;
  lastSampleAt?: string;
  persistedSampleCount: number;
  containsRawHealthValues: false;
  note: string;
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusBadge({ state }: { state: DashboardMetricView["state"] }) {
  const className =
    state === "live"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      : state === "stale"
        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
        : "border-border bg-muted/40 text-muted-foreground";
  return <Badge variant="outline" className={className}>{state.toUpperCase()}</Badge>;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-12 border-b border-dashed border-border/70" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${44 - ((value - min) / spread) * 36}`).join(" ");
  return (
    <svg viewBox="0 0 100 48" preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="Recent numeric trend">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" className="text-primary" />
    </svg>
  );
}

function MetricCard({ view, Icon }: { view: DashboardMetricView; Icon: typeof HeartPulse }) {
  return (
    <Card className="border-border/80 bg-card/70">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div><CardTitle className="text-sm font-medium text-muted-foreground">{view.label}</CardTitle><p className="mt-1 font-mono text-[0.65rem] uppercase tracking-widest text-muted-foreground/70">{view.metricCode}</p></div>
        <Icon className="size-5 text-primary" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-4">
          <div><div className="font-display text-3xl font-semibold">{view.value ?? "—"}</div><div className="mt-1 text-xs text-muted-foreground">{view.unit ?? "Awaiting source"}</div></div>
          <StatusBadge state={view.state} />
        </div>
        <div className="mt-4"><Sparkline values={view.history} /></div>
        <div className="mt-3 flex items-center justify-between text-[0.7rem] text-muted-foreground"><span>Quality: {view.quality?.level ?? "unknown"}</span><span>{formatTime(view.observedAt)}</span></div>
        <div className="mt-2 border-t border-border/70 pt-2 text-[0.7rem] text-muted-foreground">
          {view.baseline ? (
            <span>Personal baseline Δ: {view.baseline.delta !== undefined ? `${view.baseline.delta >= 0 ? "+" : ""}${view.baseline.delta.toFixed(1)}${view.unit ? ` ${view.unit}` : ""}` : "—"}{view.baseline.percentDelta !== undefined ? ` (${view.baseline.percentDelta >= 0 ? "+" : ""}${view.baseline.percentDelta.toFixed(1)}%)` : ""}</span>
          ) : (
            <span>Personal baseline: {view.baselineStatus === "context_mismatch" ? "context mismatch" : "not established"}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function LiveDashboard() {
  const [state, setState] = useState<LiveDashboardState>(() => createLiveDashboardState());
  const [now, setNow] = useState(() => new Date().toISOString());
  const [busy, setBusy] = useState(false);
  const [selfCheckState, setSelfCheckState] = useState<"nominal" | "monitor" | "request_support">("nominal");
  const [selfCheckNote, setSelfCheckNote] = useState("");
  const adapterRef = useRef<DeviceAdapter | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const connectedSourceRef = useRef<{ sourceId: string; displayName: string; transport: string } | null>(null);
  const [hardwareEvidence, setHardwareEvidence] = useState<HardwareEvidenceReceipt | null>(null);
  const [browserCapabilities, setBrowserCapabilities] = useState<BrowserLiveCapabilities | null>(null);
  const [cameraPreview, setCameraPreview] = useState<CameraPpgPreviewState>({ phase: "idle", waveform: [], signalQuality: 0, contactQuality: 0 });
  const [motionPreview, setMotionPreview] = useState<MotionPreviewState | null>(null);
  const [liveSourceError, setLiveSourceError] = useState<string | null>(null);

  useEffect(() => {
    setBrowserCapabilities(detectBrowserLiveCapabilities());
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 10_000);
    return () => {
      window.clearInterval(timer);
      streamAbortRef.current?.abort();
    };
  }, []);

  const views = useMemo(
    () => LIVE_METRICS.map(([code, label, Icon]) => ({ view: deriveDashboardMetricView(state, code, label, now), Icon })),
    [state, now],
  );

  async function connectAdapter(adapter: DeviceAdapter, transport: string) {
    setBusy(true);
    setLiveSourceError(null);
    adapterRef.current = adapter;
    try {
      let source: { sourceId: string; displayName: string } | undefined;
      for await (const discovered of adapter.discover()) { source = discovered; break; }
      if (!source) throw new Error("No compatible wearable source was discovered");
      connectedSourceRef.current = { ...source, transport };
      const descriptor = adapter.descriptor();
      setHardwareEvidence({
        schemaVersion: "1.0",
        evidenceId: "P20-HW-001",
        generatedAt: new Date().toISOString(),
        adapterId: descriptor.id,
        adapterVersion: descriptor.version,
        transport,
        sourceId: source.sourceId,
        sourceDisplayName: source.displayName,
        metricCodes: [],
        sampleCount: 0,
        persistedSampleCount: 0,
        containsRawHealthValues: false,
        note: "Non-value evidence receipt. Raw physiological values are intentionally excluded from the repository evidence path.",
      });
      const timestamp = new Date().toISOString();
      setState((current) => setDashboardSourceState(current, { sourceId: source!.sourceId, displayName: source!.displayName, transport, connection: "connecting" }, timestamp));
      await adapter.connect({ sourceId: source.sourceId });
      setState((current) => setDashboardSourceState(current, { sourceId: source!.sourceId, displayName: source!.displayName, transport, connection: "connected" }, new Date().toISOString()));
      const controller = new AbortController();
      streamAbortRef.current = controller;
      void (async () => {
        try {
          let sequence = 0;
          for await (const item of adapter.stream({ sourceId: source!.sourceId, signal: controller.signal })) {
            const result = ingestAdapterItem(adapter, item, { ...LIVE_DEVICE_CONTEXT, ingestionId: `p20-hw-live-${Date.now()}-${sequence++}` });
            if (result.ok && result.kind === "observation") {
              setState((current) => ingestDashboardObservation(current, result.value, new Date().toISOString()));
              setHardwareEvidence((current) => {
                if (!current) return current;
                const metricCode = result.value.observation.metric.code;
                return {
                  ...current,
                  generatedAt: new Date().toISOString(),
                  metricCodes: current.metricCodes.includes(metricCode) ? current.metricCodes : [...current.metricCodes, metricCode],
                  sampleCount: current.sampleCount + 1,
                  firstSampleAt: current.firstSampleAt ?? result.value.observation.observedAt,
                  lastSampleAt: result.value.observation.observedAt,
                };
              });
              void persistOfflineMissionEvent({
                kind: "observation",
                id: result.value.observation.id,
                mission: result.value.observation.mission,
                eventTimestamp: result.value.observation.observedAt,
                sourceId: result.value.observation.source.sourceId,
                sourceVersion: result.value.observation.source.adapterVersion ?? "1.0.0",
                sourcePriority: 80,
                classification: result.value.observation.classification,
                payload: result.value,
              })
                .then(() => setHardwareEvidence((current) => current ? { ...current, persistedSampleCount: current.persistedSampleCount + 1 } : current))
                .catch((error) => console.warn("Offline observation persistence failed", error));
            } else if (result.ok && result.kind === "series") {
              const metricCode = result.value.metricCode;
              setHardwareEvidence((current) => current ? {
                ...current,
                generatedAt: new Date().toISOString(),
                metricCodes: current.metricCodes.includes(metricCode) ? current.metricCodes : [...current.metricCodes, metricCode],
                sampleCount: current.sampleCount + result.value.samples.length,
                firstSampleAt: current.firstSampleAt ?? result.value.startedAt,
                lastSampleAt: result.value.endedAt,
              } : current);
              setState((current) => setDashboardSourceState(current, {
                sourceId: source!.sourceId,
                displayName: source!.displayName,
                transport,
                connection: "connected",
                lastSampleAt: result.value.endedAt,
              }, new Date().toISOString()));
              void persistOfflineMissionEvent({
                kind: "observation",
                id: result.value.id,
                mission: result.value.mission,
                eventTimestamp: result.value.endedAt,
                sourceId: result.value.source.sourceId,
                sourceVersion: result.value.source.adapterVersion ?? "1.0.0",
                sourcePriority: 70,
                classification: result.value.classification,
                payload: result.value,
              })
                .then(() => setHardwareEvidence((current) => current ? { ...current, persistedSampleCount: current.persistedSampleCount + 1 } : current))
                .catch((error) => console.warn("Offline motion persistence failed", error));
            }
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            setState((current) => setDashboardSourceState(current, { sourceId: source!.sourceId, displayName: source!.displayName, transport, connection: "error", message: error instanceof Error ? error.message : "Wearable stream failed" }, new Date().toISOString()));
          }
        }
      })();
    } catch (error) {
      const source = connectedSourceRef.current;
      if (source) {
        setState((current) => setDashboardSourceState(current, { sourceId: source.sourceId, displayName: source.displayName, transport: source.transport, connection: "error", message: error instanceof Error ? error.message : "Connection failed" }, new Date().toISOString()));
      } else {
        console.warn(error);
      }
      setLiveSourceError(error instanceof Error ? error.message : "Live source connection failed");
    } finally {
      setBusy(false);
    }
  }

  async function connectHeartRate() {
    await connectAdapter(new WebBluetoothHeartRateAdapter(), "ble");
  }

  async function connectCameraPpg() {
    await connectAdapter(new BrowserCameraPpgAdapter({ onPreview: setCameraPreview }), "camera_ppg");
  }

  async function connectPhoneMotion() {
    await connectAdapter(new BrowserDeviceMotionAdapter({ onPreview: setMotionPreview }), "device_sensor");
  }

  function downloadHardwareEvidence() {
    if (!hardwareEvidence || hardwareEvidence.sampleCount < 1) return;
    const blob = new Blob([JSON.stringify(hardwareEvidence, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `P20-HW-001_${hardwareEvidence.transport}_${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  async function disconnectLiveSource() {
    const source = connectedSourceRef.current;
    streamAbortRef.current?.abort();
    if (source && adapterRef.current) await adapterRef.current.disconnect(source.sourceId).catch(() => undefined);
    if (source) setState((current) => setDashboardSourceState(current, { sourceId: source.sourceId, displayName: source.displayName, transport: source.transport, connection: "disconnected" }, new Date().toISOString()));
    if (source?.transport === "device_sensor") setMotionPreview(null);
    if (source?.transport === "camera_ppg") setCameraPreview({ phase: "idle", waveform: [], signalQuality: 0, contactQuality: 0 });
    setLiveSourceError(null);
    streamAbortRef.current = null;
    adapterRef.current = null;
    connectedSourceRef.current = null;
  }

  function submitSelfCheck() {
    const recordedAt = new Date().toISOString();
    const selfCheck = {
      id: `self-${Date.now()}`,
      recordedAt,
      state: selfCheckState,
      ...(selfCheckNote.trim() ? { note: selfCheckNote.trim() } : {}),
    };
    setState((current) => recordDashboardSelfCheck(current, selfCheck));
    void persistOfflineMissionEvent({
      kind: "self_check",
      id: selfCheck.id,
      mission: { missionId: LIVE_DEVICE_CONTEXT.missionId, crewMemberId: LIVE_DEVICE_CONTEXT.crewMemberId },
      eventTimestamp: recordedAt,
      sourceId: "p9-live-self-check",
      sourceVersion: "1.0.0",
      sourcePriority: 60,
      classification: "medical_sensitive",
      payload: selfCheck,
    }).catch((error) => console.warn("Offline self-check persistence failed", error));
    setSelfCheckNote("");
  }

  const connectedSource = connectedSourceRef.current ? state.sources[connectedSourceRef.current.sourceId] : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[96rem] items-center justify-between gap-4 px-5 lg:px-8">
          <div className="flex items-center gap-4"><a href="/" className="rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Back to public site"><img src={logoAsset.url} alt="" className="h-10 w-auto" /></a><div><p className="font-display text-lg font-semibold">Astronaut Live Dashboard</p><p className="font-mono text-[0.68rem] uppercase tracking-widest text-muted-foreground">P10 baseline-aware mission view</p></div></div>
          <div className="flex gap-2"><Button asChild variant="outline" className="border-border"><a href="/mission/readiness"><BrainCircuit />Readiness</a></Button><Button asChild variant="outline" className="border-border"><a href="/"><ArrowLeft />Public site</a></Button></div>
        </div>
      </header>

      <main className="mx-auto max-w-[96rem] px-5 py-8 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><p className="section-kicker">Live mission health</p><h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">What is happening <span className="text-primary">right now?</span></h1><p className="mt-4 max-w-3xl leading-7 text-muted-foreground">Live physiological and spacecraft signals share one timeline. Data quality, freshness and connection state stay visible; no missing value is silently invented.</p></div>
          <div className="flex flex-wrap gap-3"><Button asChild variant="outline"><a href="/mission/devices">Device Integration Center</a></Button><Button variant="outline" onClick={disconnectLiveSource} disabled={!connectedSource}><Unplug />Disconnect current source</Button></div>
        </section>

        <div className="mt-6 grid gap-3 rounded-lg border border-border bg-surface/70 p-4 md:grid-cols-3">
          <div><span className="text-xs uppercase tracking-wider text-muted-foreground">Mission context</span><strong className="mt-1 block font-mono text-sm">LOCAL P9 SESSION</strong></div>
          <div><span className="text-xs uppercase tracking-wider text-muted-foreground">Persistence</span><strong className="mt-1 block font-mono text-sm text-amber-300">ENCRYPTED LOCAL + GOVERNED SYNC QUEUE</strong></div>
          <div><span className="text-xs uppercase tracking-wider text-muted-foreground">Health interpretation</span><strong className="mt-1 block font-mono text-sm">BASELINE DELTAS ONLY — NO ALERTS / DIAGNOSIS</strong></div>
        </div>

        <section id="live-sources" className="mt-6 rounded-lg border border-border bg-surface/70 p-4" aria-labelledby="hardware-path-title">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="section-kicker">P20 zero-install live evidence</p>
              <h2 id="hardware-path-title" className="mt-2 font-display text-xl font-semibold">Choose a real live source</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">Camera PPG and phone motion run directly in the browser after explicit permission. Direct BLE remains available when the browser supports Web Bluetooth and the sensor exposes the standard Heart Rate Service. Unsupported capabilities fail closed; no demo value is generated.</p>
            </div>
            <Button variant="outline" onClick={downloadHardwareEvidence} disabled={!hardwareEvidence || hardwareEvidence.sampleCount < 1}><Download />Download non-value evidence receipt</Button>
          </div>

          {liveSourceError && <div role="alert" className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200"><strong>Live source could not start.</strong><span className="ml-2">{liveSourceError}</span></div>}

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-border bg-background/35 p-4">
              <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">Phone Camera PPG</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">Universal zero-install pulse demo on browsers that expose camera capture. Pulse estimate only — not ECG.</p></div><Camera className="size-5 text-primary" /></div>
              <div className="mt-3 flex items-center justify-between text-xs"><span>Capability</span><span className="font-mono">{browserCapabilities?.cameraPpg.availability.replaceAll("_", " ").toUpperCase() ?? "CHECKING"}</span></div>
              <Button className="mt-3 w-full" onClick={connectCameraPpg} disabled={busy || connectedSource?.connection === "connected" || browserCapabilities?.cameraPpg.availability === "unsupported"}><Camera />Start camera pulse</Button>
            </div>
            <div className="rounded-md border border-border bg-background/35 p-4">
              <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">Phone Motion Sensors</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">Tri-axial acceleration for activity context and motion-artifact awareness.</p></div><Move3d className="size-5 text-primary" /></div>
              <div className="mt-3 flex items-center justify-between text-xs"><span>Capability</span><span className="font-mono">{browserCapabilities?.deviceMotion.availability.replaceAll("_", " ").toUpperCase() ?? "CHECKING"}</span></div>
              <Button className="mt-3 w-full" variant="outline" onClick={connectPhoneMotion} disabled={busy || connectedSource?.connection === "connected" || browserCapabilities?.deviceMotion.availability === "unsupported"}><Smartphone />Start phone motion</Button>
            </div>
            <div className="rounded-md border border-border bg-background/35 p-4">
              <div className="flex items-start justify-between gap-3"><div><strong className="text-sm">Direct Bluetooth Sensor</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">Zero-install connection to a user-selected standard BLE Heart Rate Service sensor.</p></div><Bluetooth className="size-5 text-primary" /></div>
              <div className="mt-3 flex items-center justify-between text-xs"><span>Capability</span><span className="font-mono">{browserCapabilities?.webBluetooth.availability.replaceAll("_", " ").toUpperCase() ?? "CHECKING"}</span></div>
              <Button className="mt-3 w-full" variant="outline" onClick={connectHeartRate} disabled={busy || connectedSource?.connection === "connected" || browserCapabilities?.webBluetooth.availability === "unsupported"}><Bluetooth />Scan Bluetooth sensor</Button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div><span className="text-xs uppercase tracking-wider text-muted-foreground">Current source</span><strong className="mt-1 block text-sm">{connectedSource?.displayName ?? "NONE"}</strong></div>
            <div><span className="text-xs uppercase tracking-wider text-muted-foreground">Physical samples</span><strong className="mt-1 block font-mono text-sm">{hardwareEvidence?.sampleCount ?? 0}</strong></div>
            <div><span className="text-xs uppercase tracking-wider text-muted-foreground">Encrypted writes</span><strong className="mt-1 block font-mono text-sm">{hardwareEvidence?.persistedSampleCount ?? 0}</strong></div>
            <div><span className="text-xs uppercase tracking-wider text-muted-foreground">Evidence rule</span><strong className="mt-1 block text-sm">NO RAW HEALTH VALUES EXPORTED</strong></div>
          </div>

          {(cameraPreview.phase !== "idle" || motionPreview) && <div className="mt-4 grid gap-3 md:grid-cols-2">
            {cameraPreview.phase !== "idle" && <div className="rounded-md border border-border p-4"><div className="flex items-center justify-between"><strong className="text-sm">Camera PPG signal</strong><Badge variant="outline">{cameraPreview.phase.toUpperCase()}</Badge></div><p className="mt-2 text-xs text-muted-foreground">Signal quality {(cameraPreview.signalQuality * 100).toFixed(0)}% · Contact {(cameraPreview.contactQuality * 100).toFixed(0)}%{cameraPreview.bpm ? ` · ${cameraPreview.bpm} bpm` : ""}</p><Sparkline values={cameraPreview.waveform} />{cameraPreview.message && <p className="mt-2 text-xs text-muted-foreground">{cameraPreview.message}</p>}{cameraPreview.diagnostics && <div className="mt-4 rounded-md border border-border/70 bg-background/40 p-3"><div className="flex items-center justify-between gap-3"><strong className="text-xs uppercase tracking-wider">Camera diagnostics</strong><span className="font-mono text-[0.65rem] text-muted-foreground">{formatTime(cameraPreview.diagnostics.checkedAt)}</span></div><dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">Browser error</dt><dd className="font-mono">{cameraPreview.diagnostics.errorName ?? "NONE"}</dd></div><div><dt className="text-muted-foreground">Permission state</dt><dd className="font-mono uppercase">{cameraPreview.diagnostics.permissionState}</dd></div><div><dt className="text-muted-foreground">Secure HTTPS context</dt><dd className="font-mono">{cameraPreview.diagnostics.secureContext ? "YES" : "NO"}</dd></div><div><dt className="text-muted-foreground">Top-level page</dt><dd className="font-mono">{cameraPreview.diagnostics.topLevelContext ? "YES" : "NO"}</dd></div><div><dt className="text-muted-foreground">Camera API</dt><dd className="font-mono">{cameraPreview.diagnostics.cameraApiAvailable ? "AVAILABLE" : "UNAVAILABLE"}</dd></div><div><dt className="text-muted-foreground">Visible video inputs</dt><dd className="font-mono">{cameraPreview.diagnostics.videoInputCount ?? "UNKNOWN"}</dd></div><div><dt className="text-muted-foreground">Rear camera</dt><dd className="font-mono uppercase">{cameraPreview.diagnostics.rearCameraState.replaceAll("_", " ")}</dd></div><div><dt className="text-muted-foreground">Camera busy / OS lock</dt><dd className="font-mono">{cameraPreview.diagnostics.cameraBusyLikely ? "POSSIBLE" : "NOT INDICATED"}</dd></div><div><dt className="text-muted-foreground">Page visibility</dt><dd className="font-mono uppercase">{cameraPreview.diagnostics.visibilityState}</dd></div><div><dt className="text-muted-foreground">Selected facing mode</dt><dd className="font-mono uppercase">{cameraPreview.diagnostics.selectedFacingMode ?? "UNKNOWN"}</dd></div><div><dt className="text-muted-foreground">Permissions Policy (camera)</dt><dd className="font-mono uppercase">{cameraPreview.diagnostics.permissionsPolicyCamera}</dd></div><div><dt className="text-muted-foreground">Acquisition stage</dt><dd className="font-mono uppercase">{cameraPreview.diagnostics.acquisitionStage.replaceAll("_", " ")}</dd></div></dl><p className="mt-3 text-xs text-amber-200"><strong>Likely cause:</strong> {cameraPreview.diagnostics.likelyCause}</p>{cameraPreview.diagnostics.errorMessage && <p className="mt-2 break-words font-mono text-[0.68rem] text-muted-foreground">{cameraPreview.diagnostics.errorMessage}</p>}</div>}</div>}
            {motionPreview && <div className="rounded-md border border-border p-4"><div className="flex items-center justify-between"><strong className="text-sm">Phone motion context</strong><Badge variant="outline">{motionPreview.quality.toUpperCase()}</Badge></div><p className="mt-2 font-mono text-xs text-muted-foreground">x {motionPreview.x.toFixed(2)}g · y {motionPreview.y.toFixed(2)}g · z {motionPreview.z.toFixed(2)}g · |a| {motionPreview.magnitude.toFixed(2)}g</p><p className="mt-2 text-xs text-muted-foreground">{formatTime(motionPreview.observedAt)}</p></div>}
          </div>}
        </section>

        <section aria-labelledby="vitals-title" className="mt-8"><div className="flex items-center justify-between gap-4"><div><p className="section-kicker">Vitals & environment</p><h2 id="vitals-title" className="mt-2 font-display text-2xl font-semibold">Live signal board</h2></div><p className="hidden max-w-lg text-right text-xs leading-5 text-muted-foreground md:block">Freshness states are technical recency indicators, not medical thresholds.</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{views.map(({ view, Icon }) => <MetricCard key={view.metricCode} view={view} Icon={Icon} />)}</div></section>

        <section className="mt-8 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <Card className="border-border bg-card/70"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="text-primary" />Device & source status</CardTitle></CardHeader><CardContent><div className="space-y-3">{Object.values(state.sources).length ? Object.values(state.sources).map((source) => <div key={source.sourceId} className="grid gap-2 rounded-md border border-border p-4 sm:grid-cols-[1fr_auto]"><div><strong className="text-sm">{source.displayName}</strong><p className="mt-1 font-mono text-xs text-muted-foreground">{source.sourceId}</p><p className="mt-2 text-xs text-muted-foreground">Last sample: {formatTime(source.lastSampleAt)}</p>{source.message && <p className="mt-2 text-xs text-amber-300">{source.message}</p>}</div><Badge variant="outline" className="h-fit uppercase">{source.connection}</Badge></div>) : <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground"><CloudOff className="mb-3 size-6" />No live source connected. Supported P6 adapters remain available; this view does not fabricate telemetry.</div>}</div></CardContent></Card>

          <Card className="border-border bg-card/70"><CardHeader><CardTitle className="flex items-center gap-2"><RefreshCw className="text-primary" />Mission timeline</CardTitle></CardHeader><CardContent><div className="max-h-80 space-y-4 overflow-y-auto pr-2">{state.timeline.length ? state.timeline.map((event) => <div key={event.id} className="grid grid-cols-[5.5rem_1fr] gap-3 border-l border-border pl-4"><span className="font-mono text-xs text-muted-foreground">{formatTime(event.occurredAt)}</span><div><strong className="text-sm font-medium">{event.label}</strong>{event.detail && <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p>}</div></div>) : <p className="text-sm text-muted-foreground">Connection, measurement and self-check events will appear here.</p>}</div></CardContent></Card>
        </section>

        <section className="mt-8"><Card className="border-border bg-card/70"><CardHeader><CardTitle>Simple self-check</CardTitle><p className="text-sm text-muted-foreground">Low-burden mission check-in only. This is not a validated psychological assessment; P11 owns governed cognitive/behavioral measures.</p></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-[14rem_1fr_auto] md:items-end"><div><Label htmlFor="self-check-state">Current state</Label><Select value={selfCheckState} onValueChange={(value) => setSelfCheckState(value as typeof selfCheckState)}><SelectTrigger id="self-check-state" className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nominal">Nominal</SelectItem><SelectItem value="monitor">Monitor / not at best</SelectItem><SelectItem value="request_support">Request support</SelectItem></SelectContent></Select></div><div><Label htmlFor="self-check-note">Optional note</Label><Input id="self-check-note" className="mt-2" value={selfCheckNote} onChange={(event) => setSelfCheckNote(event.target.value)} placeholder="Context only — no diagnosis" maxLength={240} /></div><Button onClick={submitSelfCheck}>Record check-in</Button></div>{state.selfChecks[0] && <p className="mt-4 text-xs text-muted-foreground">Last recorded at {formatTime(state.selfChecks[0].recordedAt)} — encrypted locally for offline continuity and queued for governed sync.</p>}</CardContent></Card></section>

        <p className="mt-6 text-xs leading-5 text-muted-foreground">P10 boundary: the dashboard can display a governed personal-baseline delta when a validated baseline profile is available. It does not create medical alerts, diagnoses or protocol actions. Encrypted local persistence and governed store-and-forward are active; this view does not create medical alerts, diagnoses or protocol actions.</p>
      </main>
    </div>
  );
}
