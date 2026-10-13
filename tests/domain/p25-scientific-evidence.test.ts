import { describe, expect, it } from "bun:test";
import { buildScientificEvidenceReport, type ScientificObservation } from "../../src/domain/health-intelligence/live-evidence";
const mission = { missionId: "mission-a", crewMemberId: "crew-a" };
const sample = (id: string, value: number, at: string, changes: Partial<ScientificObservation> = {}): ScientificObservation => ({
  id, missionId: "mission-a", crewMemberId: "crew-a", metricCode: "sleep.duration", value, unit: "h", observedAt: at,
  quality: "good", sourceId: "manual", location: "local", classification: "synthetic", ...changes,
});
const run = (observations: ScientificObservation[]) => buildScientificEvidenceReport({ mission, observations, generatedAt: "2026-10-13T00:00:00Z" });
describe("P25 scientific evidence privacy and non-causality", () => {
  it("isolates mission and crew and deduplicates cloud/local records", () => {
    const a = sample("1", 7, "2026-10-01T00:00:00Z");
    const result = run([a, {...a, location: "cloud"}, sample("2", 8, "2026-10-02T00:00:00Z", {crewMemberId: "other"}), sample("3", 6, "2026-10-03T00:00:00Z", {missionId: "other"})]);
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].location).toBe("cloud");
  });
  it("does not infer baseline from a single reading or a correlation", () => {
    const result = run([sample("1", 5, "2026-10-01T00:00:00Z")]);
    expect(result.metrics[0].baseline).toBeUndefined();
    expect(result.patterns.every((p) => p.status !== "evidence_present_not_interpreted")).toBe(true);
  });
  it("does not treat poor-quality readings as valid pattern coverage", () => {
    const result = run([sample("1", 5, "2026-10-01T00:00:00Z", {quality: "poor"})]);
    expect(result.metrics[0].status).toBe("quality_blocked");
    expect(result.patterns[0].observedRoles).toHaveLength(0);
  });
  it("keeps baseline descriptive and excludes the latest observation", () => {
    const result = run([
      sample("1", 7, "2026-10-01T00:00:00Z"), sample("2", 8, "2026-10-02T00:00:00Z"),
      sample("3", 9, "2026-10-03T00:00:00Z"), sample("4", 20, "2026-10-04T00:00:00Z"),
    ]);
    expect(result.metrics[0].baseline?.mean).toBe(8);
    expect(result.metrics[0].baseline?.status).toBe("descriptive_only");
    expect(result.metrics[0].changeFromPrevious).toBe(11);
  });
  it("never enables research-only patterns", () => {
    expect(run([]).patterns.filter((p) => p.status === "research_only").length).toBeGreaterThan(0);
  });
});
