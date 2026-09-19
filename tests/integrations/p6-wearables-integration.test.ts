import { describe, expect, test } from "bun:test";
import { ingestAdapterItem, type AdapterStreamItem } from "../../src/integrations/device-adapters";
import {
  VendorCloudWearableAdapter,
  WebBluetoothHeartRateAdapter,
  createHealthConnectAdapter,
  createHealthKitAdapter,
  parseHeartRateMeasurement,
  type HeartRateBluetoothGateway,
  type MobileHealthBridge,
  type VendorWearableClient,
} from "../../src/integrations/wearables";

const context = {
  missionId: "mission-synthetic-001",
  crewMemberId: "crew-synthetic-001",
  classification: "synthetic" as const,
  ingestionId: "p6-ingestion-001",
};

class FakeCharacteristic extends EventTarget {
  value?: DataView;
  async startNotifications() { return this; }
  async stopNotifications() { return this; }
  emit(bytes: number[]) {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

function fakeBleGateway(characteristic: FakeCharacteristic): HeartRateBluetoothGateway {
  const server = {
    connected: true,
    async getPrimaryService() {
      return { async getCharacteristic() { return characteristic; } };
    },
    disconnect() {},
  };
  return {
    async requestHeartRateDevice() {
      return {
        id: "ble-001",
        name: "Synthetic HR Strap",
        gatt: { connected: false, async connect() { return server; }, disconnect() {} },
      };
    },
    now: () => "2026-09-19T13:00:00Z",
  };
}

function bridge(recordId: string, value: number): MobileHealthBridge {
  return {
    async sourceId() { return `mobile:${recordId}`; },
    async displayName() { return "Synthetic Mobile Health Hub"; },
    async availableMetricCodes() { return ["phys.heart_rate", "vendor.unknown-score"]; },
    async *readRecords() {
      yield {
        recordId,
        metricCode: "phys.heart_rate",
        observedAt: "2026-09-19T13:00:00Z",
        value: { number: value },
        unit: "bpm",
        dataOrigin: "test-source",
      };
    },
    async cursor() { return `${recordId}:cursor`; },
    async health() { return { available: true }; },
  };
}

function vendorClient(): VendorWearableClient {
  return {
    async source() { return { sourceId: "vendor:001", displayName: "Synthetic Vendor Wearable", vendor: "Test Vendor" }; },
    async availableMetricCodes() { return ["phys.heart_rate", "vendor.proprietary-recovery-score"]; },
    async *records() {
      yield { id: "vendor-record-001", metricCode: "phys.heart_rate", observedAt: "2026-09-19T13:00:00Z", value: { number: 74 }, unit: "bpm", cursor: "vendor-cursor-001" };
    },
    async health() { return { available: true }; },
  };
}

async function firstItem(adapter: { stream(options: { sourceId: string }): AsyncIterable<AdapterStreamItem> }, sourceId: string) {
  for await (const item of adapter.stream({ sourceId })) return item;
  throw new Error("Adapter produced no data");
}

async function firstSource(adapter: { discover(): AsyncIterable<{ sourceId: string }> }) {
  for await (const source of adapter.discover()) return source;
  throw new Error("Adapter discovered no source");
}

describe("P6 wearables integration pack", () => {
  test("parses standard Bluetooth Heart Rate Measurement values", () => {
    expect(parseHeartRateMeasurement(new DataView(Uint8Array.from([0x00, 72]).buffer))).toBe(72);
    expect(parseHeartRateMeasurement(new DataView(Uint8Array.from([0x01, 0x2c, 0x01]).buffer))).toBe(300);
  });

  test("direct BLE, Health Connect, and vendor-cloud source classes feed the same P4 canonical metric", async () => {
    const characteristic = new FakeCharacteristic();
    const ble = new WebBluetoothHeartRateAdapter(fakeBleGateway(characteristic));
    const bleSource = await firstSource(ble);
    await ble.connect({ sourceId: bleSource.sourceId });
    const controller = new AbortController();
    const bleIterator = ble.stream({ sourceId: bleSource.sourceId, signal: controller.signal })[Symbol.asyncIterator]();
    const pending = bleIterator.next();
    characteristic.emit([0x00, 72]);
    const bleItem = (await pending).value!;
    controller.abort();

    const healthConnect = createHealthConnectAdapter(bridge("hc-record-001", 73));
    const hcSource = await firstSource(healthConnect);
    await healthConnect.connect({ sourceId: hcSource.sourceId });
    const hcItem = await firstItem(healthConnect, hcSource.sourceId);

    const vendor = new VendorCloudWearableAdapter({
      adapterId: "org.mitochondria.vendor-test",
      displayName: "Vendor Test Adapter",
      client: vendorClient(),
    });
    const vendorSource = await firstSource(vendor);
    await vendor.connect({ sourceId: vendorSource.sourceId });
    const vendorItem = await firstItem(vendor, vendorSource.sourceId);

    const results = [
      ingestAdapterItem(ble, bleItem, { ...context, ingestionId: "p6-ble" }),
      ingestAdapterItem(healthConnect, hcItem, { ...context, ingestionId: "p6-health-connect" }),
      ingestAdapterItem(vendor, vendorItem, { ...context, ingestionId: "p6-vendor" }),
    ];
    for (const result of results) {
      expect(result.ok).toBe(true);
      if (!result.ok || result.kind !== "observation") continue;
      expect(result.value.observation.metric.code).toBe("phys.heart_rate");
      expect(result.value.observation.metric.unit).toBe("{beats}/min");
    }
  });

  test("Health Connect and HealthKit bridges fail closed on non-canonical metrics", async () => {
    const healthConnect = createHealthConnectAdapter(bridge("hc-record-002", 71));
    const hcSource = await firstSource(healthConnect);
    const hcCapabilities = await healthConnect.capabilities(hcSource.sourceId);
    expect(hcCapabilities.metrics.map((item) => item.metricCode)).toEqual(["phys.heart_rate"]);

    const healthKit = createHealthKitAdapter(bridge("hk-record-001", 70));
    const hkSource = await firstSource(healthKit);
    const hkCapabilities = await healthKit.capabilities(hkSource.sourceId);
    expect(hkCapabilities.metrics.map((item) => item.metricCode)).toEqual(["phys.heart_rate"]);
  });

  test("vendor OAuth/API boundary keeps credentials outside the adapter and preserves resume cursor", async () => {
    const vendor = new VendorCloudWearableAdapter({
      adapterId: "org.mitochondria.vendor-test",
      displayName: "Vendor Test Adapter",
      client: vendorClient(),
    });
    const source = await firstSource(vendor);
    await vendor.connect({ sourceId: source.sourceId });
    await firstItem(vendor, source.sourceId);
    expect((await vendor.syncCursor(source.sourceId))?.value).toBe("vendor-cursor-001");
    expect(JSON.stringify(vendor)).not.toContain("token");
  });
});
