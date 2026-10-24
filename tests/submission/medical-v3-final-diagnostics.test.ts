import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

describe("final release evidence boundaries", () => {
  test("deterministic mission-day-127 artifact matches its existing sealed digest and byte count", () => {
    const bytes = readFileSync("data/release/mission-day-127.synthetic.json");
    expect(bytes.byteLength).toBe(868801);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("6997feae355887f1e1e56b5f0c533f5d365a67b5f89e765b1006c22d6153df8c");
  });

  test("release artifact contains only synthetic measurement records", () => {
    const artifact = JSON.parse(readFileSync("data/release/mission-day-127.synthetic.json", "utf8"));
    expect(artifact.syntheticOnly).toBe(true);
    expect(artifact.scenario).toBe("mission_day_127_fatigue_recovery");
    const measurements = artifact.dataset.events.filter((event: { kind: string }) => event.kind === "measurement");
    expect(measurements.length).toBeGreaterThan(0);
    for (const event of measurements) {
      expect(event.measurement.classification).toBe("synthetic");
      expect(event.measurement.tags).toContain("synthetic:true");
    }
  });

  test("diagnostics return actual owner evidence errors and remain blocked", () => {
    const result = spawnSync(process.execPath, ["scripts/medical-v3-release-diagnostics.mjs", "--json"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    expect(result.status).toBe(1);
    const summary = JSON.parse(result.stdout);
    expect(summary.complete).toBe(false);
    expect(summary.checks.find((row: { id: string }) => row.id === "restore").reason).toContain("Private restore evidence JSON path required as first argument");
    expect(summary.checks.find((row: { id: string }) => row.id === "owner-risk").reason).toContain("Private owner-risk acknowledgement path required");
    expect(summary.checks.find((row: { id: string }) => row.id === "submission").reason).toContain("P20-RULES-001: pending_external");
  });
});