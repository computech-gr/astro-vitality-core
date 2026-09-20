import type {
  AdapterCapabilities,
  AdapterConnectOptions,
  AdapterDescriptor,
  AdapterHealth,
  AdapterNormalizationContext,
  AdapterStreamItem,
  AdapterStreamOptions,
  AdapterSyncCursor,
  DeviceAdapter,
  DiscoveredSource,
} from "../device-adapters";
import { sourceRefFromAdapter } from "../device-adapters";
import type { CanonicalObservationDraft, DataQuality, RawSignalChunk } from "../../domain";
import { estimatePpgHeartRate, normalizePpgWaveform, type TimedPpgSample } from "./ppg-algorithm";

export type CameraPpgPhase = "idle" | "requesting_permission" | "acquiring" | "measuring" | "error";

export type CameraPermissionState = "granted" | "denied" | "prompt" | "unsupported" | "unknown";
export type RearCameraState = "available" | "not_detected" | "unknown_until_permission" | "unknown";

export interface CameraPpgDiagnostics {
  checkedAt: string;
  errorName?: string | undefined;
  errorMessage?: string | undefined;
  permissionState: CameraPermissionState;
  secureContext: boolean;
  topLevelContext: boolean;
  visibilityState: DocumentVisibilityState | "unknown";
  cameraApiAvailable: boolean;
  enumerateDevicesAvailable: boolean;
  videoInputCount?: number | undefined;
  rearCameraState: RearCameraState;
  selectedFacingMode?: string | undefined;
  cameraBusyLikely: boolean;
  likelyCause: string;
}

export interface CameraPpgPreviewState {
  phase: CameraPpgPhase;
  waveform: number[];
  signalQuality: number;
  contactQuality: number;
  bpm?: number;
  message?: string;
  diagnostics?: CameraPpgDiagnostics;
}

export interface CameraPpgAdapterOptions {
  onPreview?: (state: CameraPpgPreviewState) => void;
  now?: () => number;
}

const DESCRIPTOR: AdapterDescriptor = {
  id: "org.mitochondria.browser-camera-ppg",
  version: "1.0.0",
  displayName: "Phone Camera PPG",
  transport: "camera_ppg",
};

const SOURCE: DiscoveredSource = {
  sourceId: "camera:ppg:browser",
  displayName: "Phone camera PPG",
  transport: "camera_ppg",
  manufacturer: "browser",
  model: "rear-camera",
};

const DEFAULT_QUALITY: DataQuality = {
  level: "unknown",
  score: 0,
  artifactFlags: ["contact_quality_unverified"],
};

function previewQuality(quality: number): DataQuality {
  const score = Math.max(0, Math.min(1, quality));
  return {
    level: score >= 0.72 ? "good" : score >= 0.48 ? "degraded" : "poor",
    score,
    artifactFlags: score >= 0.72 ? [] : ["camera_ppg_signal_quality_low"],
  };
}

function stopMediaStream(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function cameraErrorName(error: unknown): string | undefined {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) return error.name;
  if (error instanceof Error && "name" in error) return error.name;
  return undefined;
}

function cameraErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

export function classifyCameraAccessError(
  errorName: string | undefined,
  permissionState: CameraPermissionState,
): { cameraBusyLikely: boolean; likelyCause: string } {
  switch (errorName) {
    case "NotAllowedError":
      return {
        cameraBusyLikely: false,
        likelyCause:
          permissionState === "denied"
            ? "Browser/site camera permission is denied."
            : permissionState === "granted"
              ? "Camera permission appears granted, but capture was blocked by the browser, operating system, or device privacy policy."
              : "Camera access was not granted. The permission prompt may have been dismissed or blocked by browser/device policy.",
      };
    case "NotFoundError":
      return { cameraBusyLikely: false, likelyCause: "No usable video-input camera was found for this browser session." };
    case "NotReadableError":
      return {
        cameraBusyLikely: true,
        likelyCause:
          "A camera exists, but the browser could not read it. Another app may be using the camera, or the operating system/driver may be blocking access.",
      };
    case "OverconstrainedError":
      return { cameraBusyLikely: false, likelyCause: "The requested camera constraints could not be satisfied by the available camera hardware." };
    case "SecurityError":
      return { cameraBusyLikely: false, likelyCause: "Camera access was blocked by browser security policy or document context." };
    case "AbortError":
      return { cameraBusyLikely: false, likelyCause: "Camera startup was interrupted before capture became available." };
    case "TypeError":
      return { cameraBusyLikely: false, likelyCause: "Camera capture is unavailable in this document context or the media constraints were rejected." };
    default:
      return {
        cameraBusyLikely: false,
        likelyCause: errorName
          ? `Camera startup failed with ${errorName}. Review the detailed browser/device diagnostics below.`
          : "Camera startup failed for an unknown browser/device reason.",
      };
  }
}

async function queryCameraPermissionState(): Promise<CameraPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unsupported";
  try {
    const result = await navigator.permissions.query({ name: "camera" as PermissionName });
    return result.state;
  } catch {
    return "unsupported";
  }
}

async function inspectVideoInputs(permissionState: CameraPermissionState): Promise<{
  enumerateDevicesAvailable: boolean;
  videoInputCount?: number | undefined;
  rearCameraState: RearCameraState;
}> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return { enumerateDevicesAvailable: false, rearCameraState: "unknown" };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === "videoinput");
    const labelledRearCamera = videoInputs.some((device) => /rear|back|environment/i.test(device.label));
    return {
      enumerateDevicesAvailable: true,
      videoInputCount: videoInputs.length,
      rearCameraState:
        videoInputs.length === 0
          ? "not_detected"
          : labelledRearCamera
            ? "available"
            : permissionState === "granted"
              ? "unknown"
              : "unknown_until_permission",
    };
  } catch {
    return { enumerateDevicesAvailable: true, rearCameraState: "unknown" };
  }
}

export async function collectCameraPpgDiagnostics(
  error?: unknown,
  selectedFacingMode?: string,
): Promise<CameraPpgDiagnostics> {
  const permissionState = await queryCameraPermissionState();
  const inputs = await inspectVideoInputs(permissionState);
  const errorName = cameraErrorName(error);
  const classified = classifyCameraAccessError(errorName, permissionState);
  const secureContext = typeof window !== "undefined" ? window.isSecureContext : false;
  const topLevelContext = typeof window !== "undefined" ? window.top === window.self : false;
  const visibilityState = typeof document !== "undefined" ? document.visibilityState : "unknown";

  let likelyCause = classified.likelyCause;
  if (!secureContext) likelyCause = "Camera APIs require a secure HTTPS context; this page is not running in one.";
  else if (!topLevelContext) likelyCause = "Camera access may be restricted because the console is running inside an embedded frame.";
  else if (!isCameraPpgSupported()) likelyCause = "This browser does not expose navigator.mediaDevices.getUserMedia().";
  else if (inputs.videoInputCount === 0) likelyCause = "No video-input camera is visible to the browser.";

  return {
    checkedAt: new Date().toISOString(),
    ...(errorName ? { errorName } : {}),
    ...(cameraErrorMessage(error) ? { errorMessage: cameraErrorMessage(error) } : {}),
    permissionState,
    secureContext,
    topLevelContext,
    visibilityState,
    cameraApiAvailable: isCameraPpgSupported(),
    enumerateDevicesAvailable: inputs.enumerateDevicesAvailable,
    ...(inputs.videoInputCount !== undefined ? { videoInputCount: inputs.videoInputCount } : {}),
    rearCameraState: selectedFacingMode === "environment" ? "available" : inputs.rearCameraState,
    ...(selectedFacingMode ? { selectedFacingMode } : {}),
    cameraBusyLikely: classified.cameraBusyLikely,
    likelyCause,
  };
}

export function isCameraPpgSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export class BrowserCameraPpgAdapter implements DeviceAdapter {
  private readonly onPreview?: ((state: CameraPpgPreviewState) => void) | undefined;
  private readonly now: () => number;
  private media?: MediaStream | undefined;
  private video?: HTMLVideoElement | undefined;
  private videoHost?: HTMLDivElement | undefined;
  private canvas?: HTMLCanvasElement | undefined;
  private connected = false;
  private cursor?: AdapterSyncCursor;
  private lastDataAt?: string;

  constructor(options: CameraPpgAdapterOptions = {}) {
    this.onPreview = options.onPreview;
    this.now = options.now ?? (() => Date.now());
  }

  descriptor(): AdapterDescriptor {
    return DESCRIPTOR;
  }

  async *discover(): AsyncIterable<DiscoveredSource> {
    if (!isCameraPpgSupported()) throw new Error("Camera access is not supported by this browser");
    yield SOURCE;
  }

  async connect(options: AdapterConnectOptions): Promise<void> {
    if (options.sourceId !== SOURCE.sourceId) throw new Error("Unknown camera PPG source");
    if (!isCameraPpgSupported()) throw new Error("Camera access is not supported by this browser");
    const preflightDiagnostics = await collectCameraPpgDiagnostics();
    this.onPreview?.({
      phase: "requesting_permission",
      waveform: [],
      signalQuality: 0,
      contactQuality: 0,
      message: "Requesting camera access from the browser…",
      diagnostics: preflightDiagnostics,
    });
    try {
      this.media = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      const videoTrack = this.media.getVideoTracks()[0];
      const selectedFacingMode = videoTrack?.getSettings?.().facingMode;
      if (videoTrack) {
        const capabilities = videoTrack.getCapabilities?.() as MediaTrackCapabilities & { torch?: boolean };
        if (capabilities?.torch) {
          await videoTrack
            .applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] })
            .catch(() => undefined);
        }
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("muted", "true");
      video.srcObject = this.media;

      // WebKit/iOS is more reliable when the capture element participates in the DOM.
      // Keep it visually hidden; the dashboard renders only derived signal quality/waveform.
      const host = document.createElement("div");
      host.setAttribute("data-mitochondria-camera-ppg", "capture-host");
      host.style.position = "fixed";
      host.style.width = "1px";
      host.style.height = "1px";
      host.style.opacity = "0";
      host.style.pointerEvents = "none";
      host.style.overflow = "hidden";
      host.style.left = "-10px";
      host.style.bottom = "0";
      host.appendChild(video);
      document.body.appendChild(host);
      this.videoHost = host;

      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => reject(new Error("Camera started but did not become ready")), 8000);
          video.addEventListener("loadedmetadata", () => { window.clearTimeout(timeout); resolve(); }, { once: true });
          video.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("Camera video stream failed to initialize")); }, { once: true });
        });
      }
      await video.play();
      this.video = video;
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 40;
      this.canvas = canvas;
      this.connected = true;
      const diagnostics = await collectCameraPpgDiagnostics(undefined, selectedFacingMode);
      this.onPreview?.({
        phase: "acquiring",
        waveform: [],
        signalQuality: 0,
        contactQuality: 0,
        message: "Cover the rear camera with a fingertip and keep still for several seconds.",
        diagnostics,
      });
    } catch (error) {
      stopMediaStream(this.media);
      this.media = undefined;
      this.videoHost?.remove();
      this.videoHost = undefined;
      this.video = undefined;
      this.connected = false;
      const message = error instanceof Error ? error.message : "Camera permission or camera start failed";
      const diagnostics = await collectCameraPpgDiagnostics(error);
      this.onPreview?.({
        phase: "error",
        waveform: [],
        signalQuality: 0,
        contactQuality: 0,
        message,
        diagnostics,
      });
      throw new Error(`Camera PPG unavailable: ${diagnostics.errorName ?? "UnknownError"}: ${message}`);
    }
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    if (sourceId !== SOURCE.sourceId) throw new Error("Unknown camera PPG source");
    return {
      sourceId,
      metrics: [{ metricCode: "phys.heart_rate", modes: ["stream"], sourceUnit: "bpm" }],
      supportsResumeCursor: false,
      supportsClockMetadata: true,
    };
  }

  async *stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem> {
    if (!this.connected || options.sourceId !== SOURCE.sourceId) throw new Error("Camera PPG source is not connected");
    const video = this.video;
    const canvas = this.canvas;
    if (!video || !canvas) throw new Error("Camera PPG capture surface unavailable");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Camera PPG pixel processing is unavailable");

    const samples: TimedPpgSample[] = [];
    let lastEstimateAt = 0;
    let lastEmittedBpm: number | undefined;
    while (!options.signal?.aborted) {
      const capturedAt = this.now();
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let red = 0;
        let green = 0;
        let blue = 0;
        const count = pixels.length / 4;
        for (let index = 0; index < pixels.length; index += 4) {
          red += pixels[index] ?? 0;
          green += pixels[index + 1] ?? 0;
          blue += pixels[index + 2] ?? 0;
        }
        const avgRed = red / count;
        const avgGreen = green / count;
        const avgBlue = blue / count;
        samples.push({
          atMs: capturedAt,
          value: avgRed,
          red: avgRed,
          green: avgGreen,
          blue: avgBlue,
        });
        const cutoff = capturedAt - 12_000;
        while ((samples[0]?.atMs ?? capturedAt) < cutoff) samples.shift();

        if (capturedAt - lastEstimateAt >= 900) {
          lastEstimateAt = capturedAt;
          const estimate = estimatePpgHeartRate(samples);
          const preview: CameraPpgPreviewState = {
            phase: estimate ? "measuring" : "acquiring",
            waveform: normalizePpgWaveform(samples),
            signalQuality: estimate?.signalQuality ?? 0,
            contactQuality: estimate?.contactQuality ?? 0,
            ...(estimate ? { bpm: estimate.bpm } : {}),
            ...(!estimate ? { message: "Hold a fingertip steadily over the rear camera while the signal settles." } : {}),
          };
          this.onPreview?.(preview);
          if (estimate && (lastEmittedBpm !== estimate.bpm || !this.lastDataAt || capturedAt - Date.parse(this.lastDataAt) >= 1500)) {
            lastEmittedBpm = estimate.bpm;
            const observedAt = new Date(capturedAt).toISOString();
            this.lastDataAt = observedAt;
            const cursorValue = `${capturedAt}:${estimate.bpm}`;
            this.cursor = { sourceId: SOURCE.sourceId, value: cursorValue, capturedAt: observedAt };
            yield {
              kind: "observation",
              packet: {
                packetId: `camera-ppg-heart-rate:${cursorValue}`,
                sourceId: SOURCE.sourceId,
                metricCode: "phys.heart_rate",
                observedAt,
                value: { number: estimate.bpm },
                unit: "bpm",
                quality: previewQuality(estimate.confidence),
                context: {
                  tags: [
                    "source:phone-camera-ppg",
                    `camera-ppg:signal-quality:${estimate.signalQuality.toFixed(2)}`,
                    `camera-ppg:contact-quality:${estimate.contactQuality.toFixed(2)}`,
                    "not-ecg",
                  ],
                },
                clock: { sourceTimestamp: observedAt, receivedAt: observedAt },
                cursor: cursorValue,
              },
            };
          }
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 65));
    }
  }

  quality(item: AdapterStreamItem): DataQuality {
    return item.kind === "observation" ? item.packet.quality : DEFAULT_QUALITY;
  }

  normalize(
    item: AdapterStreamItem,
    context: AdapterNormalizationContext,
  ): CanonicalObservationDraft | RawSignalChunk {
    if (item.kind !== "observation") throw new Error("Camera PPG adapter only emits scalar heart-rate observations");
    return {
      id: item.packet.packetId,
      mission: { missionId: context.missionId, crewMemberId: context.crewMemberId },
      source: sourceRefFromAdapter(DESCRIPTOR, SOURCE),
      metricCode: item.packet.metricCode,
      value: item.packet.value,
      ...(item.packet.unit ? { unit: item.packet.unit } : {}),
      observedAt: item.packet.observedAt,
      status: "final",
      quality: item.packet.quality,
      provenance: {
        kind: "raw",
        capturedAt: item.packet.clock.receivedAt,
        ingestionId: context.ingestionId,
        inputObservationIds: [],
      },
      classification: context.classification,
      tags: ["adapter:camera-ppg", "device:phone-camera", "measurement:pulse-estimate", "not-ecg"],
      context: item.packet.context ?? { tags: [] },
    };
  }

  async disconnect(sourceId: string): Promise<void> {
    if (sourceId !== SOURCE.sourceId) throw new Error("Unknown camera PPG source");
    stopMediaStream(this.media);
    this.media = undefined;
    this.videoHost?.remove();
    this.videoHost = undefined;
    this.video = undefined;
    this.canvas = undefined;
    this.connected = false;
    this.onPreview?.({ phase: "idle", waveform: [], signalQuality: 0, contactQuality: 0 });
  }

  async syncCursor(sourceId: string): Promise<AdapterSyncCursor | undefined> {
    if (sourceId !== SOURCE.sourceId) throw new Error("Unknown camera PPG source");
    return this.cursor;
  }

  async health(sourceId?: string): Promise<AdapterHealth> {
    return {
      adapterId: DESCRIPTOR.id,
      ...(sourceId ? { sourceId } : {}),
      state: this.connected ? "connected" : "disconnected",
      checkedAt: new Date(this.now()).toISOString(),
      ...(this.lastDataAt ? { lastDataAt: this.lastDataAt } : {}),
    };
  }
}
