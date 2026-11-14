import { describe, expect, test } from "bun:test";

import { HEALTH_DOMAINS } from "@/domain/health-domains/registry";
import {
  SHARED_CONTEXT_PARAMETERS,
  buildSharedMissionContext,
  projectSharedContextIntoDomain,
  validateSharedContextReading,
  type SharedContextReadingInput,
} from "@/domain/mission-context/shared-context";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const base = (over: Partial<SharedContextReadingInput>): SharedContextReadingInput => ({
  id: "r1",
  parameterId: "cabin_co2",
  value: 2600,
  unit: "ppm",
  observedAt: "2026-11-15T07:55:00Z",
  sourceId: "gw",
  quality: "good",
  simulated: true,
  ...over,
});

describe("P68 shared mission context", () => {
  test("exactly the four parameters, reusing existing telemetry/catalog codes", () => {
    expect(SHARED_CONTEXT_PARAMETERS.map((p) => p.id)).toEqual([
      "radiation_dose_rate",
      "cabin_co2",
      "cabin_air_temperature",
      "body_temperature",
    ]);
    expect(SHARED_CONTEXT_PARAMETERS.map((p) => p.metricCode)).toEqual([
      "radiation.dose_rate",
      "environment.co2",
      "environment.temperature",
      null,
    ]);
    const contracts = readFileSync(join(root, "src/integrations/environmental-telemetry/contracts.ts"), "utf8");
    for (const code of ["radiation.dose_rate", "environment.co2", "environment.temperature"]) expect(contracts).toContain(code);
  });

  test("dose rate accepts only rate units and refuses cumulative dose", () => {
    expect(validateSharedContextReading(base({ parameterId: "radiation_dose_rate", unit: "uSv/h", value: 17.2 })).ok).toBe(true);
    const mSv = validateSharedContextReading(base({ parameterId: "radiation_dose_rate", unit: "mSv", value: 0.4 }));
    expect(mSv.ok).toBe(false);
    if (!mSv.ok) expect(mSv.issues.join(" ")).toContain("cumulative dose");
    expect(validateSharedContextReading(base({ parameterId: "radiation_dose_rate", unit: "mSv/h", value: 1 })).ok).toBe(false);
  });

  test("temperatures accept Celsius notations only and never convert Fahrenheit", () => {
    for (const unit of ["°C", "Cel", "degC"])
      expect(validateSharedContextReading(base({ parameterId: "cabin_air_temperature", unit, value: 22.4 })).ok).toBe(true);
    expect(validateSharedContextReading(base({ parameterId: "cabin_air_temperature", unit: "°F", value: 72 })).ok).toBe(false);
    expect(validateSharedContextReading(base({ parameterId: "cabin_air_temperature", unit: "C", value: 22 })).ok).toBe(false);
    expect(validateSharedContextReading(base({ unit: "%", value: 0.26 })).ok).toBe(false);
  });

  test("body temperature requires a site; only core sites map to phys.core_temperature", () => {
    expect(validateSharedContextReading(base({ parameterId: "body_temperature", unit: "°C", value: 36.7 })).ok).toBe(false);
    const oral = validateSharedContextReading(base({ parameterId: "body_temperature", unit: "°C", value: 36.7, measurementSite: "oral" }));
    expect(oral.ok && oral.reading.metricCode).toBe(null);
    const skin = validateSharedContextReading(base({ parameterId: "body_temperature", unit: "°C", value: 33.1, measurementSite: "skin" }));
    expect(skin.ok && skin.reading.metricCode).toBe(null);
    const core = validateSharedContextReading(base({ parameterId: "body_temperature", unit: "°C", value: 37.0, measurementSite: "rectal" }));
    expect(core.ok && core.reading.metricCode).toBe("phys.core_temperature");
    expect(validateSharedContextReading(base({ measurementSite: "oral" })).ok).toBe(false);
  });

  test("skin readings are explicitly labelled as not core temperature", () => {
    const ctx = buildSharedMissionContext([
      base({ id: "s", parameterId: "body_temperature", unit: "°C", value: 33.1, measurementSite: "skin" }),
    ]);
    const body = ctx.entries.find((e) => e.parameter.id === "body_temperature")!;
    expect(body.notes).toContain("Skin temperature is not core temperature.");
  });

  test("missing and unavailable parameters stay explicit; nothing is invented", () => {
    const ctx = buildSharedMissionContext([
      base({ id: "u", parameterId: "cabin_air_temperature", unit: "°C", value: null, availability: "unavailable" }),
    ]);
    const statuses = Object.fromEntries(ctx.entries.map((e) => [e.parameter.id, e.status]));
    expect(statuses).toEqual({
      radiation_dose_rate: "missing",
      cabin_co2: "missing",
      cabin_air_temperature: "unavailable",
      body_temperature: "missing",
    });
    expect(ctx.entries.every((e) => e.status !== "missing" || e.reading === null)).toBe(true);
    expect(validateSharedContextReading(base({ value: 1, availability: "unavailable" })).ok).toBe(false);
  });

  test("provenance is preserved and the latest reading wins", () => {
    const ctx = buildSharedMissionContext([
      base({ id: "old", value: 2400, observedAt: "2026-11-15T06:00:00Z" }),
      base({ id: "new", value: 2600, observedAt: "2026-11-15T07:55:00Z", sourceLabel: "Cabin gateway", quality: "degraded" }),
    ]);
    const co2 = ctx.entries.find((e) => e.parameter.id === "cabin_co2")!;
    expect(co2.reading).toMatchObject({ id: "new", value: 2600, unit: "ppm", sourceId: "gw", sourceLabel: "Cabin gateway", quality: "degraded", simulated: true, observedAt: "2026-11-15T07:55:00Z" });
    expect(co2.notes).toContain("Simulated reading — not live telemetry.");
  });

  test("same parameter/time/source is stored once; conflicting duplicates are rejected", () => {
    const same = buildSharedMissionContext([base({ id: "a" }), base({ id: "b" }), base({ id: "c", observedAt: "2026-11-15T07:55:00.000Z" })]);
    expect(same.duplicatesCollapsed).toBe(2);
    expect(same.rejected).toEqual([]);
    const conflict = buildSharedMissionContext([base({ id: "a" }), base({ id: "b", value: 9999 })]);
    expect(conflict.entries.find((e) => e.parameter.id === "cabin_co2")!.status).toBe("missing");
    expect(conflict.rejected.length).toBe(1);
  });

  test("stale is reported only with an explicit freshness window", () => {
    const r = [base({})];
    expect(buildSharedMissionContext(r).entries[1]!.status).toBe("available");
    expect(buildSharedMissionContext(r, { now: "2026-11-15T09:00:00Z", freshnessMs: { cabin_co2: 60_000 } }).entries[1]!.status).toBe("stale");
  });

  test("identical read-only projection into all four domains, never interpreted", () => {
    const ctx = buildSharedMissionContext([base({})]);
    const projections = HEALTH_DOMAINS.map((d) => projectSharedContextIntoDomain(ctx, d.id));
    expect(projections.map((p) => p.domainId)).toEqual(["bone", "immune", "cardiovascular", "behavioral"]);
    for (const p of projections) {
      expect(p.entries).toBe(ctx.entries);
      expect(p.interpretation).toBe("context_only_no_interpretation");
      expect(JSON.stringify(p)).not.toMatch(/approved|diagnos|clearance/i);
    }
    expect(Object.isFrozen(ctx.entries)).toBe(true);
  });

  test("all four health-domain pages render the panel through the shared measurement entry", () => {
    const entry = readFileSync(join(root, "src/components/bone-health-entry.tsx"), "utf8");
    expect(entry).toContain("<SharedMissionContextPanel domainId={profile.domainId} />");
    const workspace = readFileSync(join(root, "src/components/health-domain-workspace.tsx"), "utf8");
    expect(workspace).toContain("<HealthMeasurementEntry");
  });
});
