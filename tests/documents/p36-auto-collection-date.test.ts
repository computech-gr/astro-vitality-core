import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { explicitSharedCollectionTimestamp, prefillSharedCollectionDate } from "@/domain/medical-document/hybrid-extraction";

describe("P36.2 shared collection timestamp", () => {
  it("reads the actual Challenge 02 PDF header as a single explicit UTC collection instant", async () => {
    const bytes = readFileSync("fixtures/synthetic/p36/P36_CHALLENGE_02_ORIGINAL.pdf");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
    const doc = await task.promise;
    try {
      const content = await (await doc.getPage(1)).getTextContent();
      const text = content.items.filter((item): item is typeof item & {str:string} => "str" in item).map(item => item.str).join(" ");
      expect(explicitSharedCollectionTimestamp(text)).toBe("2026-10-14T07:35:00Z");
    } finally { await task.destroy(); }
  });
  it("refuses missing, multiple or invalid collection dates", () => {
    expect(explicitSharedCollectionTimestamp("REPORT ISSUED 15 October 2026 COLLECTION TIME 07:35 UTC")).toBeNull();
    expect(explicitSharedCollectionTimestamp("COLLECTION DATE 31 February 2026 COLLECTION TIME 07:35 UTC")).toBeNull();
    expect(explicitSharedCollectionTimestamp("COLLECTION DATE 14 October 2026 COLLECTION TIME 07:35 UTC COLLECTION TIME 08:00 UTC")).toBeNull();
    expect(explicitSharedCollectionTimestamp("COLLECTION DATE 14 October 2026 COLLECTION TIME 07:35 UTC")).toBe("2026-10-14T07:35:00Z");
  });
});


describe("P36.3 date propagation to AI review rows", () => {
  const shared = "2026-10-14T07:35:00Z";
  const row = (id: string, value: number) => ({
    id, variableId: id, value, unit: "10^9/L", observedAt: "", sourceLabel: "lab.pdf",
    specimen: "", assayMethod: "", notes: "AI-assisted", selected: false,
    reviewRequired: true, provenance: "ai" as const,
  });
  const suggestion = (id: string, value: number, overrides: Record<string, unknown> = {}) => ({
    catalogId: id, value, reportedUnit: "10^9/L", observedAt: null,
    dateKind: "unknown" as const, uncertainty: [], reasons: ["Observation date requires manual confirmation"],
    status: "held" as const, reportedAnalyte: id, sourcePage: 1, evidenceSnippet: "lab evidence", ...overrides,
  });
  it("prefills all five unknown-date suggestions without depending on AI dateKind", () => {
    const ids = ["IMM-001", "IMM-002", "IMM-003", "IMM-007", "IMM-006"];
    const values = [6.7, 3.8, 2.2, 2.4, 1.73];
    const rows = ids.map((id, i) => row(id, values[i]!));
    const suggestions = ids.map((id, i) => suggestion(id, values[i]!));
    const result = prefillSharedCollectionDate(rows, suggestions, shared);
    expect(result.map(r => r.observedAt)).toEqual(Array(5).fill(shared));
    expect(result.every(r => !r.selected && r.reviewRequired)).toBe(true);
    expect(rows.every(r => !r.observedAt)).toBe(true);
  });
  it("refuses ambiguity, conflicts, saved rows and uncertainty", () => {
    const base = row("IMM-001", 6.7);
    expect(prefillSharedCollectionDate([base], [suggestion("IMM-001", 6.7)], null)[0]!.observedAt).toBe("");
    expect(prefillSharedCollectionDate([base], [suggestion("IMM-001", 6.7, {observedAt: "2026-10-15T07:35:00Z"})], shared)[0]!.observedAt).toBe("");
    expect(prefillSharedCollectionDate([base], [suggestion("IMM-001", 6.7, {uncertainty: ["specimen unclear"]})], shared)[0]!.observedAt).toBe("");
    expect(prefillSharedCollectionDate([{...base, saved: true}], [suggestion("IMM-001", 6.7)], shared)[0]!.observedAt).toBe("");
    expect(prefillSharedCollectionDate([base], [suggestion("IMM-001", 6.7), suggestion("IMM-001", 6.7)], shared)[0]!.observedAt).toBe("");
  });
});
