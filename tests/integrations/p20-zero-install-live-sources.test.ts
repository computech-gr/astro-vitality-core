import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { estimatePpgHeartRate } from "../../src/integrations/browser-sensors/ppg-algorithm";
import { classifyCameraAccessError } from "../../src/integrations/browser-sensors/camera-ppg";
import { BrowserDeviceMotionAdapter } from "../../src/integrations/browser-sensors/device-motion";

const root = process.cwd();

describe("P20 zero-install cross-platform live sources", () => {
  test("camera PPG estimator recovers a deterministic pulse without inventing a value from insufficient data", () => {
    const bpm = 72;
    const hz = bpm / 60;
    const start = 1_800_000_000_000;
    const samples = Array.from({ length: 180 }, (_, index) => {
      const atMs = start + index * 66;
      const t = (atMs - start) / 1000;
      return {
        atMs,
        value: 170 + 5 * Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(2 * Math.PI * 0.2 * t),
        red: 180,
        green: 72,
        blue: 60,
      };
    });
    const estimate = estimatePpgHeartRate(samples);
    expect(estimate).toBeDefined();
    expect(Math.abs((estimate?.bpm ?? 0) - bpm)).toBeLessThanOrEqual(2);
    expect(estimate?.confidence).toBeGreaterThan(0.42);
    expect(estimatePpgHeartRate(samples.slice(0, 20))).toBeUndefined();
  });

  test("phone motion normalizes to the governed tri-axial acceleration raw-series metric", () => {
    const adapter = new BrowserDeviceMotionAdapter();
    const normalized = adapter.normalize(
      {
        kind: "series",
        packet: {
          packetId: "motion-test",
          sourceId: "device-motion:browser",
          metricCode: "activity.acceleration_3axis",
          startedAt: "2026-09-20T12:00:00Z",
          endedAt: "2026-09-20T12:00:00Z",
          samplingRateHz: 10,
          channelNames: ["x", "y", "z"],
          unit: "g",
          samples: [[0.1, 0.2, 0.9]],
          quality: { level: "good", score: 0.9, artifactFlags: [] },
          clock: { receivedAt: "2026-09-20T12:00:00Z" },
        },
      },
      {
        missionId: "mission-test",
        crewMemberId: "crew-test",
        classification: "medical_sensitive",
        ingestionId: "motion-test-ingest",
      },
    );
    expect(normalized.metricCode).toBe("activity.acceleration_3axis");
    expect("samples" in normalized && normalized.samples[0]).toEqual([0.1, 0.2, 0.9]);
  });

  test("judge-facing live console is zero-install and the old Android APK path is removed", () => {
    const live = readFileSync(join(root, "src/components/live-dashboard.tsx"), "utf8");
    expect(live).toContain("Phone Camera PPG");
    expect(live).toContain("Phone Motion Sensors");
    expect(live).toContain("Direct Bluetooth Sensor");
    expect(live).not.toContain("Connect Health Connect");
    expect(existsSync(join(root, "android-companion"))).toBe(false);
    expect(existsSync(join(root, ".github/workflows/android-companion.yml"))).toBe(false);
  });
  test("camera diagnostics distinguish browser permission, missing camera and likely camera-busy failures", () => {
    expect(classifyCameraAccessError("NotAllowedError", "denied").likelyCause).toContain("permission is denied");
    expect(classifyCameraAccessError("NotFoundError", "granted").likelyCause).toContain("No usable video-input camera");
    const busy = classifyCameraAccessError("NotReadableError", "granted");
    expect(busy.cameraBusyLikely).toBe(true);
    expect(busy.likelyCause).toContain("Another app may be using the camera");
  });

  test("security policy allows same-origin camera capture while keeping microphone denied", () => {
    const headers = readFileSync(join(root, "src/security/headers.ts"), "utf8");
    expect(headers).toContain("camera=(self)");
    expect(headers).toContain("microphone=()");
    expect(headers).not.toContain("camera=()");
  });

  test("live dashboard exposes concrete camera permission and runtime diagnostics", () => {
    const live = readFileSync(join(root, "src/components/live-dashboard.tsx"), "utf8");
    expect(live).toContain("Camera diagnostics");
    expect(live).toContain("Permission state");
    expect(live).toContain("Secure HTTPS context");
    expect(live).toContain("Rear camera");
    expect(live).toContain("Camera busy / OS lock");
    expect(live).toContain("Permissions Policy (camera)");
    expect(live).toContain("Acquisition stage");
    expect(live).toContain("Likely cause:");
  });

});
