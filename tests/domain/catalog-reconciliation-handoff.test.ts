import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import handoffJson from "../../data/scientific/p36-unknown-biomarker-reconciliation-handoff.v1.json";
import {
  buildReconciliationView,
  canActivateHandoffRow,
  type CatalogReconciliationHandoff,
} from "@/domain/health-intelligence/catalog-reconciliation-handoff";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
  evaluateCatalogExtensionRegistry,
  GOVERNED_CATALOG_EXTENSIONS,
  REQUIRED_SCIENTIFIC_GATE,
} from "@/domain/health-intelligence/unknown-biomarker-review";
import { classifyIntakeObservation } from "@/domain/health-domains/unified-intake-classification";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const handoff = handoffJson as CatalogReconciliationHandoff;
const clone = (): CatalogReconciliationHandoff => JSON.parse(JSON.stringify(handoff));
const sha = (p: string) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");

describe("P36 catalog reconciliation handoff (review-only)", () => {
  const view = buildReconciliationView();

  test("contains exactly 12 terms and 36 observations, all valid", () => {
    expect(view.problems).toEqual([]);
    expect(view.ok).toBe(true);
    expect(view.totalTerms).toBe(12);
    expect(view.totalObservations).toBe(36);
    expect(view.rows.map((r) => r.sourceLabel).sort()).toEqual([
      "25(OH) Vitamin D", "BSC-001", "BSC-002", "BSC-008", "CTX", "IMM-001", "IMM-002", "IMM-003", "IMM-007", "P1NP", "PVT_MEDIAN_RT", "Urinary Calcium 24h",
    ]);
  });

  test("every row is PENDING_NIKOLAS_REVIEW, unapproved and cannot activate", () => {
    expect(view.status).toBe(REQUIRED_SCIENTIFIC_GATE);
    expect(view.activationAllowed).toBe(false);
    expect(view.approvedCount).toBe(0);
    for (const r of view.rows) {
      expect(r.reviewStatus).toBe(REQUIRED_SCIENTIFIC_GATE);
      expect(r.scientificApproval).toBe(false);
      expect(r.activationAllowed).toBe(false);
      expect(canActivateHandoffRow(r)).toBe(false);
      expect(r.blockReasons).toContain("pending_scientific_review");
    }
  });

  test("no approved catalog extension exists for any handoff term", () => {
    const evaluation = evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS);
    const ids = new Set(view.rows.map((r) => r.candidateCatalogId).filter(Boolean));
    expect(evaluation.effective.filter((e) => ids.has(e.metricId))).toEqual([]);
    expect(evaluation.effective.length).toBe(0);
  });

  test("P36 bone-015 / bone-019 have null catalog units and stay blocked", () => {
    for (const id of ["bone-015", "bone-019"]) {
      const r = view.rows.find((x) => x.candidateCatalogId === id)!;
      expect(r.candidateCatalogStatus).toBe("P36_PROVISIONAL");
      expect(r.catalogCrossCheck.found).toBe(true);
      expect(r.catalogCrossCheck.catalogUnit).toBeNull();
      expect(r.blockReasons).toContain("p36_unit_unvalidated");
    }
  });

  test("P35.5 draft rows stay blocked with no validated units", () => {
    const drafts = view.rows.filter((r) => r.candidateCatalogStatus === "P35_5_DRAFT");
    expect(drafts.map((r) => r.candidateCatalogId).sort()).toEqual(["BSC-001", "BSC-002", "BSC-008", "IMM-001", "IMM-002", "IMM-003", "IMM-007"]);
    for (const r of drafts) {
      expect(r.catalogCrossCheck.found).toBe(true);
      expect(r.catalogCrossCheck.catalogStatus).toBe(REQUIRED_SCIENTIFIC_GATE);
      expect(r.catalogCrossCheck.catalogUnit).toBeNull();
      expect(r.blockReasons).toContain("p35_5_draft_no_validated_units");
    }
  });

  test("BSC-008 and PVT cannot activate; CTX/P1NP/PVT need assay/protocol identity", () => {
    const bsc8 = view.rows.find((r) => r.sourceLabel === "BSC-008")!;
    const pvt = view.rows.find((r) => r.sourceLabel === "PVT_MEDIAN_RT")!;
    expect(bsc8.blockReasons).toContain("scale_unvalidated");
    expect(pvt.blockReasons).toEqual(expect.arrayContaining(["protocol_unvalidated", "canonical_identity_unresolved", "assay_protocol_identity_required"]));
    expect(canActivateHandoffRow(bsc8)).toBe(false);
    expect(canActivateHandoffRow(pvt)).toBe(false);
    for (const label of ["CTX", "P1NP"]) {
      const r = view.rows.find((x) => x.sourceLabel === label)!;
      expect(r.candidateCatalogId).toBeNull();
      expect(r.blockReasons).toEqual(expect.arrayContaining(["canonical_identity_unresolved", "assay_protocol_identity_required"]));
    }
  });

  test("handoff term IDs match the Unknown Biomarker Review grouping", () => {
    const rows = view.rows.map((r) => ({
      label: r.sourceLabel, unit: r.sourceUnit, value: "1", observedAt: "2026-10-01T00:00:00Z",
      classification: classifyIntakeObservation(r.sourceLabel, r.sourceUnit), sourceKind: "csv", sourceLabel: "test",
    }));
    const terms = buildUnknownBiomarkerTerms(rows);
    expect(terms.map((t) => t.termId).sort()).toEqual(view.rows.map((r) => r.termId).sort());
  });

  test("handoff terms remain review-only in intake classification (no activation)", () => {
    for (const r of view.rows) {
      const result = classifyWithGovernedExtensions(r.sourceLabel, r.sourceUnit, GOVERNED_CATALOG_EXTENSIONS);
      expect(result.classification.status).not.toBe("matched");
    }
  });

  test("tampered handoffs fail closed and still never activate", () => {
    const approved = clone();
    approved.rows[0]!.scientificApproval = true;
    approved.rows[1]!.reviewStatus = "APPROVED";
    approved.status = "APPROVED";
    approved.activationAllowed = true;
    const v = buildReconciliationView(approved);
    expect(v.ok).toBe(false);
    expect(v.problems.length).toBeGreaterThanOrEqual(4);
    expect(v.activationAllowed).toBe(false);
    expect(v.status).toBe(REQUIRED_SCIENTIFIC_GATE);
    expect(v.rows.every((r) => r.activationAllowed === false && r.blockReasons.includes("pending_scientific_review"))).toBe(true);

    const wrongId = clone();
    wrongId.rows[2]!.termId = "ubt-00000000";
    expect(buildReconciliationView(wrongId).problems.some((p) => p.includes("does not match"))).toBe(true);
  });

  test("existing catalogs and registry are unchanged by this patch", () => {
    expect(sha("data/scientific/p36-biomarker-source-registry.v1.json")).toBe(SHA.p36);
    expect(sha("data/scientific/p355-proposed-domain-catalog.v1.json")).toBe(SHA.p355);
    expect(sha("data/scientific/catalog-extensions.v1.json")).toBe(SHA.extensions);
  });
});

const SHA = {
  p36: "ce2271260428b152778ad67d1cad36306a7913dd3a4442abe3aa11ea65297148",
  p355: "1ee9b54a30e07da2f218d3c72d92efdef974c253f596afd0b2221669a45e3dfc",
  extensions: "24dead3960628d0ce61fad19844bbc19462bde42866435cda44b4aed03a000e4",
};
