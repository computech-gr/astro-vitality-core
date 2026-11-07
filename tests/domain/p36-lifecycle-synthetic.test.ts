/**
 * Synthetic end-to-end P36 lifecycle demonstration (test-only fixtures):
 * UNKNOWN -> ACCEPTED_FOR_REVIEW -> scientific approval record -> governed
 * catalog-extension activation -> automatic recognition in a later intake.
 * Every fixture here is synthetic and lives only inside this test; it is not
 * scientific validation and never touches the bundled governed registry.
 */
import { describe, expect, test } from "bun:test";
import {
  GOVERNED_CATALOG_EXTENSIONS, REQUIRED_SCIENTIFIC_GATE, classifyWithGovernedExtensions, evaluateCatalogExtensionRegistry,
  type CatalogExtension, type CatalogExtensionRegistry,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { latestTriageByTerm, type TriageEvent } from "../../src/lib/p36-global-triage-rules";
import { flattenTerms } from "../../src/lib/p36-global-review-view";
import type { GlobalReviewSubmission } from "../../src/lib/p36-global-review.server";

const LABEL = "Synthetic Systolic Pressure Z";
const UNIT = "mmHg";
const SUB = "4fc8aee1-deb3-4f4c-9173-46c2a3401fa7";
const TERM = "ubt-0000abcd";

const extension = (version: number, status: CatalogExtension["status"], extra: Partial<CatalogExtension> = {}): CatalogExtension => ({
  extensionId: "ext-synthetic-sbp-z", version, kind: "alias_to_existing_metric", sourceLabel: LABEL, sourceUnit: UNIT,
  targetMetricId: "cv-005", status, evidenceRefs: ["synthetic-fixture:not-scientific-evidence"], ...extra,
});
const registry = (extensions: CatalogExtension[], decisions: { version: number; decision: CatalogExtension["status"] }[]): CatalogExtensionRegistry => ({
  schema: GOVERNED_CATALOG_EXTENSIONS.schema, baseCatalogVersion: GOVERNED_CATALOG_EXTENSIONS.baseCatalogVersion, requiredScientificGate: REQUIRED_SCIENTIFIC_GATE,
  extensions,
  approvalHistory: decisions.map((d, i) => ({ extensionId: "ext-synthetic-sbp-z", version: d.version, decision: d.decision,
    reviewer: "Synthetic Test Reviewer", decidedAt: `2026-11-0${7 + i}T10:00:00Z`, handbookEvidenceRefs: ["synthetic-fixture:handbook"] })),
});

describe("P36 synthetic lifecycle", () => {
  test("bundled governed registry has no activations, so the synthetic label stays unknown in real intake", () => {
    expect(GOVERNED_CATALOG_EXTENSIONS.extensions.length).toBe(0);
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT }).classification.status).not.toBe("matched");
  });

  test("unknown -> accepted for review is triage only and does not recognize anything", () => {
    const sub = { submissionId: SUB, missionId: "M1", missionCode: "DEMO", missionName: "Demo", crewPseudonym: "crew-p-0123456789abcdef", provenance: "synthetic",
      requestId: "ubr-0000abcd", submittedRole: "ground_medical", receivedAt: "2026-11-07T08:30:00Z", receivedSeq: 1, payloadSha256: "c".repeat(64), accessBasis: "global_scientific_review",
      terms: [{ termId: TERM, originalLabels: [LABEL], exactUnit: UNIT, classification: "unclassified", candidateMetricIds: ["cv-005"], sourceDocumentSha256: [], evidencePointers: [], method: null, specimen: null, decision: null }],
    } satisfies GlobalReviewSubmission;
    const accept: TriageEvent = { eventId: "11111111-1111-4111-8111-111111111111", submissionId: SUB, termId: TERM, action: "ACCEPT_FOR_REVIEW", reason: null, evidenceRequirements: [], previousEventId: null, recordedAt: "2026-11-07T09:00:00Z", recordedByCaller: true };
    const before = flattenTerms([sub])[0];
    const after = flattenTerms([sub], latestTriageByTerm([accept]))[0];
    expect(before?.state).toBe("awaiting_triage");
    expect(after?.state).toBe("accepted");
    expect(after?.scientific).toBe("pending");
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT }).classification.status).not.toBe("matched");
  });

  test("a proposed extension without an approval record is not effective", () => {
    const evaluation = evaluateCatalogExtensionRegistry(registry([extension(1, "PENDING_NIKOLAS_REVIEW")], []));
    expect(evaluation.effective).toEqual([]);
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT }, evaluation).classification.status).not.toBe("matched");
  });

  test("approved and activated, a later synthetic examination is recognized as the existing metric", () => {
    const evaluation = evaluateCatalogExtensionRegistry(registry([extension(1, "APPROVED")], [{ version: 1, decision: "APPROVED" }]));
    const observation = Object.freeze({ label: `  ${LABEL.toLowerCase()} `, unit: UNIT });
    const r = classifyWithGovernedExtensions(observation, evaluation);
    expect(r.classification.status).toBe("matched");
    if (r.classification.status === "matched") {
      expect(r.classification.metricId).toBe("cv-005");
      expect(r.classification.originalUnit).toBe(UNIT);
      expect(r.classification.reviewRequired).toBe(true);
    }
    expect(r.extension).toEqual({ extensionId: "ext-synthetic-sbp-z", version: 1 });
    expect(observation).toEqual({ label: `  ${LABEL.toLowerCase()} `, unit: UNIT });
  });

  test("a different unit is never converted and stays unrecognized", () => {
    const evaluation = evaluateCatalogExtensionRegistry(registry([extension(1, "APPROVED")], [{ version: 1, decision: "APPROVED" }]));
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: "kPa" }, evaluation).classification.status).not.toBe("matched");
  });

  test("method/specimen-bound activation does not match an examination without that context", () => {
    const ctx = extension(1, "APPROVED", { matchingContext: { method: "Synthetic cuff method", specimen: "Synthetic upper arm" } });
    const evaluation = evaluateCatalogExtensionRegistry(registry([ctx], [{ version: 1, decision: "APPROVED" }]));
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT }, evaluation).classification.status).not.toBe("matched");
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT, method: "Synthetic cuff method", specimen: "Synthetic upper arm" }, evaluation).classification.status).toBe("matched");
  });

  test("two approved activations for the same label and unit are ambiguous and neither applies", () => {
    const other = { ...extension(1, "APPROVED"), extensionId: "ext-synthetic-sbp-z2", targetMetricId: "cv-006" };
    const reg = registry([extension(1, "APPROVED"), other], [{ version: 1, decision: "APPROVED" }]);
    reg.approvalHistory.push({ ...reg.approvalHistory[0]!, extensionId: "ext-synthetic-sbp-z2" });
    const evaluation = evaluateCatalogExtensionRegistry(reg);
    expect(evaluation.effective).toEqual([]);
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT }, evaluation).classification.status).not.toBe("matched");
  });

  test("a later rejected version revokes recognition without rewriting the earlier record", () => {
    const reg = registry([extension(1, "APPROVED"), extension(2, "REJECTED")], [{ version: 1, decision: "APPROVED" }, { version: 2, decision: "REJECTED" }]);
    const evaluation = evaluateCatalogExtensionRegistry(reg);
    expect(evaluation.effective).toEqual([]);
    expect(reg.extensions[0]?.status).toBe("APPROVED");
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT }, evaluation).classification.status).not.toBe("matched");
  });
});
