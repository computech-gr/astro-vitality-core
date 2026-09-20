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

const DESCRIPTOR: AdapterDescriptor = {
  id: "org.mitochondria.browser-device-motion",
  version: "1.0.0",
  displayName: "Phone Motion Sensors",
  transport: "device_sensor",
};

const SOURCE: DiscoveredSource = {
  sourceId: "device-motion:browser",
  displayName: "Phone motion sensors",
  transport: "device_sensor",
  manufacturer: "browser",
  model: "accelerometer",
};

export interface MotionPreviewState {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  observedAt: string;
  quality: "good" | "degraded";
}

export interface DeviceMotionAdapterOptions {
  onPreview?: (state: MotionPreviewState) => void;
  now?: () => number;
}

type DeviceMotionPermissionConstructor = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

const STANDARD_GRAVITY = 9.80665;

export function isDeviceMotionSupported(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

export function deviceMotionPermissionMode(): "prompt" | "implicit" | "unsupported" {
  if (!isDeviceMotionSupported()) return "unsupported";
  const ctor = DeviceMotionEvent as DeviceMotionPermissionConstructor;
  return typeof ctor.requestPermission === "function" ? "prompt" : "implicit";
}

function finiteOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function qualityForMotion(hasAcceleration: boolean): DataQuality {
  return hasAcceleration
    ? { level: "good", score: 0.9, artifactFlags: [] }
    : { level: "degraded", score: 0.45, artifactFlags: ["motion_sensor_partial"] };
}

export class BrowserDeviceMotionAdapter implements DeviceAdapter {
  private readonly onPreview?: ((state: MotionPreviewState) => void) | undefined;
  private readonly now: () => number;
  private connected = false;
  private cursor?: AdapterSyncCursor;
  private lastDataAt?: string;

  constructor(options: DeviceMotionAdapterOptions = {}) {
    this.onPreview = options.onPreview;
    this.now = options.now ?? (() => Date.now());
  }

  descriptor(): AdapterDescriptor {
    return DESCRIPTOR;
  }

  async *discover(): AsyncIterable<DiscoveredSource> {
    if (!isDeviceMotionSupported()) throw new Error("Motion sensors are not exposed by this browser");
    yield SOURCE;
  }

  async connect(options: AdapterConnectOptions): Promise<void> {
    if (options.sourceId !== SOURCE.sourceId) throw new Error("Unknown device-motion source");
    if (!isDeviceMotionSupported()) throw new Error("Motion sensors are not exposed by this browser");
    const ctor = DeviceMotionEvent as DeviceMotionPermissionConstructor;
    if (typeof ctor.requestPermission === "function") {
      const permission = await ctor.requestPermission();
      if (permission !== "granted") throw new Error("Motion sensor permission was not granted");
    }
    this.connected = true;
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    if (sourceId !== SOURCE.sourceId) throw new Error("Unknown device-motion source");
    return {
      sourceId,
      metrics: [
        {
          metricCode: "activity.acceleration_3axis",
          modes: ["series"],
          sourceUnit: "g",
          samplingRateHz: 10,
          channels: ["x", "y", "z"],
        },
      ],
      supportsResumeCursor: false,
      supportsClockMetadata: true,
    };
  }

  async *stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem> {
    if (!this.connected || options.sourceId !== SOURCE.sourceId) throw new Error("Motion sensor source is not connected");
    const queue: AdapterStreamItem[] = [];
    let wake: (() => void) | undefined;
    let lastPreviewAt = 0;
    let lastEmittedAt = 0;

    const listener = (event: DeviceMotionEvent) => {
      const nowMs = this.now();
      if (nowMs - lastPreviewAt < 90) return;
      lastPreviewAt = nowMs;
      const primary = event.acceleration;
      const primaryHasValues = [primary?.x, primary?.y, primary?.z].some(
        (value) => typeof value === "number" && Number.isFinite(value),
      );
      const acceleration = primaryHasValues ? primary : event.accelerationIncludingGravity;
      const hasAcceleration = Boolean(acceleration);
      const x = finiteOrZero(acceleration?.x) / STANDARD_GRAVITY;
      const y = finiteOrZero(acceleration?.y) / STANDARD_GRAVITY;
      const z = finiteOrZero(acceleration?.z) / STANDARD_GRAVITY;
      const observedAt = new Date(nowMs).toISOString();
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const quality = qualityForMotion(hasAcceleration);
      this.onPreview?.({
        x,
        y,
        z,
        magnitude,
        observedAt,
        quality: quality.level === "good" ? "good" : "degraded",
      });
      // Keep the on-screen motion preview responsive (~10 Hz) without writing
      // a medical-sensitive offline record on every browser sensor event.
      if (nowMs - lastEmittedAt < 450) return;
      lastEmittedAt = nowMs;
      const cursorValue = `${nowMs}:${x.toFixed(4)}:${y.toFixed(4)}:${z.toFixed(4)}`;
      this.cursor = { sourceId: SOURCE.sourceId, value: cursorValue, capturedAt: observedAt };
      this.lastDataAt = observedAt;
      queue.push({
        kind: "series",
        packet: {
          packetId: `device-motion:${cursorValue}`,
          sourceId: SOURCE.sourceId,
          metricCode: "activity.acceleration_3axis",
          startedAt: observedAt,
          endedAt: observedAt,
          samplingRateHz: 10,
          channelNames: ["x", "y", "z"],
          unit: "g",
          samples: [[x, y, z]],
          quality,
          context: { tags: ["source:phone-motion", "artifact-context"] },
          clock: { sourceTimestamp: observedAt, receivedAt: observedAt },
          cursor: cursorValue,
        },
      });
      wake?.();
      wake = undefined;
    };

    window.addEventListener("devicemotion", listener);
    try {
      while (!options.signal?.aborted) {
        if (!queue.length) {
          await Promise.race([
            new Promise<void>((resolve) => (wake = resolve)),
            new Promise<void>((resolve) => {
              if (!options.signal) return;
              if (options.signal.aborted) resolve();
              else options.signal.addEventListener("abort", () => resolve(), { once: true });
            }),
          ]);
        }
        while (queue.length) yield queue.shift()!;
      }
    } finally {
      window.removeEventListener("devicemotion", listener);
    }
  }

  quality(item: AdapterStreamItem): DataQuality {
    return item.packet.quality;
  }

  normalize(
    item: AdapterStreamItem,
    context: AdapterNormalizationContext,
  ): CanonicalObservationDraft | RawSignalChunk {
    if (item.kind !== "series") throw new Error("Device motion adapter emits raw acceleration series only");
    return {
      id: item.packet.packetId,
      mission: { missionId: context.missionId, crewMemberId: context.crewMemberId },
      source: sourceRefFromAdapter(DESCRIPTOR, SOURCE),
      metricCode: item.packet.metricCode,
      startedAt: item.packet.startedAt,
      endedAt: item.packet.endedAt,
      samplingRateHz: item.packet.samplingRateHz,
      channelNames: item.packet.channelNames,
      unit: item.packet.unit,
      samples: item.packet.samples,
      quality: item.packet.quality,
      provenance: {
        kind: "raw",
        capturedAt: item.packet.clock.receivedAt,
        ingestionId: context.ingestionId,
        inputObservationIds: [],
      },
      classification: context.classification,
      context: item.packet.context ?? { tags: [] },
    };
  }

  async disconnect(sourceId: string): Promise<void> {
    if (sourceId !== SOURCE.sourceId) throw new Error("Unknown device-motion source");
    this.connected = false;
  }

  async syncCursor(sourceId: string): Promise<AdapterSyncCursor | undefined> {
    if (sourceId !== SOURCE.sourceId) throw new Error("Unknown device-motion source");
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
