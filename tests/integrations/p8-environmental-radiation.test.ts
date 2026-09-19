import { describe, expect, test } from "bun:test";
import { ingestAdapterItem, type AdapterStreamItem } from "../../src/integrations/device-adapters";
import {
  EnvironmentalTelemetryAdapter,
  RadiationDosimeterAdapter,
  type EnvironmentalTelemetryClient,
  type RadiationDosimeterClient,
} from "../../src/integrations/environmental-telemetry";

const context = {
  missionId: "mission-synthetic-001",
  crewMemberId: "crew-synthetic-001",
  classification: "synthetic" as const,
  ingestionId: "p8-ingestion-001",
};

function environmentClient(): EnvironmentalTelemetryClient {
  return {
    async source() {
      return {
        sourceId: "habitat:gateway-001",
        displayName: "Synthetic Habitat Gateway",
        transport: "mqtt",
        manufacturer: "Test Habitat Systems",
        model: "ECLSS-SIM",
      };
    },
    async availableMetricCodes() {
      return [
        "environment.co2",
        "environment.oxygen_fraction",
        "environment.cabin_pressure",
        "environment.temperature",
        "environment.relative_humidity",
        "environment.noise_exposure",
        "environment.light_exposure",
        "environment.carbon_monoxide",
        "environment.unreviewed-voc-score",
      ];
    },
    async *records() {
      yield {
        id: "env-001",
        metricCode: "environment.co2",
        observedAt: "2026-09-19T15:00:00Z",
        value: 1250,
        unit: "ppm",
        compartment: "habitat-a",
        location: "sleep-station",
        cursor: "env-cursor-001",
      };
      yield {
        id: "env-002",
        metricCode: "environment.cabin_pressure",
        observedAt: "2026-09-19T15:00:01Z",
        value: 101.3,
        unit: "kPa",
        compartment: "habitat-a",
      };
    },
    async health() {
      return { available: true };
    },
  };
}

function radiationClient(): RadiationDosimeterClient {
  return {
    async source() {
      return {
        sourceId: "dosimeter:crew-001",
        displayName: "Synthetic Personal Dosimeter",
        manufacturer: "Test Radiation Systems",
        model: "RAD-SIM",
      };
    },
    async availableMetricCodes() {
      return [
        "radiation.absorbed_dose",
        "radiation.dose_equivalent",
        "radiation.dose_rate",
        "radiation.proprietary-risk-score",
      ];
    },
    async *records() {
      yield {
        id: "rad-001",
        metricCode: "radiation.absorbed_dose",
        observedAt: "2026-09-19T15:01:00Z",
        value: 0.42,
        unit: "mGy",
        detectorType: "silicon",
        radiationField: "mixed-field",
        location: "personal-badge",
        cursor: "rad-cursor-001",
      };
      yield {
        id: "rad-002",
        metricCode: "radiation.dose_equivalent",
        observedAt: "2026-09-19T15:01:01Z",
        value: 0.91,
        unit: "mSv",
        detectorType: "silicon",
        radiationField: "mixed-field",
        location: "personal-badge",
      };
    },
    async health() {
      return { available: true };
    },
  };
}

async function firstSource(adapter: { discover(): AsyncIterable<{ sourceId: string }> }) {
  for await (const source of adapter.discover()) return source;
  throw new Error("Adapter discovered no source");
}

async function allItems(
  adapter: { stream(options: { sourceId: string }): AsyncIterable<AdapterStreamItem> },
  sourceId: string,
) {
  const items: AdapterStreamItem[] = [];
  for await (const item of adapter.stream({ sourceId })) items.push(item);
  return items;
}

describe("P8 environmental and radiation telemetry", () => {
  test("habitat telemetry exposes only reviewed canonical environmental metrics", async () => {
    const adapter = new EnvironmentalTelemetryAdapter({ client: environmentClient() });
    const source = await firstSource(adapter);
    const capabilities = await adapter.capabilities(source.sourceId);
    expect(capabilities.metrics.map((item) => item.metricCode)).not.toContain(
      "environment.unreviewed-voc-score",
    );
    expect(capabilities.metrics.map((item) => item.metricCode)).toContain("environment.co2");
  });

  test("environment observations preserve compartment/location context and enter P4 canonical ingestion", async () => {
    const adapter = new EnvironmentalTelemetryAdapter({ client: environmentClient() });
    const source = await firstSource(adapter);
    await adapter.connect({ sourceId: source.sourceId });
    const [item] = await allItems(adapter, source.sourceId);
    expect(item).toBeDefined();
    if (!item) return;
    const result = ingestAdapterItem(adapter, item, context);
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind !== "observation") return;
    expect(result.value.observation.metric.code).toBe("environment.co2");
    expect(result.value.observation.source.sourceType).toBe("environment");
    expect(result.value.context.tags).toContain("compartment:habitat-a");
    expect(result.value.context.tags).toContain("location:sleep-station");
    expect((await adapter.syncCursor(source.sourceId))?.value).toBe("env-cursor-001");
  });

  test("radiation adapter keeps absorbed dose and dose equivalent as distinct quantities", async () => {
    const adapter = new RadiationDosimeterAdapter({ client: radiationClient() });
    const source = await firstSource(adapter);
    await adapter.connect({ sourceId: source.sourceId });
    const items = await allItems(adapter, source.sourceId);
    expect(items).toHaveLength(2);

    const results = items.map((item, index) =>
      ingestAdapterItem(adapter, item, {
        ...context,
        ingestionId: `p8-radiation-${index}`,
      }),
    );
    expect(results.every((result) => result.ok)).toBe(true);
    const observations = results
      .filter((result) => result.ok && result.kind === "observation")
      .map((result) => (result.ok && result.kind === "observation" ? result.value.observation : null))
      .filter(Boolean);
    expect(observations.map((observation) => observation?.metric.code)).toEqual([
      "radiation.absorbed_dose",
      "radiation.dose_equivalent",
    ]);
    expect(observations.map((observation) => observation?.metric.unit)).toEqual(["mGy", "mSv"]);
  });

  test("environment and radiation adapters preserve fail-closed metric filtering and contain no credentials", async () => {
    const environment = new EnvironmentalTelemetryAdapter({ client: environmentClient() });
    const radiation = new RadiationDosimeterAdapter({ client: radiationClient() });
    const envSource = await firstSource(environment);
    const radSource = await firstSource(radiation);
    const envCodes = (await environment.capabilities(envSource.sourceId)).metrics.map(
      (metric) => metric.metricCode,
    );
    const radCodes = (await radiation.capabilities(radSource.sourceId)).metrics.map(
      (metric) => metric.metricCode,
    );
    expect(envCodes).not.toContain("environment.unreviewed-voc-score");
    expect(radCodes).not.toContain("radiation.proprietary-risk-score");
    expect(JSON.stringify(environment)).not.toContain("token");
    expect(JSON.stringify(radiation)).not.toContain("secret");
  });
});
