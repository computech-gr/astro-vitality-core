import { describe, expect, test } from "bun:test";
import { ReferenceDeviceAdapter, ingestAdapterItem, validateAdapterCapabilityMetric } from "../../src/integrations/device-adapters";

describe("P5 universal device adapter SDK", () => {
  test("exposes discovery, connection, capability, stream, cursor and health lifecycle", async () => {
    const adapter = new ReferenceDeviceAdapter();
    const discovered = [];
    for await (const source of adapter.discover()) discovered.push(source);
    expect(discovered).toHaveLength(1);
    expect((await adapter.health()).state).toBe("disconnected");
    await adapter.connect({ sourceId: discovered[0].sourceId });
    expect((await adapter.health(discovered[0].sourceId)).state).toBe("connected");
    const capabilities = await adapter.capabilities(discovered[0].sourceId);
    expect(capabilities.supportsResumeCursor).toBe(true);
    expect(capabilities.supportsClockMetadata).toBe(true);
    expect(capabilities.metrics.every((capability) => validateAdapterCapabilityMetric(capability.metricCode).valid)).toBe(true);
  });

  test("normalizes adapter packets through the governed P4 ingestion boundary", async () => {
    const adapter = new ReferenceDeviceAdapter();
    await adapter.connect({ sourceId: "reference-device-001" });
    for await (const item of adapter.stream({ sourceId: "reference-device-001" })) {
      const result = ingestAdapterItem(adapter, item, { missionId: "mission-synthetic-001", crewMemberId: "crew-synthetic-001", classification: "synthetic", ingestionId: "p5-ingestion-001" });
      expect(result.ok).toBe(true);
      if (!result.ok || result.kind !== "observation") return;
      expect(result.value.observation.metric.code).toBe("phys.heart_rate");
      expect(result.value.observation.metric.unit).toBe("{beats}/min");
      expect(result.value.observation.source.adapterId).toBe("org.mitochondria.reference");
      expect(result.value.observation.provenance.sourceUnit).toBe("bpm");
      expect(result.cursor).toBe("cursor-001");
    }
    expect((await adapter.syncCursor("reference-device-001"))?.value).toBe("cursor-001");
  });

  test("fails closed when an adapter advertises a metric outside the canonical registry", () => {
    expect(validateAdapterCapabilityMetric("vendor.magic_stress_score").valid).toBe(false);
  });
});
