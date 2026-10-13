import { describe, expect, test } from "bun:test";
import { NASA_EVIDENCE_INDEX, evidenceReadiness, evidenceSummary, validateEvidenceIndex } from "../../src/domain/nasa-evidence/registry";

describe("P30 NASA reference governance", () => {
  test("all indexed sources have valid provenance and safe origins", () => expect(validateEvidenceIndex()).toEqual([]));
  test("source registry is not a live NASA data connection", () => {expect(NASA_EVIDENCE_INDEX.liveNasaData).toBe(false); expect(NASA_EVIDENCE_INDEX.operationalActivation).toBe(false);});
  test("no source is independently validated by default", () => {expect(evidenceSummary().reviewed).toBe(0); expect(NASA_EVIDENCE_INDEX.sources.every(s => evidenceReadiness(s) !== "independently_reviewed")).toBe(true);});
  test("source URLs are distinct, HTTPS and NASA-hosted", () => expect(new Set(NASA_EVIDENCE_INDEX.sources.map(s => s.url)).size).toBe(NASA_EVIDENCE_INDEX.sources.length));
});
