import { describe, expect, it } from "bun:test";
import {
  filterTrendObservations,
  SYNTHETIC_TREND_SERIES,
} from "@/domain/companion/daily-companion";

describe("P47 interactive multi-biomarker trends", () => {
  const item = (id: string, day: string, sourceId: string) =>
    ({
      id,
      observedAt: day,
      sourceId,
      value: 70,
      unit: "bpm",
      metricCode: "hr",
      quality: "good",
    }) as Parameters<typeof filterTrendObservations>[0][number];
  const rows = [
    item("a", "2026-10-01T00:00:00Z", "one"),
    item("b", "2026-10-25T00:00:00Z", "two"),
    item("c", "2026-10-30T00:00:00Z", "one"),
  ];
  it("filters by exact source and latest-observation-relative time", () => {
    expect(filterTrendObservations(rows, "7", "all").map((o) => o.id)).toEqual(["b", "c"]);
    expect(filterTrendObservations(rows, "7", "one").map((o) => o.id)).toEqual(["c"]);
    expect(filterTrendObservations(rows, "all", "one").map((o) => o.id)).toEqual(["a", "c"]);
  });
  it("keeps all synthetic series separate and clearly defined", () => {
    expect(Object.keys(SYNTHETIC_TREND_SERIES)).toEqual(["heart", "hrv", "sleep"]);
    for (const s of Object.values(SYNTHETIC_TREND_SERIES)) expect(s.values).toHaveLength(5);
  });
});

describe("P47 filter edge cases", () => {
  it("returns no rows for empty input and drops non-finite values or timestamps", () => {
    expect(filterTrendObservations([], "7", "all")).toEqual([]);
    const bad = [
      { id: "n", observedAt: "2026-10-01T00:00:00Z", sourceId: "s", value: Number.NaN },
      { id: "t", observedAt: "not-a-date", sourceId: "s", value: 70 },
      { id: "ok", observedAt: "2026-10-02T00:00:00Z", sourceId: "s", value: 70 },
    ] as unknown as Parameters<typeof filterTrendObservations>[0];
    expect(filterTrendObservations(bad, "all", "all").map((o) => o.id)).toEqual(["ok"]);
  });
  it("keeps original values and units without conversion", () => {
    const one = [
      { id: "x", observedAt: "2026-10-02T00:00:00Z", sourceId: "s", value: 7.25, unit: "hours" },
    ] as unknown as Parameters<typeof filterTrendObservations>[0];
    expect(filterTrendObservations(one, "30", "s")[0]).toMatchObject({
      value: 7.25,
      unit: "hours",
    });
  });
  it("labels each synthetic series with its unit", () => {
    expect(SYNTHETIC_TREND_SERIES.heart.unit).toBe("bpm");
    expect(SYNTHETIC_TREND_SERIES.hrv.unit).toBe("ms");
    expect(SYNTHETIC_TREND_SERIES.sleep.unit).toBe("hours");
  });
});
