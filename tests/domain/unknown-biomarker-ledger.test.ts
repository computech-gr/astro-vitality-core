import { describe, expect, test } from "bun:test";
import { classifyIntakeObservation } from "../../src/domain/health-domains/unified-intake-classification";
import {
  buildReviewRequestExport,
  buildUnknownBiomarkerTerms,
  evaluateCatalogExtensionRegistry,
  GOVERNED_CATALOG_EXTENSIONS,
  recordReviewerDecision,
  reevaluateReviewRequest,
  REEVALUATION_MAX_TERMS,
  type CatalogExtensionRegistry,
  type ReviewSourceRow,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";
import {
  appendReviewerDecision,
  canSubmitReviewRequest,
  listUnknownBiomarkerReviewState,
  reviewRequestIdFor,
  savePendingReviewRequest,
} from "../../src/domain/health-intelligence/review-ledger";
import { InMemoryReviewLedgerStore } from "../../src/infrastructure/offline/review-ledger-store";

const scope = { missionId: "mission-a", crewMemberId: "crew-a", provenance: "synthetic" as const };
const row = (label: string, unit: string, value: string, observedAt: string): ReviewSourceRow => ({
  label, unit, value, observedAt, classification: classifyIntakeObservation({ label, unit }), sourceKind: "csv", sourceLabel: "CSV import",
});
const terms = buildUnknownBiomarkerTerms([row("Pulse", "bpm", "61", "2026-10-01T08:00:00Z"), row("Salivary cortisol", "nmol/L", "12", "2026-10-01T08:00:00Z")]);
const gm = { actorUserId: "user-gm", rolesForScope: ["ground_medical"] };
const crew = { actorUserId: "user-crew", rolesForScope: ["crew_self"] };

describe("v7 durable Unknown Biomarker review registry", () => {
  test("crew or Ground Medical may register a pending request; researcher or other scopes may not", async () => {
    expect(canSubmitReviewRequest(["crew_self"])).toBe("crew_self");
    expect(canSubmitReviewRequest(["ground_medical"])).toBe("ground_medical");
    expect(canSubmitReviewRequest(["researcher"])).toBeNull();
    const store = new InMemoryReviewLedgerStore();
    await expect(savePendingReviewRequest(scope, terms, { actorUserId: "user-r", rolesForScope: ["researcher"] }, "2026-11-01T10:00:00Z", store)).rejects.toThrow();
    const first = await savePendingReviewRequest(scope, terms, crew, "2026-11-01T10:00:00Z", store);
    expect(first.result).toBe("inserted");
    expect(first.request.status).toBe("PENDING_NIKOLAS_REVIEW");
    expect(first.request.catalogChangeApplied).toBe(false);
    // Same candidates again: idempotent, no duplicate request.
    const second = await savePendingReviewRequest(scope, terms, gm, "2026-11-01T11:00:00Z", store);
    expect(second.result).toBe("duplicate");
    expect(second.request.requestId).toBe(reviewRequestIdFor(scope, terms));
    const state = await listUnknownBiomarkerReviewState(scope, store);
    expect(state.requests).toHaveLength(1);
    expect((await listUnknownBiomarkerReviewState({ ...scope, crewMemberId: "crew-b" }, store)).requests).toHaveLength(0);
    expect((await listUnknownBiomarkerReviewState({ ...scope, provenance: "real" }, store)).requests).toHaveLength(0);
  });

  test("decisions persist append-only, only for Ground Medical, and never approve", async () => {
    const store = new InMemoryReviewLedgerStore();
    const pulse = terms.find((t) => t.normalizedLabel === "pulse")!;
    const result = recordReviewerDecision([], terms, { termId: pulse.termId, kind: "propose_alias_to_existing_metric", targetMetricId: "cv-001", rationale: "Pulse in bpm equals heart rate per handbook" },
      { reviewerUserId: "user-gm", rolesForScope: ["ground_medical"], scope, decidedAt: "2026-11-01T10:00:00Z" });
    if (!result.ok) throw new Error(result.reason);
    await expect(appendReviewerDecision(result.decision, crew, store)).rejects.toThrow();
    await expect(appendReviewerDecision({ ...result.decision, scientificStatus: "APPROVED" as never }, gm, store)).rejects.toThrow();
    expect(await appendReviewerDecision(result.decision, gm, store)).toBe("inserted");
    expect(await appendReviewerDecision(result.decision, gm, store)).toBe("duplicate");
    const state = await listUnknownBiomarkerReviewState(scope, store);
    expect(state.decisions).toHaveLength(1);
    expect(state.decisions[0]!.catalogChangeApplied).toBe(false);
    // A persisted decision does not change classification.
    expect(evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS).effective).toHaveLength(0);
  });

  test("tampered persisted decisions are ignored on read", async () => {
    const store = new InMemoryReviewLedgerStore();
    await store.append({ id: "unknown-biomarker-decision:x", ledger: "unknown-biomarker-decision", ...scope, actorUserId: "user-gm", createdAt: "2026-11-01T10:00:00Z",
      payload: { decisionId: "x", termId: "t", reviewerRole: "ground_medical", scientificStatus: "APPROVED", catalogChangeApplied: true, scope, decidedAt: "2026-11-01T10:00:00Z" } });
    expect((await listUnknownBiomarkerReviewState(scope, store)).decisions).toHaveLength(0);
  });
});

describe("v7 review request export / import (read-only re-evaluation)", () => {
  const exported = JSON.parse(JSON.stringify(buildReviewRequestExport({ scope, terms, ledger: [], generatedAt: "2026-11-01T10:00:00Z" })));

  test("round trip stays review-only under the current (empty) registry", () => {
    const r = reevaluateReviewRequest(exported, scope);
    if (!r.ok) throw new Error(r.reason);
    expect(r.results.every((x) => x.outcome === "still_review_only")).toBe(true);
  });

  test("an independently approved, same-unit alias is reported but nothing is saved", () => {
    const registry: CatalogExtensionRegistry = {
      ...GOVERNED_CATALOG_EXTENSIONS,
      extensions: [{ extensionId: "ext-pulse", version: 1, kind: "alias_to_existing_metric", sourceLabel: "Pulse", sourceUnit: "bpm", targetMetricId: "cv-001", status: "APPROVED", evidenceRefs: ["cv-001"] }],
      approvalHistory: [{ extensionId: "ext-pulse", version: 1, decision: "APPROVED", reviewer: "Independent reviewer", decidedAt: "2026-11-02T09:00:00Z", handbookEvidenceRefs: ["cv-001"] }],
    };
    const r = reevaluateReviewRequest(exported, scope, evaluateCatalogExtensionRegistry(registry));
    if (!r.ok) throw new Error(r.reason);
    expect(r.results.find((x) => x.label === "Pulse")).toMatchObject({ outcome: "matched_by_approved_extension", metricId: "cv-001" });
    expect(r.results.find((x) => x.label === "Salivary cortisol")!.outcome).toBe("still_review_only");
  });

  test("foreign scope, claimed approvals and oversized files are refused", () => {
    expect(reevaluateReviewRequest(exported, { ...scope, missionId: "mission-b" }).ok).toBe(false);
    expect(reevaluateReviewRequest({ ...exported, autoApproved: true }, scope).ok).toBe(false);
    expect(reevaluateReviewRequest({ ...exported, catalogChangeApplied: true }, scope).ok).toBe(false);
    expect(reevaluateReviewRequest({ ...exported, terms: Array.from({ length: REEVALUATION_MAX_TERMS + 1 }, () => exported.terms[0]) }, scope).ok).toBe(false);
    expect(reevaluateReviewRequest({ schema: "other" }, scope).ok).toBe(false);
  });
});
