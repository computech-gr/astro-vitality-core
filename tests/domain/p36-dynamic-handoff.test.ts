import { describe, expect, test } from "bun:test";
import { buildDynamicHandoff, buildSubmissionDraft, draftBulkProposal, groupForProposal } from "@/domain/health-intelligence/p36-dynamic-handoff";
import { buildReconciliationView } from "@/domain/health-intelligence/catalog-reconciliation-handoff";
import { termIdFor, type ReviewScope, type UnknownBiomarkerTerm } from "@/domain/health-intelligence/unknown-biomarker-review";
import type { PendingReviewRequest } from "@/domain/health-intelligence/review-ledger";

const scope: ReviewScope = { missionId: "M1", crewMemberId: "C1", provenance: "synthetic" };
const otherScope: ReviewScope = { missionId: "M2", crewMemberId: "C1", provenance: "synthetic" };

function term(label: string, unit: string, opts: Partial<UnknownBiomarkerTerm> = {}): UnknownBiomarkerTerm {
  return {
    termId: termIdFor(label, unit),
    normalizedLabel: label.trim().toLowerCase(),
    originalLabels: [label],
    originalUnit: unit,
    classification: "unclassified",
    candidateMetricIds: ["imm-001"],
    observations: [{ observationKey: `ubo-${label}-${unit}`, value: "4.2", observedAt: "2026-01-01T00:00:00Z", evidence: [{ sourceKind: "pdf", sourceLabel: "lab", documentName: "report.pdf", documentSha256: "a".repeat(64), excerpt: "WBC 4.2 10^9/L" }] }],
    duplicateRowsCollapsed: 0,
    ...opts,
  };
}

function request(id: string, terms: UnknownBiomarkerTerm[], s: ReviewScope = scope, extra: Partial<PendingReviewRequest> = {}): PendingReviewRequest {
  return { schema: "mitochondria.unknown-biomarker-review-request.v1", requestId: id, scope: s, terms, createdBy: "u1", createdByRole: "ground_medical", createdAt: "2026-11-06T00:00:00Z", status: "PENDING_NIKOLAS_REVIEW", catalogChangeApplied: false, ...extra };
}

const legacy = buildReconciliationView().rows;

describe("P36 dynamic handoff (phase 1)", () => {
  test("keeps the 12 legacy dossiers and adds dynamic terms without double counting", () => {
    const l = legacy[0]!;
    const view = buildDynamicHandoff(scope, [request("r1", [term(l.sourceLabel, l.sourceUnit), term("WBC", "10^9/L")]), request("r2", [term("WBC", "10^9/L")])]);
    expect(view.legacyCount).toBe(12);
    expect(view.dynamicOnlyCount).toBe(1);
    expect(view.overlappingLegacyCount).toBe(1);
    expect(view.totalDistinct).toBe(13);
    expect(view.terms.find((t) => t.normalizedLabel === "wbc")!.requestIds).toEqual(["r1", "r2"]);
  });

  test("every dynamic request is LOCAL_ONLY, never presumed synced", () => {
    const view = buildDynamicHandoff(scope, [request("r1", [term("WBC", "10^9/L")])]);
    expect(view.terms.every((t) => t.syncState === "LOCAL_ONLY")).toBe(true);
    expect(buildSubmissionDraft(view).transmitted).toBe(false);
  });

  test("rejects cross-mission requests", () => {
    const view = buildDynamicHandoff(scope, [request("r1", [term("WBC", "10^9/L")], otherScope)]);
    expect(view.terms).toHaveLength(0);
    expect(view.rejectedRequests[0]!.reason).toContain("different mission");
  });

  test("rejects requests claiming approval or applied catalog change", () => {
    const view = buildDynamicHandoff(scope, [
      request("r1", [term("WBC", "10^9/L")], scope, { status: "APPROVED" as never }),
      request("r2", [term("RBC", "10^12/L")], scope, { catalogChangeApplied: true as never }),
    ]);
    expect(view.terms).toHaveLength(0);
    expect(view.rejectedRequests).toHaveLength(2);
  });

  test("rejects tampered term IDs", () => {
    const t = { ...term("WBC", "10^9/L"), termId: "ubt-00000000" };
    expect(buildDynamicHandoff(scope, [request("r1", [t])]).rejectedRequests[0]!.reason).toContain("tampered");
  });

  test("different exact units are distinct terms and are never bulk-combined", () => {
    const view = buildDynamicHandoff(scope, [request("r1", [term("Glucose", "mg/dL"), term("Glucose", "mmol/L")])]);
    expect(view.terms).toHaveLength(2);
    const r = draftBulkProposal(view.terms, view.terms.map((t) => t.termId));
    expect(r.ok).toBe(false);
  });

  test("source-unvalidated stays blocked and is never selectable, even if a later request is cleaner", () => {
    const view = buildDynamicHandoff(scope, [request("r1", [term("WBC", "10^9/L", { classification: "source_unvalidated" })]), request("r2", [term("WBC", "10^9/L")])]);
    const t = view.terms[0]!;
    expect(t.blockers).toContain("SOURCE_UNVALIDATED");
    expect(groupForProposal(view.terms)[0]!.selectable).toBe(false);
    expect(draftBulkProposal(view.terms, [t.termId]).ok).toBe(false);
  });

  test("ambiguous, no-candidate and legacy-overlap terms are not bulk-selectable", () => {
    const l = legacy[0]!;
    const view = buildDynamicHandoff(scope, [request("r1", [term("A", "u", { candidateMetricIds: ["x", "y"] }), term("B", "u", { candidateMetricIds: [] }), term(l.sourceLabel, l.sourceUnit)])]);
    for (const t of view.terms) expect(draftBulkProposal(view.terms, [t.termId]).ok).toBe(false);
  });

  test("a label match never yields approval: bulk proposals require per-term decisions", () => {
    const view = buildDynamicHandoff(scope, [request("r1", [term("WBC", "10^9/L"), term("White blood cells", "10^9/L")])]);
    const r = draftBulkProposal(view.terms, view.terms.map((t) => t.termId));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal.perTermDecisionRequired).toBe(true);
    expect(r.proposal.approved).toBe(false);
    expect(r.proposal.activationAllowed).toBe(false);
    expect(r.proposal.status).toBe("PENDING_NIKOLAS_REVIEW");
  });

  test("unknown term IDs cannot be smuggled into a proposal", () => {
    const view = buildDynamicHandoff(scope, [request("r1", [term("WBC", "10^9/L")])]);
    expect(draftBulkProposal(view.terms, ["ubt-deadbeef"]).ok).toBe(false);
  });

  test("submission draft carries no clinical values, times or excerpts", () => {
    const view = buildDynamicHandoff(scope, [request("r1", [term("WBC", "10^9/L")])]);
    const json = JSON.stringify(buildSubmissionDraft(view));
    expect(json).not.toContain("4.2");
    expect(json).not.toContain("2026-01-01");
    expect(json).not.toContain("report.pdf");
    expect(json).toContain("a".repeat(64));
  });

  test("is deterministic", () => {
    const reqs = [request("r1", [term("WBC", "10^9/L"), term("RBC", "10^12/L")])];
    expect(JSON.stringify(buildDynamicHandoff(scope, reqs))).toBe(JSON.stringify(buildDynamicHandoff(scope, [...reqs].reverse())));
  });
});
