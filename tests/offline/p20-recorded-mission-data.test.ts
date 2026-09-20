import { describe, expect, test } from "bun:test";

import type { OfflineEventRecord } from "@/domain/offline-mission";
import { localRecordedRow } from "@/infrastructure/mission-records";

const observation: OfflineEventRecord = {
  id: "obs-camera-1",
  kind: "observation",
  mission: { missionId: "mission-local-p9", crewMemberId: "crew-local-p9" },
  eventTimestamp: "2026-09-20T19:46:44.000Z",
  createdAt: "2026-09-20T19:46:44.100Z",
  sourceId: "camera:ppg:browser",
  sourceVersion: "1.0.0",
  sourcePriority: 80,
  classification: "medical_sensitive",
  payload: {
    metric: { code: "phys.heart_rate", displayName: "Heart rate", unit: "{beats}/min" },
    value: { number: 63 },
    quality: { level: "poor", artifactFlags: ["camera_ppg_low_quality"] },
  },
};

describe("P20 recorded mission data", () => {
  test("projects a local encrypted observation into a human-readable history row", () => {
    const row = localRecordedRow(observation, "pending");
    expect(row.location).toBe("local");
    expect(row.metricCode).toBe("phys.heart_rate");
    expect(row.metricLabel).toBe("Heart rate");
    expect(row.value).toBe("63");
    expect(row.unit).toBe("{beats}/min");
    expect(row.quality).toBe("poor");
    expect(row.syncState).toBe("pending");
  });

  test("never changes medical-sensitive classification while presenting local history", () => {
    expect(localRecordedRow(observation).classification).toBe("medical_sensitive");
  });
});
