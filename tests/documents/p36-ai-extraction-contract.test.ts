import { describe, expect, it } from "bun:test";
import { validateExtractionEnvelope } from "@/domain/medical-document/ai-extraction-contract";
import { IMMUNE_MEASUREMENT_PROFILE as immune, CARDIOVASCULAR_MEASUREMENT_PROFILE as cardio } from "@/domain/health-measurements/profiles";

const base = {
  schemaVersion: "p36.1",
  provider: "test",
  model: "test-model",
  warnings: [],
};
const row = {
  catalogId: "IMM-001",
  reportedAnalyte: "Total leukocytes / WBC",
  value: 6.7,
  reportedUnit: "10^9/L",
  observedAt: null,
  dateKind: "unknown",
  sourcePage: 1,
  evidenceSnippet: "6.7 x10^9/L Total leukocytes / WBC",
  uncertainty: [],
};

describe("P36 AI extraction contract validation", () => {
  it("accepts a clean row as unchecked review candidate", () => {
    const { rows, errors } = validateExtractionEnvelope({ ...base, suggestions: [row] }, immune, 1);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    // No observation date → always requires manual confirmation, never auto-verified.
    expect(rows[0]!.status).toBe("held");
    expect(rows[0]!.reasons.join(" ")).toContain("manual confirmation");
  });
  it("rejects non-object and wrong schema version", () => {
    expect(validateExtractionEnvelope(null, immune, 1).errors).toEqual(["AI response is not an object"]);
    expect(validateExtractionEnvelope({ ...base, schemaVersion: "p36.0", suggestions: [] }, immune, 1).errors[0]).toContain("Invalid extraction schema");
  });
  it("rejects more than 150 suggestions", () => {
    const { errors } = validateExtractionEnvelope({ ...base, suggestions: Array(151).fill(row) }, immune, 1);
    expect(errors[0]).toContain("row limit");
  });
  it("holds unknown catalog IDs and never maps them", () => {
    const { rows } = validateExtractionEnvelope({ ...base, suggestions: [{ ...row, catalogId: "IMM-999" }] }, immune, 1);
    expect(rows[0]!.status).toBe("held");
    expect(rows[0]!.reasons.join(" ")).toContain("not in selected domain");
  });
  it("holds catalog unit mismatches without conversion (cardiovascular bound units)", () => {
    const cvRow = { ...row, catalogId: "cv-001", reportedUnit: "beats/min" };
    const { rows } = validateExtractionEnvelope({ ...base, suggestions: [cvRow] }, cardio, 1);
    expect(rows[0]!.status).toBe("held");
    expect(rows[0]!.reasons.join(" ")).toContain("expected bpm");
  });
  it("holds invalid or non-UTC observation timestamps", () => {
    const { rows } = validateExtractionEnvelope({ ...base, suggestions: [{ ...row, observedAt: "14 October 2026 07:35", dateKind: "observation" }] }, immune, 1);
    expect(rows[0]!.status).toBe("held");
    expect(rows[0]!.reasons.join(" ")).toContain("Invalid UTC observation timestamp");
  });
  it("collection dates are held for manual confirmation, never promoted", () => {
    const { rows } = validateExtractionEnvelope({ ...base, suggestions: [{ ...row, observedAt: "2026-10-14T07:35:00Z", dateKind: "collection" }] }, immune, 1);
    expect(rows[0]!.status).toBe("held");
    expect(rows[0]!.reasons.join(" ")).toContain("manual confirmation");
  });
  it("any AI uncertainty holds the row", () => {
    const { rows } = validateExtractionEnvelope({ ...base, suggestions: [{ ...row, uncertainty: ["unit unclear"] }] }, immune, 1);
    expect(rows[0]!.status).toBe("held");
    expect(rows[0]!.reasons.join(" ")).toContain("uncertainty");
  });
  it("rejects out-of-range pages and oversized evidence", () => {
    const badPage = validateExtractionEnvelope({ ...base, suggestions: [{ ...row, sourcePage: 3 }] }, immune, 1);
    expect(badPage.errors[0]).toContain("invalid fields");
    const badSnippet = validateExtractionEnvelope({ ...base, suggestions: [{ ...row, evidenceSnippet: "ab" }] }, immune, 1);
    expect(badSnippet.errors[0]).toContain("invalid fields");
  });
  it("rejects non-finite values", () => {
    const { errors } = validateExtractionEnvelope({ ...base, suggestions: [{ ...row, value: Number.NaN }] }, immune, 1);
    expect(errors[0]).toContain("invalid fields");
  });
});
