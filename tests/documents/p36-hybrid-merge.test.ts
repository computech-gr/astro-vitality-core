import { describe, expect, it } from "bun:test";
import { mergeAiSuggestions, processBoneFileWithAi, type AiAssist } from "@/domain/medical-document/hybrid-extraction";
import { validateExtractionEnvelope, type CheckedSuggestion } from "@/domain/medical-document/ai-extraction-contract";
import { needsAiAssistance, aiExtractionRequestIssue } from "@/domain/medical-document/ai-extraction-policy";
import { IMMUNE_MEASUREMENT_PROFILE as profile } from "@/domain/health-measurements/profiles";
import type { ReviewRow } from "@/domain/bone-health/file-queue";

const localRow: ReviewRow = {
  id: "local-1", variableId: "IMM-001", value: 6.7, unit: "10^9/L", observedAt: "",
  sourceLabel: "report.pdf", specimen: "", assayMethod: "", notes: "", selected: false, reviewRequired: true,
};
const suggestion = (patch: Partial<CheckedSuggestion> = {}): CheckedSuggestion => ({
  catalogId: "IMM-002", reportedAnalyte: "Neutrophils, absolute", value: 3.8, reportedUnit: "10^9/L",
  observedAt: null, dateKind: "unknown", sourcePage: 1, evidenceSnippet: "3.8 x10^9/L Neutrophils, absolute",
  uncertainty: [], status: "review", reasons: [], ...patch,
});

describe("P36 hybrid merge", () => {
  it("adds AI rows unchecked with AI provenance and no invented date", () => {
    const merge = mergeAiSuggestions([localRow], [suggestion()], profile, "report.pdf");
    expect(merge.added).toHaveLength(1);
    const row = merge.added[0]!;
    expect(row.selected).toBe(false);
    expect(row.reviewRequired).toBe(true);
    expect(row.provenance).toBe("ai");
    expect(row.observedAt).toBe("");
    expect(row.sourceLabel).toBe("report.pdf");
    expect(row.notes).toContain("AI-assisted");
    expect(row.notes).toContain("page 1");
  });
  it("skips exact duplicates of deterministic rows", () => {
    const dup = suggestion({ catalogId: "IMM-001", value: 6.7, reportedUnit: "10^9/L" });
    const merge = mergeAiSuggestions([localRow], [dup], profile, "report.pdf");
    expect(merge.added).toHaveLength(0);
    expect(merge.duplicates).toBe(1);
  });
  it("holds conflicts with deterministic rows instead of overwriting", () => {
    const conflict = suggestion({ catalogId: "IMM-001", value: 9.9, reportedUnit: "10^9/L" });
    const merge = mergeAiSuggestions([localRow], [conflict], profile, "report.pdf");
    expect(merge.added).toHaveLength(0);
    expect(merge.heldMessages[0]).toContain("conflicts with a deterministic result");
    expect(localRow.value).toBe(6.7);
  });
  it("never promotes a collection timestamp to the observation date", () => {
    const collection = suggestion({ observedAt: "2026-10-14T07:35:00Z", dateKind: "collection" });
    const merge = mergeAiSuggestions([], [collection], profile, "report.pdf");
    expect(merge.added[0]!.observedAt).toBe("");
    expect(merge.added[0]!.notes).toContain("collection time 2026-10-14T07:35:00Z");
    expect(merge.added[0]!.notes).toContain("not a confirmed observation time");
  });
  it("prefills only explicit per-row observation timestamps", () => {
    const observed = suggestion({ observedAt: "2026-10-14T07:35:00Z", dateKind: "observation" });
    const merge = mergeAiSuggestions([], [observed], profile, "report.pdf");
    expect(merge.added[0]!.observedAt).toBe("2026-10-14T07:35:00Z");
  });
  it("held AI rows become visible held messages, never measurements", () => {
    const held = suggestion({ status: "held", reasons: ["Catalog ID is not in selected domain"] });
    const merge = mergeAiSuggestions([], [held], profile, "report.pdf");
    expect(merge.added).toHaveLength(0);
    expect(merge.heldMessages[0]).toContain("Held for manual review");
  });
});

describe("P36 assistance trigger policy", () => {
  it("triggers on empty, held or rejected local results only", () => {
    expect(needsAiAssistance({ matched: 0, held: 0, rejected: 0 })).toBe(true);
    expect(needsAiAssistance({ matched: 2, held: 1, rejected: 0 })).toBe(true);
    expect(needsAiAssistance({ matched: 2, held: 0, rejected: 1 })).toBe(true);
    expect(needsAiAssistance({ matched: 2, held: 0, rejected: 0 })).toBe(false);
  });
  it("bounds requests client-side", () => {
    const base = { missionId: "m", crewMemberId: "c", provenance: "synthetic" as const, domain: "immune" as const, text: "x", pageCount: 1, localSummary: { matched: 0, held: 0, rejected: 0 } };
    expect(aiExtractionRequestIssue(base)).toBeNull();
    expect(aiExtractionRequestIssue({ ...base, text: "" })).toContain("No extracted text");
    expect(aiExtractionRequestIssue({ ...base, text: "x".repeat(20001) })).toContain("exceeds");
    expect(aiExtractionRequestIssue({ ...base, pageCount: 13 })).toContain("Page count");
    expect(aiExtractionRequestIssue({ ...base, domain: "sleep" as never })).toContain("Unknown health domain");
  });
});

describe("P36 hybrid pipeline orchestration", () => {
  const csv = (rows: string) => new File([`variable,value,unit,observed_at,source,specimen,assay_method,notes\n${rows}`], "report.csv", { type: "text/csv" });
  it("does not call AI when local parsing is complete", async () => {
    let called = 0;
    const ai: AiAssist = async () => { called++; return { status: "unavailable", reason: "should not run" }; };
    const review = await processBoneFileWithAi(csv("IMM-001,6.7,10^9/L,2026-10-14T07:35:00Z,Demo Lab,,,"), new AbortController().signal, profile, ai);
    expect(called).toBe(0);
    expect(review.rows).toHaveLength(1);
    expect(review.aiStatus).toBeUndefined();
  });
  it("calls AI automatically when local parsing is incomplete and merges unchecked rows", async () => {
    const envelope = {
      schemaVersion: "p36.1", provider: "test", model: "test-model", warnings: [],
      suggestions: [{ catalogId: "IMM-002", reportedAnalyte: "Neutrophils", value: 3.8, reportedUnit: "10^9/L", observedAt: null, dateKind: "unknown", sourcePage: 1, evidenceSnippet: "3.8 x10^9/L Neutrophils", uncertainty: [] }],
    };
    const ai: AiAssist = async () => ({ status: "ok", rows: validateExtractionEnvelope(envelope, profile, 1).rows.map(r => ({ ...r, status: "review" as const, reasons: [] })), errors: [], provider: "test", model: "test-model" });
    const review = await processBoneFileWithAi(csv("IMM-999,1,mg/L,2026-10-14T07:35:00Z,Demo Lab,,,"), new AbortController().signal, profile, ai);
    expect(review.rows).toHaveLength(1);
    expect(review.rows[0]!.variableId).toBe("IMM-002");
    expect(review.rows[0]!.selected).toBe(false);
    expect(review.rows[0]!.provenance).toBe("ai");
    expect(review.aiStatus).toContain("AI-assisted extraction (test/test-model)");
    expect(review.aiStatus).toContain("never saved automatically");
  });
  it("AI failure retains local results and reports visibly", async () => {
    const ai: AiAssist = async () => ({ status: "unavailable", reason: "Network or offline; AI extraction endpoint unreachable." });
    const review = await processBoneFileWithAi(csv("IMM-999,1,mg/L,2026-10-14T07:35:00Z,Demo Lab,,,"), new AbortController().signal, profile, ai);
    expect(review.aiStatus).toContain("unavailable");
    expect(review.aiStatus).toContain("offline");
    expect(review.errors.length).toBeGreaterThan(0); // local rejection retained
  });
  it("denied AI access never discards local rows", async () => {
    const ai: AiAssist = async () => ({ status: "denied", reason: "Mission/crew authorization required" });
    const review = await processBoneFileWithAi(csv("IMM-999,1,mg/L,2026-10-14T07:35:00Z,Demo Lab,,,"), new AbortController().signal, profile, ai);
    expect(review.aiStatus).toContain("not authorized");
  });
});
