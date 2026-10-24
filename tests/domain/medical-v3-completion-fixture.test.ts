import { describe, expect, test } from "bun:test";
import { classifyIntakeObservation } from "../../src/domain/health-domains/unified-intake-classification";

describe("synthetic v3 contract catalog stop", () => {
  test("the literal heart_rate bpm fixture remains unclassified rather than silently remapped", () => {
    const result = classifyIntakeObservation({ label: "heart_rate", unit: "bpm" });
    expect(result.status).toBe("unclassified");
    expect("metricId" in result).toBe(false);
  });
});