import { describe, expect, it } from "bun:test";
import { classifyIntakeObservation } from "../../src/domain/health-domains/unified-intake-classification";
import {
  buildCatalogExtensionProposal,
  buildReviewRequestExport,
  buildUnknownBiomarkerTerms,
  canRecordReviewerDecision,
  classifyWithGovernedExtensions,
  evaluateCatalogExtensionRegistry,
  GOVERNED_CATALOG_EXTENSIONS,
  recordReviewerDecision,
  reevaluateReviewRequest,
  type CatalogExtensionRegistry,
  type ReviewSourceRow,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";

const scope = { missionId: "FV01-TEST-A", crewMemberId: "crew-a", provenance: "synthetic" as const };
const row = (label: string, unit: string, value: string, observedAt: string, extra: Partial<ReviewSourceRow> = {}): ReviewSourceRow => ({
  label, unit, value, observedAt, classification: classifyIntakeObservation({ label, unit }),
  sourceKind: "csv", sourceLabel: "CSV import", ...extra,
});
const ctx = (roles: string[]) => ({ reviewerUserId: "user-gm", rolesForScope: roles, scope, decidedAt: "2026-11-01T10:00:00Z" });

const approvedRegistry = (overrides: Partial<CatalogExtensionRegistry> = {}): CatalogExtensionRegistry => ({
  ...GOVERNED_CATALOG_EXTENSIONS,
  extensions: [{ extensionId: "ext-pulse", version: 1, kind: "alias_to_existing_metric", sourceLabel: "Pulse", sourceUnit: "bpm", targetMetricId: "cv-001", status: "APPROVED", evidenceRefs: ["cardiovascular-handbook cv-001"] }],
  approvalHistory: [{ extensionId: "ext-pulse", version: 1, decision: "APPROVED", reviewer: "Independent scientific reviewer", decidedAt: "2026-11-02T09:00:00Z", handbookEvidenceRefs: ["cardiovascular-handbook cv-001"] }],
  ...overrides,
});

describe("unknown biomarker candidate terms", () => {
  it("groups unknown, ambiguous and unit-mismatched rows, ignores matched rows and deduplicates evidence", () => {
    const rows = [
      row("Heart rate", "bpm", "62", "2026-10-01T08:00:00Z"),
      row("Heart rate", "beats/min", "62", "2026-10-01T08:00:00Z"),
      row("Pulse", "bpm", "61", "2026-10-01T08:00:00Z"),
      row("pulse ", "bpm", "61", "2026-10-01T08:00:00Z"),
      row("Pulse", "bpm", "61", "2026-10-01T08:00:00Z", { sourceKind: "pdf", sourceLabel: "Lab PDF", documentSha256: "abc" }),
    ];
    const terms = buildUnknownBiomarkerTerms(rows);
    expect(terms.map((t) => [t.normalizedLabel, t.originalUnit, t.classification])).toEqual([
      ["heart rate", "beats/min", "unit_review_required"],
      ["pulse", "bpm", "unclassified"],
    ]);
    expect(terms[0]!.candidateMetricIds).toEqual(["cv-001"]);
    const pulse = terms[1]!;
    expect(pulse.observations).toHaveLength(1);
    expect(pulse.duplicateRowsCollapsed).toBe(1);
    expect(pulse.observations[0]!.evidence.map((e) => e.sourceLabel)).toEqual(["CSV import", "Lab PDF"]);
  });
});

describe("reviewer decisions", () => {
  const terms = buildUnknownBiomarkerTerms([row("Pulse", "bpm", "61", "2026-10-01T08:00:00Z"), row("Heart rate", "beats/min", "62", "2026-10-01T08:00:00Z")]);
  const pulse = terms.find((t) => t.normalizedLabel === "pulse")!;
  const hr = terms.find((t) => t.normalizedLabel === "heart rate")!;

  it("allows only the ground medical role for the exact scope", () => {
    expect(canRecordReviewerDecision(["crew_self"])).toBe(false);
    expect(canRecordReviewerDecision(["ground_medical"])).toBe(true);
    const denied = recordReviewerDecision([], terms, { termId: pulse.termId, kind: "needs_more_evidence", rationale: "Need lab method sheet." }, ctx(["crew_self", "mission_operator"]));
    expect(denied.ok).toBe(false);
  });

  it("is append-only, stays PENDING_NIKOLAS_REVIEW and never applies catalog changes", () => {
    const first = recordReviewerDecision([], terms, { termId: pulse.termId, kind: "needs_more_evidence", rationale: "Need lab method sheet." }, ctx(["ground_medical"]));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = recordReviewerDecision(first.ledger, terms, { termId: pulse.termId, kind: "propose_alias_to_existing_metric", targetMetricId: "cv-001", rationale: "Pulse in bpm equals HR per source." }, ctx(["ground_medical"]));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.ledger).toHaveLength(2);
    expect(second.ledger[0]).toEqual(first.ledger[0]!);
    for (const d of second.ledger) {
      expect(d.scientificStatus).toBe("PENDING_NIKOLAS_REVIEW");
      expect(d.catalogChangeApplied).toBe(false);
    }
    const proposal = buildCatalogExtensionProposal(terms, second.ledger);
    expect(proposal.status).toBe("PENDING_NIKOLAS_REVIEW");
    expect(proposal.autoApproved).toBe(false);
    expect(proposal.draftExtensions).toHaveLength(1);
    expect(proposal.draftExtensions[0]!.status).toBe("PENDING_NIKOLAS_REVIEW");
    // Recording the proposal does not change classification.
    expect(classifyWithGovernedExtensions({ label: "Pulse", unit: "bpm" }).classification.status).toBe("unclassified");
  });

  it("rejects mappings that would need unit conversion, unknown targets and empty rationale", () => {
    const conv = recordReviewerDecision([], terms, { termId: hr.termId, kind: "propose_alias_to_existing_metric", targetMetricId: "cv-001", rationale: "Same measure, different unit." }, ctx(["ground_medical"]));
    expect(conv.ok).toBe(false);
    if (!conv.ok) expect(conv.reason).toContain("Unit conversion is not permitted");
    const unknown = recordReviewerDecision([], terms, { termId: pulse.termId, kind: "propose_alias_to_existing_metric", targetMetricId: "cv-999", rationale: "Long enough rationale." }, ctx(["ground_medical"]));
    expect(unknown.ok).toBe(false);
    const short = recordReviewerDecision([], terms, { termId: pulse.termId, kind: "not_a_biomarker", rationale: "no" }, ctx(["ground_medical"]));
    expect(short.ok).toBe(false);
  });
});

describe("governed catalog extension gate", () => {
  it("has no effective extensions in the shipped registry", () => {
    expect(evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS).effective).toEqual([]);
  });

  it("applies only fully approved, exact-unit aliases and never overrides base matches", () => {
    const evaluation = evaluateCatalogExtensionRegistry(approvedRegistry());
    const pulse = classifyWithGovernedExtensions({ label: "pulse", unit: "bpm" }, evaluation);
    expect(pulse.classification.status).toBe("matched");
    expect(pulse.extension).toEqual({ extensionId: "ext-pulse", version: 1 });
    expect(classifyWithGovernedExtensions({ label: "Pulse", unit: "beats/min" }, evaluation).classification.status).toBe("unclassified");
    expect(classifyWithGovernedExtensions({ label: "Heart rate", unit: "bpm" }, evaluation).extension).toBeNull();
  });

  it("fails closed for pending status, missing approval evidence or conflicting approvals", () => {
    const pending = approvedRegistry({ extensions: [{ ...approvedRegistry().extensions[0]!, status: "PENDING_NIKOLAS_REVIEW" }] });
    expect(evaluateCatalogExtensionRegistry(pending).effective).toEqual([]);
    const noEvidence = approvedRegistry({ approvalHistory: [{ ...approvedRegistry().approvalHistory[0]!, handbookEvidenceRefs: [] }] });
    expect(evaluateCatalogExtensionRegistry(noEvidence).effective).toEqual([]);
    const revoked = approvedRegistry({ approvalHistory: [...approvedRegistry().approvalHistory, { ...approvedRegistry().approvalHistory[0]!, decision: "REJECTED", decidedAt: "2026-11-03T09:00:00Z" }] });
    expect(evaluateCatalogExtensionRegistry(revoked).effective).toEqual([]);
    const base = approvedRegistry();
    const conflict = approvedRegistry({
      extensions: [...base.extensions, { ...base.extensions[0]!, extensionId: "ext-pulse-2", targetMetricId: "cv-002" }],
      approvalHistory: [...base.approvalHistory, { ...base.approvalHistory[0]!, extensionId: "ext-pulse-2" }],
    });
    expect(evaluateCatalogExtensionRegistry(conflict).effective).toEqual([]);
  });
});

describe("review export and re-evaluation", () => {
  const terms = buildUnknownBiomarkerTerms([row("Pulse", "bpm", "61", "2026-10-01T08:00:00Z")]);
  const exported = buildReviewRequestExport({ scope, terms, ledger: [], generatedAt: "2026-11-01T10:00:00Z" });

  it("exports scope, evidence and pending status without approval", () => {
    expect(exported.scope).toEqual(scope);
    expect(exported.scientificStatus).toBe("PENDING_NIKOLAS_REVIEW");
    expect(exported.catalogChangeApplied).toBe(false);
    expect(exported.containsRealHealthData).toBe(false);
    expect(exported.terms[0]!.observations[0]!.evidence[0]!.sourceLabel).toBe("CSV import");
  });

  it("re-evaluates previously excluded candidates read-only and refuses other scopes", () => {
    const round = JSON.parse(JSON.stringify(exported));
    const now = reevaluateReviewRequest(round, scope);
    expect(now.ok && now.results[0]!.outcome).toBe("still_review_only");
    const later = reevaluateReviewRequest(round, scope, evaluateCatalogExtensionRegistry(approvedRegistry()));
    expect(later.ok && later.results[0]!.outcome).toBe("matched_by_approved_extension");
    expect(reevaluateReviewRequest(round, { ...scope, crewMemberId: "crew-b" }).ok).toBe(false);
    expect(reevaluateReviewRequest(round, { ...scope, provenance: "real" }).ok).toBe(false);
  });
});
