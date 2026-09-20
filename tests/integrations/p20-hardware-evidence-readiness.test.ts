import { afterEach, describe, expect, test } from "bun:test";
import {
  createAndroidHealthConnectJsBridge,
  createHealthConnectAdapter,
  isAndroidHealthConnectBridgeAvailable,
} from "../../src/integrations/wearables";
import { ingestAdapterItem } from "../../src/integrations/device-adapters";

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true, writable: true });
});

function installNativeBridge() {
  let cursor = "";
  const mockWindow = {
    setTimeout,
    clearTimeout,
    MitochondriaHealthConnect: {
      sourceId: () => "health-connect:samsung-health",
      displayName: () => "Samsung Health via Health Connect",
      availableMetricCodes: () => JSON.stringify(["phys.heart_rate", "vendor.proprietary-score"]),
      readRecords: () => {
        cursor = "1789905600000";
        return JSON.stringify({
          cursor,
          records: [{
            recordId: "hc-real-test:1",
            metricCode: "phys.heart_rate",
            observedAt: "2026-09-20T10:00:00Z",
            value: { number: 72 },
            unit: "bpm",
            dataOrigin: "com.sec.android.app.shealth",
          }],
        });
      },
      cursor: () => cursor,
      health: () => JSON.stringify({ available: true }),
    },
  };
  Object.defineProperty(globalThis, "window", { value: mockWindow, configurable: true, writable: true });
}

async function firstSource(adapter: { discover(): AsyncIterable<{ sourceId: string }> }) {
  for await (const source of adapter.discover()) return source;
  throw new Error("No source discovered");
}

describe("P20 Samsung/Health Connect hardware-evidence readiness", () => {
  test("fails closed in a regular browser runtime with no native Health Connect bridge", async () => {
    Object.defineProperty(globalThis, "window", { value: undefined, configurable: true, writable: true });
    expect(isAndroidHealthConnectBridgeAvailable()).toBe(false);
    expect((await createAndroidHealthConnectJsBridge().health()).available).toBe(false);
  });

  test("native Health Connect bridge feeds canonical heart rate as medical-sensitive data", async () => {
    installNativeBridge();
    expect(isAndroidHealthConnectBridgeAvailable()).toBe(true);
    const adapter = createHealthConnectAdapter(createAndroidHealthConnectJsBridge());
    const source = await firstSource(adapter);
    await adapter.connect({ sourceId: source.sourceId });
    const controller = new AbortController();
    const iterator = adapter.stream({ sourceId: source.sourceId, signal: controller.signal })[Symbol.asyncIterator]();
    const item = (await iterator.next()).value!;
    controller.abort();
    const result = ingestAdapterItem(adapter, item, {
      missionId: "mission-hardware-evidence",
      crewMemberId: "crew-hardware-evidence",
      classification: "medical_sensitive",
      ingestionId: "p20-hw-test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "observation") return;
    expect(result.value.observation.metric.code).toBe("phys.heart_rate");
    expect(result.value.observation.classification).toBe("medical_sensitive");
    expect(result.value.observation.tags).toContain("platform:android-health-connect");
    expect(result.value.context.tags).toContain("data-origin:com.sec.android.app.shealth");
  });
});
