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
import type { CanonicalObservationDraft, DataQuality, RawSignalChunk } from "../../domain";
import {
  GOOD_WEARABLE_QUALITY,
  adapterHealth,
  packetCursor,
  wearableObservationDraft,
} from "./common";

const HEART_RATE_SERVICE = "heart_rate";
const HEART_RATE_MEASUREMENT = "heart_rate_measurement";

type BluetoothValueEvent = Event & { target: EventTarget & { value?: DataView | null } };

interface BluetoothCharacteristicLike extends EventTarget {
  startNotifications(): Promise<BluetoothCharacteristicLike>;
  stopNotifications(): Promise<BluetoothCharacteristicLike>;
  value?: DataView | null;
}
interface BluetoothServiceLike {
  getCharacteristic(characteristic: string): Promise<BluetoothCharacteristicLike>;
}
interface BluetoothServerLike {
  connected: boolean;
  getPrimaryService(service: string): Promise<BluetoothServiceLike>;
  disconnect(): void;
}
interface BluetoothGattLike {
  connected: boolean;
  connect(): Promise<BluetoothServerLike>;
  disconnect(): void;
}
interface BluetoothDeviceLike {
  id: string;
  name?: string | null;
  gatt?: BluetoothGattLike;
}
interface BluetoothRequestLike {
  requestDevice(options: { filters: { services: string[] }[]; optionalServices?: string[] }): Promise<BluetoothDeviceLike>;
}

export interface HeartRateBluetoothGateway {
  requestHeartRateDevice(): Promise<BluetoothDeviceLike>;
  now(): string;
}

export class BrowserHeartRateBluetoothGateway implements HeartRateBluetoothGateway {
  async requestHeartRateDevice(): Promise<BluetoothDeviceLike> {
    const bluetooth = (navigator as Navigator & { bluetooth?: BluetoothRequestLike }).bluetooth;
    if (!bluetooth) throw new Error("Web Bluetooth is unavailable in this browser/runtime");
    return bluetooth.requestDevice({ filters: [{ services: [HEART_RATE_SERVICE] }] });
  }
  now(): string {
    return new Date().toISOString();
  }
}

export function parseHeartRateMeasurement(value: DataView): number {
  if (value.byteLength < 2) throw new Error("Heart-rate measurement is too short");
  const flags = value.getUint8(0);
  const isUint16 = (flags & 0x01) !== 0;
  if (isUint16) {
    if (value.byteLength < 3) throw new Error("16-bit heart-rate measurement is too short");
    return value.getUint16(1, true);
  }
  return value.getUint8(1);
}

function waitForAbort(signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise(() => undefined);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

/** Direct Web Bluetooth adapter for the standard Bluetooth Heart Rate Service. */
export class WebBluetoothHeartRateAdapter implements DeviceAdapter {
  private device?: BluetoothDeviceLike;
  private source?: DiscoveredSource;
  private server?: BluetoothServerLike;
  private characteristic?: BluetoothCharacteristicLike;
  private cursor?: AdapterSyncCursor;
  private connected = false;

  constructor(private readonly gateway: HeartRateBluetoothGateway = new BrowserHeartRateBluetoothGateway()) {}

  descriptor(): AdapterDescriptor {
    return {
      id: "org.mitochondria.web-bluetooth-heart-rate",
      version: "1.0.0",
      displayName: "Web Bluetooth Heart Rate",
      transport: "ble",
    };
  }

  async *discover(): AsyncIterable<DiscoveredSource> {
    const device = await this.gateway.requestHeartRateDevice();
    this.device = device;
    this.source = {
      sourceId: `ble:${device.id}`,
      displayName: device.name || "Bluetooth heart-rate sensor",
      transport: "ble",
      ...(device.name ? { model: device.name } : {}),
    };
    yield this.source;
  }

  async connect(options: AdapterConnectOptions): Promise<void> {
    if (!this.device || !this.source || options.sourceId !== this.source.sourceId)
      throw new Error("Bluetooth source must be discovered before connection");
    if (!this.device.gatt) throw new Error("Selected Bluetooth device has no GATT server");
    this.server = await this.device.gatt.connect();
    const service = await this.server.getPrimaryService(HEART_RATE_SERVICE);
    this.characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
    await this.characteristic.startNotifications();
    this.connected = true;
  }

  async capabilities(sourceId: string): Promise<AdapterCapabilities> {
    this.requireSource(sourceId);
    return {
      sourceId,
      metrics: [{ metricCode: "phys.heart_rate", modes: ["stream"], sourceUnit: "bpm" }],
      supportsResumeCursor: false,
      supportsClockMetadata: true,
    };
  }

  async *stream(options: AdapterStreamOptions): AsyncIterable<AdapterStreamItem> {
    this.requireConnected(options.sourceId);
    const characteristic = this.characteristic;
    if (!characteristic) throw new Error("Heart-rate characteristic unavailable");

    const queue: AdapterStreamItem[] = [];
    let wake: (() => void) | undefined;
    const listener = (event: Event) => {
      const value = (event as BluetoothValueEvent).target.value ?? characteristic.value;
      if (!value) return;
      const receivedAt = this.gateway.now();
      const bpm = parseHeartRateMeasurement(value);
      const cursorValue = `${receivedAt}:${bpm}`;
      const packet: AdapterStreamItem = {
        kind: "observation",
        packet: {
          packetId: `ble-heart-rate:${cursorValue}`,
          sourceId: options.sourceId,
          metricCode: "phys.heart_rate",
          observedAt: receivedAt,
          value: { number: bpm },
          unit: "bpm",
          quality: GOOD_WEARABLE_QUALITY,
          clock: { sourceTimestamp: receivedAt, receivedAt },
          cursor: cursorValue,
        },
      };
      const nextCursor = packetCursor(options.sourceId, packet.packet);
      if (nextCursor) this.cursor = nextCursor;
      queue.push(packet);
      wake?.();
      wake = undefined;
    };
    characteristic.addEventListener("characteristicvaluechanged", listener);
    try {
      while (!options.signal?.aborted) {
        if (!queue.length) await Promise.race([new Promise<void>((resolve) => (wake = resolve)), waitForAbort(options.signal)]);
        while (queue.length) yield queue.shift()!;
      }
    } finally {
      characteristic.removeEventListener("characteristicvaluechanged", listener);
    }
  }

  quality(item: AdapterStreamItem): DataQuality {
    return item.packet.quality;
  }

  normalize(
    item: AdapterStreamItem,
    context: AdapterNormalizationContext,
  ): CanonicalObservationDraft | RawSignalChunk {
    if (!this.source) throw new Error("Bluetooth source unavailable");
    return wearableObservationDraft(this.descriptor(), this.source, item, context, ["adapter:ble", "wearable:heart-rate"]);
  }

  async disconnect(sourceId: string): Promise<void> {
    this.requireSource(sourceId);
    if (this.characteristic) {
      try {
        await this.characteristic.stopNotifications();
      } catch {
        // Device may already be disconnected; GATT disconnect remains authoritative.
      }
    }
    this.device?.gatt?.disconnect();
    this.server?.disconnect();
    this.connected = false;
  }

  async syncCursor(sourceId: string): Promise<AdapterSyncCursor | undefined> {
    this.requireSource(sourceId);
    return this.cursor;
  }

  async health(sourceId?: string): Promise<AdapterHealth> {
    return adapterHealth(
      this.descriptor(),
      this.connected,
      this.gateway.now(),
      sourceId,
      this.cursor?.capturedAt,
    );
  }

  private requireSource(sourceId: string): void {
    if (!this.source || this.source.sourceId !== sourceId) throw new Error("Unknown Bluetooth heart-rate source");
  }

  private requireConnected(sourceId: string): void {
    this.requireSource(sourceId);
    if (!this.connected) throw new Error("Bluetooth heart-rate source is not connected");
  }
}
