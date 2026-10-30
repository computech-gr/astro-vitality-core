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
