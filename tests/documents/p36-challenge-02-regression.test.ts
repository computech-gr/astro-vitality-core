import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { reconstructGeometryLines, geometryLinesToText, type PdfTextItem } from "@/domain/bone-health/pdf-geometry";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import { validateExtractionEnvelope } from "@/domain/medical-document/ai-extraction-contract";
import { mergeAiSuggestions } from "@/domain/medical-document/hybrid-extraction";
import { needsAiAssistance } from "@/domain/medical-document/ai-extraction-policy";
import { IMMUNE_MEASUREMENT_PROFILE as profile } from "@/domain/health-measurements/profiles";

// P36: the exact owner-supplied Challenge 02 PDF, byte-preserved.
const FIXTURE = "fixtures/synthetic/p36/P36_CHALLENGE_02_ORIGINAL.pdf";
const SHA256 = "877dc53c59c3759441c03713b31d0758ecaf3f36e3f77a5b7b88cd4fb09ec4bd";

async function parseActualPdf() {
  const bytes = readFileSync(FIXTURE);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(SHA256);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useWorkerFetch: false });
  const doc = await task.promise;
  try {
    const items: PdfTextItem[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      for (const item of (await (await doc.getPage(i)).getTextContent()).items) {
        if (!("str" in item) || !item.str.trim()) continue;
        items.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, width: item.width ?? 0, height: item.height > 0 ? item.height : 10, page: i });
      }
    }
    const lines = reconstructGeometryLines(items);
    return { parsed: parseBoneCorrectedText(geometryLinesToText(lines), "P36_CHALLENGE_02_ORIGINAL.pdf", profile, lines.map(l => l.page)), pages: doc.numPages };
  } finally { await task.destroy(); }
}

// Expected synthetic immune values from the P36 contract.
const expected = [
  ["IMM-001", 6.7, "10^9/L"],
  ["IMM-002", 3.8, "10^9/L"],
  ["IMM-003", 2.2, "10^9/L"],
  ["IMM-007", 2.4, "mg/L"],
  ["IMM-006", 1.73, "ratio"],
];

// The validated provider outcome for this document (live-verified shape; the
// collection timestamp arrives as dateKind "collection", never "observation").
const providerEnvelope = {
  schemaVersion: "p36.1",
  provider: "lovable",
  model: "openai/gpt-6-astra",
  warnings: [],
  suggestions: [
    { catalogId: "IMM-001", reportedAnalyte: "Total leukocytes / WBC", value: 6.7, reportedUnit: "10^9/L", observedAt: null, dateKind: "collection", sourcePage: 1, evidenceSnippet: "6.7 x10^9/L Total leukocytes / WBC", uncertainty: [] },
    { catalogId: "IMM-002", reportedAnalyte: "Neutrophils, absolute", value: 3.8, reportedUnit: "10^9/L", observedAt: null, dateKind: "collection", sourcePage: 1, evidenceSnippet: "3.8 x10^9/L Neutrophils, absolute", uncertainty: [] },
    { catalogId: "IMM-003", reportedAnalyte: "Absolute lymphocyte count", value: 2.2, reportedUnit: "10^9/L", observedAt: null, dateKind: "collection", sourcePage: 1, evidenceSnippet: "2.2 x10^9/L Absolute lymphocyte count", uncertainty: [] },
    { catalogId: "IMM-007", reportedAnalyte: "hs-CRP (high sensitivity C reactive protein)", value: 2.4, reportedUnit: "mg/L", observedAt: null, dateKind: "collection", sourcePage: 1, evidenceSnippet: "Measured result: 2.4 mg/L", uncertainty: [] },
    { catalogId: "IMM-006", reportedAnalyte: "NLR — neutrophil to lymphocyte ratio", value: 1.73, reportedUnit: "ratio", observedAt: null, dateKind: "collection", sourcePage: 1, evidenceSnippet: "Calculated value: 1.73 (dimensionless ratio)", uncertainty: [] },
  ],
};

describe("P36 Challenge 02 actual PDF regression", () => {
  it("deterministic parser alone cannot resolve the adversarial layout, so AI assistance triggers", async () => {
    const { parsed, pages } = await parseActualPdf();
    expect(pages).toBe(1);
    // No catalog IDs, value-before-analyte layout: zero deterministic matches.
    expect(parsed.matches).toHaveLength(0);
    expect(needsAiAssistance({ matched: parsed.matches.length, held: parsed.held.length, rejected: parsed.errors.length })).toBe(true);
    // Reference intervals and instrument numbers never became measurements.
    expect(JSON.stringify(parsed.matches)).not.toContain("11.0");
  });
  it("validated AI suggestions merge to exactly the five expected unchecked rows", async () => {
    const { parsed, pages } = await parseActualPdf();
    const { rows, errors } = validateExtractionEnvelope(providerEnvelope, profile, pages);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(5);
    // Every row is held solely because the collection date is not an observation time.
    for (const row of rows) {
      expect(row.status).toBe("held");
      expect(row.reasons).toEqual(["Observation date requires manual confirmation"]);
    }
    // Missing-date holds are the normal review state: rows enter the review
    // table unchecked, exactly like deterministic rows without dates.
    const merge = mergeAiSuggestions(parsed.matches.map(m => ({ ...m, id: "local" })), rows, profile, "P36_CHALLENGE_02_ORIGINAL.pdf");
    expect(merge.heldMessages).toHaveLength(0);
    expect(merge.added.map(r => [r.variableId, r.value, r.unit])).toEqual(expected);
    for (const row of merge.added) {
      expect(row.selected).toBe(false);
      expect(row.provenance).toBe("ai");
      // Collection 2026-10-14 07:35 UTC is never silently the observation time.
      expect(row.observedAt).toBe("");
      expect(row.sourceLabel).toBe("P36_CHALLENGE_02_ORIGINAL.pdf");
    }
  });
});
