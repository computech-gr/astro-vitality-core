import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  COMPANION_ENVIRONMENTS,
  COMPANION_ROUTINE,
  chartGeometry,
  participation,
  qualityPresentation,
} from "@/domain/companion/daily-companion";
import type { ScientificObservation } from "@/domain/health-intelligence/live-evidence";

const obs = (id: string, observedAt: string, value: number): ScientificObservation => ({
  id, missionId: "M", crewMemberId: "C", metricCode: "cv.hr", value, unit: "bpm",
  observedAt, quality: "good", sourceId: "s", location: "local", classification: "synthetic",
});

describe("P45 daily health companion", () => {
  test("offers exactly the five mission environments", () => {
    expect(Object.keys(COMPANION_ENVIRONMENTS).sort()).toEqual(
      ["lunar", "planetary", "rover", "spacecraft", "station"],
    );
  });

  test("routine defers measurement cadence to the approved mission protocol", () => {
    expect(COMPANION_ROUTINE.find((r) => r.id === "measurements")?.cadence).toBe("Per approved mission protocol");
  });

  test("participation counts only known routine items, deduplicated", () => {
    expect(participation(["readiness", "readiness", "bogus"], 4)).toEqual({ done: 1, total: 4, percent: 25 });
    expect(participation([], 4).percent).toBe(0);
  });

  test("colors map to data quality, with poor and unknown neutral", () => {
    expect(qualityPresentation("good").tone).toBe("good");
    expect(qualityPresentation("degraded").tone).toBe("degraded");
    expect(qualityPresentation("poor").tone).toBe("neutral");
    expect(qualityPresentation("unknown").tone).toBe("neutral");
  });

  test("no chart for zero or one observation", () => {
    expect(chartGeometry([])).toBeNull();
    expect(chartGeometry([obs("a", "2026-10-01T00:00:00Z", 60)])).toBeNull();
  });

  test("chart is chronological, time-proportional and capped at 30 samples", () => {
    const g = chartGeometry([
      obs("b", "2026-10-03T00:00:00Z", 70),
      obs("a", "2026-10-01T00:00:00Z", 60),
      obs("c", "2026-10-02T00:00:00Z", 65),
    ])!;
    expect(g.points.map((p) => p.item.id)).toEqual(["a", "c", "b"]);
    expect(g.points.map((p) => p.x)).toEqual([48, 312, 576]);
    expect([g.min, g.max]).toEqual([60, 70]);
    const many = Array.from({ length: 35 }, (_, i) => obs(`o${i}`, new Date(Date.UTC(2026, 0, i + 1)).toISOString(), i));
    const capped = chartGeometry(many)!;
    expect(capped.points).toHaveLength(30);
    expect(capped.truncated).toBe(true);
    expect(capped.points[0]!.item.id).toBe("o5");
  });

  test("route is in the menu and marked non-indexable", () => {
    const shell = readFileSync("src/components/app-shell.tsx", "utf8");
    expect(shell).toContain('if (label === "Daily Health Companion") return "/mission/companion"');
    expect(readFileSync("src/infrastructure/seo.ts", "utf8")).toContain('"/mission/companion"');
  });

  test("companion never persists session state or writes to the backend", () => {
    const src = readFileSync("src/components/astronaut-daily-health-companion.tsx", "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|\.insert\(|\.upsert\(|\.rpc\(/);
  });
});
