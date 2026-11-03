import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import crosswalkJson from "../../data/scientific/p36-scientific-review-crosswalk.v1.json";
import committedManifest from "../../data/scientific/p36-activation-manifest.v1.json";
import {
  buildActivationManifest,
  buildScientificReviewDossiers,
  buildScientificReviewEntry,
  compareUnit,
  verifyScientificReviewChain,
  type Crosswalk,
  type ScientificReviewDossier,
  type ScientificReviewEntry,
  type ScientificReviewInput,
} from "@/domain/health-intelligence/p36-scientific-review";
import { appendScientificReviewEntry, listScientificReviewEntries } from "@/domain/health-intelligence/p36-scientific-review-ledger";
import { InMemoryReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import {
  classifyWithGovernedExtensions,
  evaluateCatalogExtensionRegistry,
  GOVERNED_CATALOG_EXTENSIONS,
  REQUIRED_SCIENTIFIC_GATE,
} from "@/domain/health-intelligence/unknown-biomarker-review";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sha = (p: string) => createHash("sha256").update(readFileSync(join(root, p))).digest("hex");
const { ok, problems, dossiers } = buildScientificReviewDossiers();
const byLabel = (label: string) => dossiers.find((d) => d.sourceLabel === label)!;
const recorder = (seq = 0) => ({ userId: "user-gm-1", roles: ["ground_medical"], recordedAt: new Date(Date.UTC(2026, 10, 3, 20, seq)).toISOString() });

const alias = (d: ScientificReviewDossier, patch: Partial<ScientificReviewInput> = {}): ScientificReviewInput => ({
  termId: d.termId,
  decision: "ACCEPT_ALIAS_WITH_EVIDENCE",
  targetCatalogId: d.candidateCatalogIds[0],
  confirmedUnit: d.sourceUnit,
  specimen: "Whole blood EDTA",
  assayMethod: "Automated hematology analyzer",
  protocol: "Morning venous draw",
  evidenceRefs: [d.evidence[0]!.ref],
  rationale: "Analyte definition and specimen match the handbook entry.",
  reviewerName: "Dr. Independent Reviewer",
  reviewerQualification: "PhD clinical laboratory science",
  independenceConfirmed: true,
  ...patch,
});

async function chainOf(inputs: ScientificReviewInput[]): Promise<ScientificReviewEntry[]> {
  const out: ScientificReviewEntry[] = [];
  for (const [i, input] of inputs.entries()) {
    const r = await buildScientificReviewEntry(input, dossiers.find((d) => d.termId === input.termId), out, recorder(i));
    if (!r.ok) throw new Error(r.reason);
    out.push(r.entry);
  }
  return out;
}

describe("P36 scientific review dossiers", () => {
  test("12 consolidated dossiers, 36 observations, all sources resolve, all pending", () => {
    expect(problems).toEqual([]);
    expect(ok).toBe(true);
    expect(dossiers).toHaveLength(12);
    expect(dossiers.reduce((n, d) => n + d.observations, 0)).toBe(36);
    for (const d of dossiers) {
      expect(d.status).toBe(REQUIRED_SCIENTIFIC_GATE);
      expect(d.evidence.length).toBeGreaterThan(0);
      expect(d.unresolvedQuestions.length).toBeGreaterThan(0);
      expect(d.noValidatedCatalogUnit).toBe(true);
    }
  });

  test("units are compared by exact text only, never converted or equated", () => {
    expect(compareUnit("ng/mL", "x", ["ng/L"]).status).toBe("STRING_DIFFERS_NO_CONVERSION");
    expect(compareUnit("ng/mL", "x", ["ng/mL", "nmol/L"]).status).toBe("EXACT_STRING_MATCH");
    expect(compareUnit("µg/L", "x", ["μg/L"]).status).toBe("STRING_DIFFERS_NO_CONVERSION"); // micro sign vs Greek mu
    expect(compareUnit("mg/24h", "x", ["mg/day"]).status).toBe("STRING_DIFFERS_NO_CONVERSION");
    expect(compareUnit("h", "x", [null]).status).toBe("NO_REFERENCE_UNIT");
    const ctx = byLabel("CTX");
    expect(ctx.unitComparisons.filter((u) => u.status === "STRING_DIFFERS_NO_CONVERSION").map((u) => u.reference)).toEqual(["Bone handbook v7 bone-001", "Nikolas source IMM-NIK-082"]);
    expect(byLabel("BSC-001").unitComparisons.find((u) => u.reference.includes("BHP-001"))!.status).toBe("STRING_DIFFERS_NO_CONVERSION");
    expect(byLabel("Urinary Calcium 24h").unitComparisons.find((u) => u.reference.includes("handbook"))!.status).toBe("STRING_DIFFERS_NO_CONVERSION");
    expect(byLabel("IMM-001").unitComparisons.find((u) => u.reference.includes("IMM-NIK-001"))!.status).toBe("EXACT_STRING_MATCH");
  });

  test("surfaces source conflicts for the reviewer without choosing", () => {
    expect(byLabel("25(OH) Vitamin D").candidateCatalogIds).toEqual(["IMM-030", "bone-019"]);
    expect(byLabel("CTX").candidateCatalogIds).toEqual(["bone-001"]);
    expect(byLabel("CTX").handoff.candidateCatalogId).toBeNull();
    expect(byLabel("P1NP").candidateCatalogIds).toEqual(["bone-009"]);
    expect(byLabel("PVT_MEDIAN_RT").candidateCatalogIds).toEqual(["BSC-017"]);
    expect(byLabel("Urinary Calcium 24h").specimen.join(" ")).toContain("24-hour urine");
  });

  test("tampered crosswalk fails closed", () => {
    const bad = JSON.parse(JSON.stringify(crosswalkJson)) as Crosswalk;
    bad.activationAllowed = true;
    bad.terms[0]!.p36Ids.push("bone-999");
    const r = buildScientificReviewDossiers(bad);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("bone-999"))).toBe(true);
  });
});

describe("P36 reviewer worksheet entries", () => {
  test("alias requires identical unit, candidate target, specimen, assay, protocol, evidence and independence", async () => {
    const d = byLabel("IMM-001");
    const reject = async (patch: Partial<ScientificReviewInput>) => {
      const r = await buildScientificReviewEntry(alias(d, patch), d, [], recorder());
      expect(r.ok).toBe(false);
      return r.ok ? "" : r.reason;
    };
    expect(await reject({ confirmedUnit: "10^3/µL" })).toContain("no conversion");
    expect(await reject({ targetCatalogId: "IMM-099" })).toContain("not a candidate");
    expect(await reject({ specimen: "" })).toContain("specimen");
    expect(await reject({ assayMethod: " " })).toContain("assay");
    expect(await reject({ protocol: "" })).toContain("protocol");
    expect(await reject({ evidenceRefs: [] })).toContain("evidence");
    expect(await reject({ evidenceRefs: ["my notes"] })).toContain("neither");
    expect(await reject({ independenceConfirmed: false })).toContain("independence");
    expect(await reject({ reviewerName: "" })).toContain("name");
    const ok = await buildScientificReviewEntry(alias(d, { evidenceRefs: ["p40:IMM-NIK-001", "doi:10.1000/xyz"] }), d, [], recorder());
    expect(ok.ok).toBe(true);
  });

  test("prohibits thresholds, diagnoses, fitness-for-duty and conversions", async () => {
    const d = byLabel("IMM-007");
    for (const rationale of [
      "Values above the reference range indicate inflammation clearly.",
      "Supports a diagnosis of infection in this crew member.",
      "Use a cut-off of 3 for elevated risk in analysis.",
      "Flag when the value is > 10 for every crew member.",
      "Crew member is fit for duty based on these values.",
      "Convert mg/dL by multiplying by ten for the catalog.",
    ]) {
      const r = await buildScientificReviewEntry({ ...alias(d), decision: "NEEDS_MORE_EVIDENCE", rationale }, d, [], recorder());
      expect(r.ok).toBe(false);
    }
  });

  test("only signed-in Ground Medical or Researcher members can record", async () => {
    const d = byLabel("BSC-002");
    for (const roles of [["crew_self"], ["mission_operator"], []]) {
      const r = await buildScientificReviewEntry(alias(d), d, [], { ...recorder(), roles });
      expect(r.ok).toBe(false);
    }
    expect((await buildScientificReviewEntry(alias(d), d, [], { ...recorder(), roles: ["researcher"] })).ok).toBe(true);
  });

  test("entries are hash-chained, documentary and tamper-evident", async () => {
    const chain = await chainOf([alias(byLabel("IMM-001")), { ...alias(byLabel("CTX")), decision: "NEEDS_MORE_EVIDENCE" }]);
    expect(chain.map((e) => e.sequence)).toEqual([1, 2]);
    expect(chain[1]!.prevHash).toBe(chain[0]!.hash);
    for (const e of chain) {
      expect(e.scientificStatus).toBe(REQUIRED_SCIENTIFIC_GATE);
      expect(e.documentaryOnly).toBe(true);
      expect(e.activationApplied).toBe(false);
    }
    expect((await verifyScientificReviewChain(chain)).ok).toBe(true);
    const edited = [{ ...chain[0]!, confirmedUnit: "10^3/µL" }, chain[1]!];
    expect((await verifyScientificReviewChain(edited)).ok).toBe(false);
    expect((await verifyScientificReviewChain([chain[1]!])).ok).toBe(false);
    const forged = [{ ...chain[0]!, scientificStatus: "APPROVED" as never }];
    expect((await verifyScientificReviewChain(forged)).ok).toBe(false);
    const append = await buildScientificReviewEntry(alias(byLabel("BSC-002")), byLabel("BSC-002"), edited, recorder(5));
    expect(append.ok).toBe(false);
  });

  test("local ledger is append-only and refuses concurrent overwrites", async () => {
    const store = new InMemoryReviewLedgerStore();
    const [first] = await chainOf([alias(byLabel("IMM-002"))]);
    await appendScientificReviewEntry(first!, store);
    const competing = await buildScientificReviewEntry(alias(byLabel("IMM-003")), byLabel("IMM-003"), [], recorder(9));
    if (!competing.ok) throw new Error(competing.reason);
    await expect(appendScientificReviewEntry(competing.entry, store)).rejects.toThrow();
    const state = await listScientificReviewEntries(store);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]!.termId).toBe(byLabel("IMM-002").termId);
    expect(state.integrity.ok).toBe(true);
  });
});

describe("P36 activation manifest", () => {
  test("committed manifest matches the builder with no reviewer entries", async () => {
    const built = await buildActivationManifest([]);
    expect(committedManifest).toEqual(JSON.parse(JSON.stringify(built)));
  });

  test("no review: all 12 blocked, nothing ready, nothing applied", async () => {
    const m = await buildActivationManifest([]);
    expect(m.status).toBe(REQUIRED_SCIENTIFIC_GATE);
    expect(m.activationAllowed).toBe(false);
    expect(m.appliesChanges).toBe(false);
    expect(m.counts).toEqual({ terms: 12, observations: 36, withDecision: 0, readyForGovernedActivation: 0, blocked: 12 });
    for (const t of m.terms) {
      expect(t.blockers).toContain("NO_INDEPENDENT_REVIEW_DECISION");
      expect(t.blockers).toContain("IN_APP_RECORD_IS_NOT_GOVERNED_APPROVAL");
      expect(t.proposedExtension).toBeNull();
    }
  });

  test("even a complete alias recommendation stays pending and blocked", async () => {
    const chain = await chainOf([
      alias(byLabel("25(OH) Vitamin D"), { targetCatalogId: "bone-019", specimen: "Serum", assayMethod: "LC-MS/MS", protocol: "Fasting draw" }),
      alias(byLabel("IMM-001")),
      alias(byLabel("BSC-008"), { specimen: "Questionnaire", assayMethod: "Self-report", protocol: "Morning" }),
      alias(byLabel("PVT_MEDIAN_RT"), { specimen: "Not applicable", assayMethod: "PVT", protocol: "Session" }),
      { ...alias(byLabel("CTX")), decision: "ACCEPT_RELATED_DISTINCT_MEASURE" },
    ]);
    const m = await buildActivationManifest(chain);
    expect(m.counts.readyForGovernedActivation).toBe(0);
    expect(m.counts.withDecision).toBe(5);
    expect(m.manifestVersion).toBe("p36.1.0+p36-review.5");
    const t = (label: string) => m.terms.find((x) => x.sourceLabel === label)!;
    expect(t("25(OH) Vitamin D").blockers).toContain("CATALOG_UNIT_NOT_VALIDATED");
    expect(t("25(OH) Vitamin D").proposedExtension?.status).toBe(REQUIRED_SCIENTIFIC_GATE);
    expect(t("IMM-001").blockers).toContain("TARGET_NOT_ROUTED_P36_METRIC");
    expect(t("BSC-008").blockers).toContain("SCALE_UNVALIDATED");
    expect(t("PVT_MEDIAN_RT").blockers).toContain("PROTOCOL_UNVALIDATED");
    expect(t("CTX").blockers).toContain("NEW_CATALOG_METRIC_REQUIRED");
    expect(t("CTX").proposedExtension).toBeNull();
    for (const term of m.terms) expect(term.status).toBe(REQUIRED_SCIENTIFIC_GATE);
    // Proposed extensions never become effective, even if dropped into a registry shape.
    const asRegistry = { ...GOVERNED_CATALOG_EXTENSIONS, extensions: m.terms.flatMap((x) => (x.proposedExtension ? [x.proposedExtension] : [])) };
    expect(evaluateCatalogExtensionRegistry(asRegistry as never).effective).toEqual([]);
  });

  test("broken history blocks every term and digest is stable", async () => {
    const chain = await chainOf([alias(byLabel("IMM-001"))]);
    const m = await buildActivationManifest([{ ...chain[0]!, rationale: "edited after the fact, not allowed" }]);
    expect(m.reviewHistory.integrity).toBe("FAILED");
    expect(m.terms.every((t) => t.blockers.includes("REVIEW_HISTORY_INTEGRITY_FAILED") && t.latestDecision === null)).toBe(true);
    const a = await buildActivationManifest(chain, { generatedAt: "2026-11-03T20:00:00.000Z" });
    const b = await buildActivationManifest(chain, { generatedAt: "2026-11-04T20:00:00.000Z" });
    expect(a.manifestDigest).toBe(b.manifestDigest);
  });

  test("nothing activates: classification, registry and catalogs unchanged", () => {
    expect(evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS).effective).toEqual([]);
    for (const d of dossiers) expect(classifyWithGovernedExtensions({ label: d.sourceLabel, unit: d.sourceUnit }).classification.status).not.toBe("matched");
    expect(sha("data/scientific/catalog-extensions.v1.json")).toBe(SHA.extensions);
    expect(sha("data/scientific/p36-biomarker-source-registry.v1.json")).toBe(SHA.p36);
    expect(sha("data/scientific/p355-proposed-domain-catalog.v1.json")).toBe(SHA.p355);
    expect(sha("data/scientific/p40-independent-review-ledger.v1.json")).toBe(SHA.p40);
  });
});

const SHA = { extensions: "24dead3960628d0ce61fad19844bbc19462bde42866435cda44b4aed03a000e4", p36: "ce2271260428b152778ad67d1cad36306a7913dd3a4442abe3aa11ea65297148", p355: "1ee9b54a30e07da2f218d3c72d92efdef974c253f596afd0b2221669a45e3dfc", p40: "25a20bf19f1b4bc0639428d97a1ed12513eef31884803f3e5c59bea2c72e3934" };
