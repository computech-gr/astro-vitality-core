import { describe, expect, test } from "bun:test";
import type { ObservationEnvelope } from "../../src/domain";
import {
  createLiveDashboardState,
  deriveDashboardMetricView,
  ingestDashboardObservation,
  recordDashboardSelfCheck,
  setDashboardSourceState,
} from "../../src/app/live-dashboard";

function heartRateEnvelope(observedAt: string, value: number): ObservationEnvelope {
  return {
    observation: {
      id: `hr-${observedAt}`,
      mission: { missionId: "mission-p9", crewMemberId: "crew-p9" },
      source: { sourceId: "ble:hr-001", sourceType: "device", adapterId: "org.mitochondria.web-bluetooth-heart-rate" },
      metric: { code: "phys.heart_rate", displayName: "Heart rate", domain: "physiological", valueKind: "number", unit: "{beats}/min", unitSystem: "UCUM" },
      value: { number: value },
      observedAt,
      status: "final",
      quality: { level: "good", score: 0.98, artifactFlags: [] },
      provenance: { kind: "raw", capturedAt: observedAt, ingestionId: `ingest-${observedAt}`, inputObservationIds: [] },
      classification: "synthetic",
      tags: ["adapter:ble"],
    },
    metricDefinitionVersion: "1.1",
    interpretationTier: "operational",
    reviewStatus: "raw",
    context: { tags: ["adapter:ble"] },
  };
}

describe("P9 live dashboard state", () => {
  test("a connected fresh observation is live and becomes stale without inventing health meaning", () => {
    let state = createLiveDashboardState();
    state = setDashboardSourceState(state, { sourceId: "ble:hr-001", displayName: "HR Strap", transport: "ble", connection: "connected" }, "2026-09-19T18:00:00Z");
    state = ingestDashboardObservation(state, heartRateEnvelope("2026-09-19T18:00:00Z", 72), "2026-09-19T18:00:00Z");
    expect(deriveDashboardMetricView(state, "phys.heart_rate", "Heart rate", "2026-09-19T18:00:30Z").state).toBe("live");
    expect(deriveDashboardMetricView(state, "phys.heart_rate", "Heart rate", "2026-09-19T18:02:00Z").state).toBe("stale");
  });

  test("missing streams stay disconnected or waiting instead of receiving synthetic values", () => {
    let state = createLiveDashboardState();
    expect(deriveDashboardMetricView(state, "phys.spo2", "SpO2", "2026-09-19T18:00:00Z").state).toBe("disconnected");
    state = setDashboardSourceState(state, { sourceId: "ble:hr-001", displayName: "HR Strap", transport: "ble", connection: "connected" }, "2026-09-19T18:00:00Z");
    const waiting = deriveDashboardMetricView(state, "phys.spo2", "SpO2", "2026-09-19T18:00:00Z");
    expect(waiting.state).toBe("waiting");
    expect(waiting.value).toBeUndefined();
  });

  test("recent numeric observations form a bounded trend history with quality intact", () => {
    let state = createLiveDashboardState();
    state = setDashboardSourceState(state, { sourceId: "ble:hr-001", displayName: "HR Strap", transport: "ble", connection: "connected" }, "2026-09-19T18:00:00Z");
    state = ingestDashboardObservation(state, heartRateEnvelope("2026-09-19T18:00:00Z", 70), "2026-09-19T18:00:00Z");
    state = ingestDashboardObservation(state, heartRateEnvelope("2026-09-19T18:00:10Z", 73), "2026-09-19T18:00:10Z");
    const view = deriveDashboardMetricView(state, "phys.heart_rate", "Heart rate", "2026-09-19T18:00:20Z");
    expect(view.history).toEqual([70, 73]);
    expect(view.quality?.level).toBe("good");
  });

  test("simple self-check is stored as a non-diagnostic timeline event", () => {
    const state = recordDashboardSelfCheck(createLiveDashboardState(), { id: "check-1", recordedAt: "2026-09-19T18:00:00Z", state: "monitor", note: "Poor sleep" });
    expect(state.selfChecks[0]?.state).toBe("monitor");
    expect(state.timeline[0]?.kind).toBe("self_check");
    expect(JSON.stringify(state)).not.toContain("diagnosis");
  });
});
