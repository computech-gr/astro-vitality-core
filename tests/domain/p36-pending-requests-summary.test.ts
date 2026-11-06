import { describe, expect, test } from "bun:test";
import {
  buildPendingRequestsSummary,
  scopeKey,
  type ScopeInput,
} from "@/domain/health-intelligence/p36-pending-requests-summary";
import { buildReconciliationView } from "@/domain/health-intelligence/catalog-reconciliation-handoff";
import { termIdFor, type ReviewScope, type UnknownBiomarkerTerm } from "@/domain/health-intelligence/unknown-biomarker-review";
import type { PendingReviewRequest } from "@/domain/health-intelligence/review-ledger";
import type { CloudSubmission, HandoffReceipt } from "@/domain/health-intelligence/p36-cloud-handoff";
import { canonicalJson } from "@/domain/health-intelligence/observation-envelope";

const scopeA: ReviewScope = { missionId: "M1", crewMemberId: "C1", provenance: "synthetic" };
const scopeB: ReviewScope = { missionId: "M2", crewMemberId: "C2", provenance: "real" };

function term(label: string, unit: string, opts: Partial<UnknownBiomarkerTerm> = {}): UnknownBiomarkerTerm {
  return {
    termId: termIdFor(label, unit),
    normalizedLabel: label.trim().toLowerCase(),
    originalLabels: [label],
    originalUnit: unit,
    classification: "unclassified",
    candidateMetricIds: ["imm-001"],
    observations: [
      {
        observationKey: `ubo-${label}-${unit}`,
        value: "4.2",
        observedAt: "2026-01-01T00:00:00Z",
        evidence: [{ sourceKind: "pdf", sourceLabel: "lab", documentName: "report.pdf", documentSha256: "a".repeat(64), excerpt: "x" }],
      },
    ],
    duplicateRowsCollapsed: 0,
    ...opts,
  };
}

function request(id: string, terms: UnknownBiomarkerTerm[], s: ReviewScope = scopeA, extra: Partial<PendingReviewRequest> = {}): PendingReviewRequest {
  return {
    schema: "mitochondria.unknown-biomarker-review-request.v1",
    requestId: id,
    scope: s,
    terms,
    createdBy: "user-1",
    createdByRole: "ground_medical",
    createdAt: "2026-11-01T10:00:00.000Z",
    status: "PENDING_NIKOLAS_REVIEW",
    catalogChangeApplied: false,
    ...extra,
  };
}

function receipt(requestId: string, scope: ReviewScope, status: "SUBMITTED" | "CONFLICT", receivedAt: string): HandoffReceipt {
  return { requestId, scope, actorUserId: "user-1", status, receivedAt, submissionId: `sub-${requestId}`, payloadSha256: "b".repeat(64) };
}

describe("p36 pending requests summary", () => {
  test("groups requests by scope with totals, batches and statuses", () => {
    const legacyRow = buildReconciliationView().rows[0]!;
    const legacyTerm = term(legacyRow.sourceLabel, legacyRow.sourceUnit);
    const dynamicTerm = term("Novel Analyte", "ng/mL");
    const inputs: ScopeInput[] = [
      { scope: scopeA, requests: [request("ubr-00000001", [legacyTerm, dynamicTerm])], receipts: [receipt("ubr-00000001", scopeA, "SUBMITTED", "2026-11-02T00:00:00Z")] },
      { scope: scopeB, requests: [request("ubr-00000002", [term("Other Analyte", "pg/mL")], scopeB)], receipts: [] },
    ];
    const s = buildPendingRequestsSummary(inputs);
    expect(s.totalRequests).toBe(2);
    expect(s.totalUniqueTerms).toBe(3);
    expect(s.legacyBatchTermCount).toBe(1);
    expect(s.dynamicBatchTermCount).toBe(2);
    expect(s.byStatus).toEqual({ LOCAL_ONLY: 1, SUBMITTED: 1, SYNCHRONIZED: 0, FAILED: 0, CONFLICT: 0 });
    expect(s.legacyDocumentaryTotal).toBe(buildReconciliationView().rows.length);
    expect(s.dynamicSubmittedTermCount).toBe(1);
    const a = s.scopes.find((x) => x.scope.missionId === "M1")!;
    expect(a.requests[0]!.status).toBe("SUBMITTED");
    expect(a.requests[0]!.receipt?.submissionId).toBe("sub-ubr-00000001");
    expect(a.legacyTermIds).toEqual([legacyTerm.termId]);
    const b = s.scopes.find((x) => x.scope.missionId === "M2")!;
    expect(b.requests[0]!.status).toBe("LOCAL_ONLY");
    expect(b.requests[0]!.receipt).toBeNull();
  });

  test("a later conflict receipt marks the request CONFLICT; originals are preserved", () => {
    const t = term("Analyte X", "U/L");
    const inputs: ScopeInput[] = [
      {
        scope: scopeA,
        requests: [request("ubr-00000003", [t])],
        receipts: [
          receipt("ubr-00000003", scopeA, "SUBMITTED", "2026-11-02T00:00:00Z"),
          receipt("ubr-00000003", scopeA, "CONFLICT", "2026-11-03T00:00:00Z"),
        ],
      },
    ];
    const s = buildPendingRequestsSummary(inputs);
    expect(s.byStatus.CONFLICT).toBe(1);
    expect(s.scopes[0]!.requests[0]!.status).toBe("CONFLICT");
    expect(inputs[0]!.requests[0]!.terms).toHaveLength(1);
  });

  test("receipts from another scope or request never leak into a request", () => {
    const t = term("Analyte Y", "U/L");
    const inputs: ScopeInput[] = [
      { scope: scopeA, requests: [request("ubr-00000004", [t])], receipts: [receipt("ubr-00000004", scopeB, "SUBMITTED", "2026-11-02T00:00:00Z"), receipt("ubr-99999999", scopeA, "SUBMITTED", "2026-11-02T00:00:00Z")] },
    ];
    const s = buildPendingRequestsSummary(inputs);
    expect(s.scopes[0]!.requests[0]!.status).toBe("LOCAL_ONLY");
  });

  test("genuine duplicates across requests are reported without merging or rewriting", () => {
    const shared = term("Shared Analyte", "nmol/L");
    const r1 = request("ubr-00000005", [shared]);
    const r2 = request("ubr-00000006", [shared], scopeB);
    const s = buildPendingRequestsSummary([
      { scope: scopeA, requests: [r1], receipts: [] },
      { scope: scopeB, requests: [r2], receipts: [] },
    ]);
    expect(s.duplicates).toHaveLength(1);
    expect(s.duplicates[0]!.termId).toBe(shared.termId);
    expect(new Set(s.duplicates[0]!.occurrences.map((o) => o.requestId))).toEqual(new Set(["ubr-00000005", "ubr-00000006"]));
    expect(s.totalRequests).toBe(2);
    expect(s.totalUniqueTerms).toBe(1);
    expect(r1.terms[0]).toEqual(shared);
    expect(r2.terms[0]).toEqual(shared);
  });

  test("invalid requests are rejected, never shown as terms", () => {
    const t = term("Analyte Z", "mg/dL");
    const tampered = { ...t, termId: "ubt-deadbeef" };
    const inputs: ScopeInput[] = [
      {
        scope: scopeA,
        requests: [
          request("ubr-00000007", [t], scopeB),
          request("ubr-00000008", [t], scopeA, { status: "APPROVED" as never }),
          request("ubr-00000009", [tampered]),
          request("ubr-0000000a", []),
        ],
        receipts: [],
      },
    ];
    const s = buildPendingRequestsSummary(inputs);
    expect(s.totalRequests).toBe(0);
    expect(s.totalUniqueTerms).toBe(0);
    expect(s.scopes[0]!.rejectedRequests).toHaveLength(4);
  });

  test("counts come from data; an empty input yields zeros and no batches", () => {
    const s = buildPendingRequestsSummary([]);
    expect(s.totalRequests).toBe(0);
    expect(s.totalUniqueTerms).toBe(0);
    expect(s.legacyBatchTermCount).toBe(0);
    expect(s.dynamicBatchTermCount).toBe(0);
    expect(s.duplicates).toEqual([]);
  });

  test("scopeKey is stable and scope-sensitive", () => {
    expect(scopeKey(scopeA)).toBe(scopeKey({ ...scopeA }));
    expect(scopeKey(scopeA)).not.toBe(scopeKey(scopeB));
  });
  test("same request ID in two scopes is a genuine duplicate occurrence (scope-qualified identity)", () => {
    const shared = term("Shared Analyte", "nmol/L");
    const s = buildPendingRequestsSummary([
      { scope: scopeA, requests: [request("ubr-00000010", [shared])], receipts: [] },
      { scope: scopeB, requests: [request("ubr-00000010", [shared], scopeB)], receipts: [] },
    ]);
    expect(s.duplicates).toHaveLength(1);
    expect(s.duplicates[0]!.occurrences).toHaveLength(2);
    expect(s.totalRequests).toBe(2);
  });

  const cloudSub = (scope: ReviewScope, requestId: string, terms: UnknownBiomarkerTerm[], submissionId = `sub-${requestId}`, sha = "b".repeat(64)): CloudSubmission => ({
    submissionId,
    payloadSha256: sha,
    actorUserId: "user-2",
    receivedAt: "2026-11-04T00:00:00Z",
    payloadCanonical: canonicalJson({
      schema: "mitochondria.p36-cloud-handoff.v1",
      scope,
      requestId,
      scientificStatus: "PENDING_NIKOLAS_REVIEW",
      catalogChangeApplied: false,
      terms: terms.map((t) => ({ termId: t.termId, originalLabels: t.originalLabels, exactUnit: t.originalUnit })),
    }),
  });

  test("receipt + matching cloud copy is SYNCHRONIZED; missing cloud copy is FAILED; unread cloud stays SUBMITTED", () => {
    const t = term("Sync Analyte", "U/L");
    const r = request("ubr-00000011", [t]);
    const rc = receipt("ubr-00000011", scopeA, "SUBMITTED", "2026-11-02T00:00:00Z");
    const synced = buildPendingRequestsSummary([{ scope: scopeA, requests: [r], receipts: [rc], cloud: { ok: true, submissions: [cloudSub(scopeA, "ubr-00000011", [t])] } }]);
    expect(synced.scopes[0]!.requests[0]!.status).toBe("SYNCHRONIZED");
    const failed = buildPendingRequestsSummary([{ scope: scopeA, requests: [r], receipts: [rc], cloud: { ok: true, submissions: [] } }]);
    expect(failed.scopes[0]!.requests[0]!.status).toBe("FAILED");
    const digestMismatch = buildPendingRequestsSummary([{ scope: scopeA, requests: [r], receipts: [rc], cloud: { ok: true, submissions: [cloudSub(scopeA, "ubr-00000011", [t], "sub-ubr-00000011", "c".repeat(64))] } }]);
    expect(digestMismatch.scopes[0]!.requests[0]!.status).toBe("FAILED");
    const unavailable = buildPendingRequestsSummary([{ scope: scopeA, requests: [r], receipts: [rc], cloud: { ok: false, message: "offline" } }]);
    expect(unavailable.scopes[0]!.requests[0]!.status).toBe("SUBMITTED");
    expect(unavailable.scopes[0]!.cloudRead).toBe("unavailable");
  });

  test("cloud submissions from another device are listed as SYNCHRONIZED cloud-origin requests", () => {
    const t = term("Other Device Analyte", "mmol/L");
    const s = buildPendingRequestsSummary([{ scope: scopeA, requests: [], receipts: [], cloud: { ok: true, submissions: [cloudSub(scopeA, "ubr-00000012", [t])] } }]);
    expect(s.totalRequests).toBe(1);
    expect(s.byStatus.SYNCHRONIZED).toBe(1);
    expect(s.scopes[0]!.requests[0]!.origin).toBe("cloud");
    expect(s.scopes[0]!.additionalTerms.map((x) => x.termId)).toEqual([t.termId]);
    expect(s.dynamicSubmittedTermCount).toBe(1);
  });

  test("cloud payloads with a foreign scope, approval claim or forged term identity are rejected", () => {
    const t = term("Forged Analyte", "U/L");
    const forged = cloudSub(scopeA, "ubr-00000013", [{ ...t, termId: "ubt-deadbeef" }]);
    const foreign = cloudSub(scopeB, "ubr-00000014", [t]);
    const approved = { ...cloudSub(scopeA, "ubr-00000015", [t]) };
    approved.payloadCanonical = approved.payloadCanonical.replace("PENDING_NIKOLAS_REVIEW", "APPROVED");
    const s = buildPendingRequestsSummary([{ scope: scopeA, requests: [], receipts: [], cloud: { ok: true, submissions: [forged, foreign, approved] } }]);
    expect(s.totalRequests).toBe(0);
    expect(s.scopes[0]!.rejectedRequests).toHaveLength(3);
  });

  test("batch inventories split original and additional terms with labels and exact units", () => {
    const legacyRow = buildReconciliationView().rows[1]!;
    const legacyTerm = term(legacyRow.sourceLabel, legacyRow.sourceUnit);
    const extra = term("Extra Analyte", "µmol/L");
    const s = buildPendingRequestsSummary([{ scope: scopeA, requests: [request("ubr-00000016", [legacyTerm, extra])], receipts: [] }]);
    expect(s.scopes[0]!.legacyTerms.map((x) => [x.label, x.exactUnit])).toEqual([[legacyRow.sourceLabel, legacyRow.sourceUnit]]);
    expect(s.scopes[0]!.additionalTerms.map((x) => [x.label, x.exactUnit])).toEqual([["Extra Analyte", "µmol/L"]]);
    expect(s.dynamicSubmittedTermCount).toBe(0);
  });
});
