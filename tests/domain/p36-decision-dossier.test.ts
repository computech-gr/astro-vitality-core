import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import { canonicalJson } from "@/domain/health-intelligence/observation-envelope";
import { buildDecisionDossier, verifyDecisionDossier, type DecisionDossier } from "@/domain/health-intelligence/p36-decision-dossier";
import { buildDecisionDossierDocument, createDecisionDossierPdf } from "@/domain/health-intelligence/p36-decision-dossier-pdf";
import { buildScientificReviewDossiers, buildScientificReviewEntry, MANIFEST_SOURCE_ARTIFACTS } from "@/domain/health-intelligence/p36-scientific-review";
import { renderReportDocument, type PdfWriter, type ReportFonts } from "@/domain/health-intelligence/report-text-pdf";
import { REQUIRED_SCIENTIFIC_GATE } from "@/domain/health-intelligence/unknown-biomarker-review";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fontDir = join(root, "node_modules/pdfjs-dist/standard_fonts");
const fonts: ReportFonts = {
  regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
  bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
};
const t = (d: DecisionDossier, label: string) => d.terms.find((x) => x.sourceLabel === label)!;

describe("P36 scientific decision dossier", () => {
  test("covers all 12 terms, every one pending, blocked and unapproved", async () => {
    const d = await buildDecisionDossier([]);
    expect(d.terms).toHaveLength(12);
    expect(d.decisionMatrix).toHaveLength(12);
    expect(d.counts).toMatchObject({ terms: 12, observations: 36, blocked: 12 });
    expect(d.status).toBe(REQUIRED_SCIENTIFIC_GATE);
    expect(d.activationAllowed).toBe(false);
    expect(d.scientificApprovals).toBe(0);
    for (const term of d.terms) {
      expect(term.status).toBe(REQUIRED_SCIENTIFIC_GATE);
      expect(term.activationAllowed).toBe(false);
      expect(term.blockers.length).toBeGreaterThan(0);
      for (const id of ["IDENTITY", "SPECIMEN", "METHOD", "PROTOCOL", "UNIT", "EVIDENCE"]) expect(term.requiredDecisions.some((r) => r.id === id)).toBe(true);
      expect(term.sourceReferences[0]!.ref).toBe(`handoff:${term.termId}`);
    }
  });

  test("never invents methods, protocols, units or validation", async () => {
    const d = await buildDecisionDossier([]);
    for (const term of d.terms) {
      expect(term.fields.assayOrMethod.basis).toBe("NOT_IN_SOURCES");
      expect(["NOT_IN_SOURCES", "NOT_VALIDATED"]).toContain(term.fields.protocol.basis);
      expect(term.fields.candidateCatalogUnit.basis).toBe("NOT_VALIDATED");
      expect(term.fields.sourceUnit).toEqual({ value: term.fields.sourceUnit.value, basis: "VERIFIED_SOURCE_FACT", refs: [`handoff:${term.termId}`] });
      expect(term.unresolvedAssumptions.some((a) => a.includes("method is unknown"))).toBe(true);
    }
    expect(d.counts.missingMethods).toBe(12);
    expect(t(d, "BSC-008").fields.protocol.basis).toBe("NOT_VALIDATED");
    expect(t(d, "PVT_MEDIAN_RT").fields.protocol.basis).toBe("NOT_VALIDATED");
    expect(t(d, "BSC-008").requiredDecisions.some((r) => r.id === "VALIDATION")).toBe(true);
    expect(t(d, "PVT_MEDIAN_RT").requiredDecisions.some((r) => r.id === "VALIDATION")).toBe(true);
  });

  test("facts cite exact sources; specimen is only what the handbook states", async () => {
    const d = await buildDecisionDossier([]);
    const known = new Set(buildScientificReviewDossiers().dossiers.flatMap((x) => x.evidence.map((e) => e.ref)));
    for (const term of d.terms) for (const r of term.sourceReferences.slice(1)) expect(known.has(r.ref)).toBe(true);
    expect(t(d, "Urinary Calcium 24h").fields.specimen).toMatchObject({ basis: "VERIFIED_SOURCE_FACT", refs: ["handbook:bone-015"] });
    expect(t(d, "Urinary Calcium 24h").fields.specimen.value).toContain("24-hour urine");
    expect(t(d, "IMM-001").fields.specimen.basis).toBe("NOT_IN_SOURCES");
    expect(t(d, "CTX").verifiedFacts.some((f) => f.statement.includes('"ng/L"') && f.statement.includes("differs"))).toBe(true);
  });

  test("conflicts and gaps are explicit", async () => {
    const d = await buildDecisionDossier([]);
    const vitD = t(d, "25(OH) Vitamin D");
    expect(vitD.fields.proposedCanonicalIdentity.basis).toBe("CONFLICTING_SOURCES");
    expect(vitD.fields.domain).toMatchObject({ basis: "CONFLICTING_SOURCES" });
    expect(vitD.requiredDecisions.some((r) => r.id === "DOMAIN")).toBe(true);
    expect(t(d, "CTX").fields.proposedCanonicalIdentity.basis).toBe("UNRESOLVED");
    expect(t(d, "P1NP").fields.proposedCanonicalIdentity.basis).toBe("UNRESOLVED");
    expect(t(d, "IMM-007").requiredDecisions.some((r) => r.id === "RELATION" && r.text.includes("RELATED_BUT_NOT_INTERCHANGEABLE"))).toBe(true);
    expect(t(d, "Urinary Calcium 24h").requiredDecisions.some((r) => r.id === "SOURCE")).toBe(true);
    expect(t(d, "IMM-001").fields.proposedCanonicalIdentity.basis).toBe("PROPOSED_UNCONFIRMED");
    expect(d.counts.conflicts).toBe(1);
    const unitRow = d.decisionMatrix.find((r) => r.sourceLabel === "P1NP")!;
    expect(unitRow.unit).toContain("no conversion");
  });

  test("JSON integrity: digest is stable, tampering and approval claims are detected", async () => {
    const a = await buildDecisionDossier([], { generatedAt: "2026-11-03T20:00:00.000Z" });
    const b = await buildDecisionDossier([], { generatedAt: "2026-11-04T08:00:00.000Z" });
    expect(a.integrity.contentDigest).toBe(b.integrity.contentDigest);
    const exported = JSON.parse(JSON.stringify(a));
    expect(await verifyDecisionDossier(exported)).toEqual({ ok: true, problems: [], sourcesCurrent: true });
    const edited = JSON.parse(JSON.stringify(a));
    edited.terms[0].fields.assayOrMethod.value = "LC-MS/MS";
    expect((await verifyDecisionDossier(edited)).ok).toBe(false);
    const approved = JSON.parse(JSON.stringify(a));
    approved.status = "APPROVED";
    approved.terms[1].blockers = [];
    const v = await verifyDecisionDossier(approved);
    expect(v.ok).toBe(false);
    expect(v.problems.length).toBeGreaterThanOrEqual(2);
    expect((await verifyDecisionDossier({ schema: "other" })).ok).toBe(false);
  });

  test("source artifact digests match the committed files", async () => {
    const d = await buildDecisionDossier([]);
    expect(d.integrity.sourceArtifactDigests.map((s) => s.path)).toEqual([...MANIFEST_SOURCE_ARTIFACTS]);
    const { createHash } = await import("node:crypto");
    for (const s of d.integrity.sourceArtifactDigests) {
      const content = JSON.parse(readFileSync(join(root, s.path), "utf8"));
      expect(createHash("sha256").update(canonicalJson(content)).digest("hex")).toBe(s.canonicalSha256);
    }
    expect(d.integrity.sourceIntegrity).toBe("VERIFIED");
  });

  test("a worksheet entry is shown as documentary and changes nothing else", async () => {
    const dossier = buildScientificReviewDossiers().dossiers.find((x) => x.sourceLabel === "IMM-002")!;
    const r = await buildScientificReviewEntry(
      { termId: dossier.termId, decision: "NEEDS_MORE_EVIDENCE", evidenceRefs: ["p40:IMM-NIK-002"], rationale: "Analyzer method and specimen must be supplied.", reviewerName: "Reviewer", reviewerQualification: "PhD", independenceConfirmed: true },
      dossier, [], { userId: "u1", roles: ["ground_medical"], recordedAt: "2026-11-03T20:00:00.000Z" },
    );
    if (!r.ok) throw new Error(r.reason);
    const d = await buildDecisionDossier([r.entry]);
    const term = t(d, "IMM-002");
    expect(term.latestWorksheetEntry?.note).toContain("not a scientific approval");
    expect(term.status).toBe(REQUIRED_SCIENTIFIC_GATE);
    expect(d.scientificApprovals).toBe(0);
    expect(d.integrity.reviewHistory.entries).toBe(1);
  });
});

describe("P36 decision dossier PDF", () => {
  test("searchable multi-page PDF with matrix, all terms, blockers and digest", async () => {
    const d = await buildDecisionDossier([], { generatedAt: "2026-11-03T20:00:00.000Z" });
    const doc = buildDecisionDossierDocument(d);
    const matrix = doc.blocks.find((b) => b.kind === "table" && b.columns[0]!.title === "Term (unit)");
    expect(matrix?.kind === "table" && matrix.rows.length).toBe(12);
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: false });
    renderReportDocument(doc, pdf as unknown as PdfWriter, { family: "helvetica", unicode: false });
    const raw = pdf.output();
    expect(raw).toContain("Decision matrix");
    expect(raw).toContain(d.integrity.contentDigest.slice(0, 32));
    for (const term of d.terms) expect(raw).toContain(term.termId);
    expect(raw).not.toContain("/Subtype /Image");
    const result = await createDecisionDossierPdf(d, { fonts });
    expect(result.fontMode).toBe("unicode");
    expect(result.pages).toBeGreaterThanOrEqual(14);
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(new TextDecoder("latin1").decode(bytes)).toContain("/ToUnicode");
  });
});
