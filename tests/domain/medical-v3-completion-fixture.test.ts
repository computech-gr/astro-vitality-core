import { describe, expect, test } from "bun:test";
import { classifyIntakeObservation } from "../../src/domain/health-domains/unified-intake-classification";
import {
  canonicalSyntheticJson,
  syntheticSha256,
} from "../../src/domain/health-intelligence/synthetic-evidence";
import { createHash } from "node:crypto";

describe("synthetic v3 contract catalog stop", () => {
  test("the literal heart_rate bpm fixture remains unclassified rather than silently remapped", () => {
    const result = classifyIntakeObservation({ label: "heart_rate", unit: "bpm" });
    expect(result.status).toBe("unclassified");
    expect("metricId" in result).toBe(false);
  });
  test("owner-corrected HR maps exactly to cv-001 cardiovascular bpm without scientific approval", () => {
    expect(classifyIntakeObservation({ label: "HR", unit: "bpm" })).toEqual({
      status: "matched",
      metricId: "cv-001",
      domain: "cardiovascular",
      originalLabel: "HR",
      originalUnit: "bpm",
      reviewRequired: true,
    });
  });
  test("v2 canonical byte order and SHA-256 agree with independent Node hashing", async () => {
    const canonical = canonicalSyntheticJson({
      z: null,
      observations: [
        { value: "62", unit: "bpm", id: "synthetic-v3-hr-001", time: "2026-10-01T10:00:00Z" },
        { value: "66", unit: "bpm", id: "synthetic-v3-hr-002", time: "2026-10-02T10:00:00Z" },
      ],
      a: "synthetic",
    });
    expect(canonical).toBe(
      '{"a":"synthetic","observations":[{"id":"synthetic-v3-hr-001","time":"2026-10-01T10:00:00Z","unit":"bpm","value":"62"},{"id":"synthetic-v3-hr-002","time":"2026-10-02T10:00:00Z","unit":"bpm","value":"66"}],"z":null}',
    );
    expect(await syntheticSha256(canonical)).toBe(
      `sha256-${createHash("sha256").update(canonical).digest("hex")}`,
    );
  });
  test("canonical evidence rejects implicit undefined and numeric conversions", () => {
    expect(() => canonicalSyntheticJson({ value: 62 })).toThrow();
    expect(() => canonicalSyntheticJson({ value: undefined })).toThrow();
  });
});
