/**
 * P39 permanent source-aware biomarker classification and the MITO_DEMO_2026
 * 117-term domain backlog. Regression fixtures: the owner-supplied synthetic
 * source report (tests/fixtures/p39/…pdf, SHA-256 bound), the 209 submitted
 * terms (tests/fixtures/p38-mito-demo-terms.v1.json) and a read-only snapshot
 * of the 67 active demo entries. Synthetic data only; section provenance is
 * classification evidence, never scientific validation, approval or activation.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import {
  SECTION_HEADING_ALIASES,
  evidenceRegistryDocuments,
  extractGridSourceEvidence,
  extractTextSourceEvidence,
  headingDomain,
  proposeDomainFromSources,
  sectionCoverage,
  sectionForExcerpt,
  type SourceDocumentEvidence,
} from "../../src/domain/health-intelligence/source-section-classification";
import {
  awaitsSectionAcceptance,
  buildBulkDemoPreflight,
  catalogExistingMatch,
  needsDomainChoice,
  preflightCounts,
  termKey,
  type PreflightDemoEvent,
  type PreflightTermInput,
} from "../../src/domain/health-intelligence/p38-bulk-demo-preflight";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
  syntheticDemoSectionConflict,
} from "../../src/domain/health-intelligence/unknown-biomarker-review";
import {
  SYNTHETIC_DEMO_CLASSIFICATION,
  evaluateSyntheticDemoSnapshot,
  signSyntheticDemoSnapshot,
  type SyntheticDemoEntry,
  type SyntheticDemoSnapshot,
} from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import {
  installOfferedDemoCatalog,
  loadInstalledDemoCatalogs,
  resetSyntheticDemoCatalogsForTests,
} from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { generateTestSigningKey } from "../../src/domain/health-intelligence/catalog-snapshot-signing";
import type { SnapshotStorage } from "../../src/domain/health-intelligence/active-catalog-runtime";
import {
  csvCells,
  extractCsvCandidates,
  extractFiveColumnLabCandidates,
} from "../../src/domain/health-intelligence/universal-intake-parser";
import {
  extractXlsxCandidates,
  xlsxCells,
} from "../../src/domain/health-intelligence/universal-intake-adapters";
import {
  buildRegistry,
  pdfGeometryText,
  pdfSourceEvidence,
  SOURCE_PDF,
} from "../../scripts/p39-source-section-evidence";
import type { HealthDomainId } from "../../src/domain/health-domains/registry";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PDF_SHA = "59805b82bce32087e6100236138917257cb5911229409b4eb2845baead67c6ce";
const MISSION_UUID = "mission-9d8ce8f3e5554509a0885461f9ad2e1c";
const json = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const termsFixture = json("tests/fixtures/p38-mito-demo-terms.v1.json") as {
  submissions: {
    submissionId: string;
    terms: {
      termId: string;
      metadata: {
        originalLabels: string[];
        exactUnit: string;
        classification: string;
        candidateMetricIds: string[];
        sourceDocumentSha256: string[];
      };
    }[];
  }[];
};
const live = json("tests/fixtures/p39-mito-demo-live-state.v1.json") as {
  active: {
    submissionId: string;
    termId: string;
    name: string;
    unit: string;
    domain: HealthDomainId;
  }[];
  triageAccepted: string[];
};
const registryJson = json("data/source-evidence/mito-demo-2026-source-sections.v1.json");

const terms: PreflightTermInput[] = termsFixture.submissions.flatMap((s, i) =>
  s.terms.map((t) => ({
    submissionId: s.submissionId,
    termId: t.termId,
    receivedSeq: i + 1,
    originalLabels: t.metadata.originalLabels,
    exactUnit: t.metadata.exactUnit,
    classification: t.metadata.classification,
    candidateMetricIds: t.metadata.candidateMetricIds,
    sourceDocumentSha256: t.metadata.sourceDocumentSha256,
  })),
);
const events: PreflightDemoEvent[] = live.active.map((a) => ({
  submissionId: a.submissionId,
  termId: a.termId,
  demoId: `demo:${a.termId}`,
  entry: { displayName: a.name, aliases: [], unit: a.unit },
  activationEventId: `act-${a.termId}`,
  revocationEventId: null,
}));
const baseOptions = {
  triage: new Map(live.triageAccepted.map((k) => [k, "ACCEPT_FOR_REVIEW"])),
  scope: new Set(terms.map((t) => termKey(t.submissionId, t.termId))),
  events,
  existingMatch: catalogExistingMatch(MISSION_UUID),
};

let pdf: SourceDocumentEvidence;
beforeAll(async () => {
  pdf = await pdfSourceEvidence();
});

describe("source PDF: headings, sections and provenance", () => {
  test("the fixture is the exact document the 197-term submission cites", () => {
    expect(pdf.sha256).toBe(PDF_SHA);
    const cited = termsFixture.submissions[1]!.terms.every((t) =>
      t.metadata.sourceDocumentSha256.includes(PDF_SHA),
    );
    expect(cited).toBe(true);
  });

  test("all four medical domains are recognized and every declared observation has provenance", () => {
    const cov = sectionCoverage(pdf).filter((c) => c.domain);
    expect(cov.map((c) => [c.heading, c.domain, c.page, c.declaredCount, c.rows])).toEqual([
      ["BONE HEALTH", "bone", 1, 63, 63],
      ["CARDIOVASCULAR HEALTH", "cardiovascular", 3, 93, 93],
      ["IMMUNE SYSTEM", "immune", 5, 108, 108],
      ["BEHAVIORAL & PSYCHOLOGICAL HEALTH", "behavioral", 8, 100, 100],
    ]);
    expect(pdf.rows).toHaveLength(364);
    expect(pdf.rows.every((r) => r.page && r.line && r.section?.domain && r.tableHeader)).toBe(
      true,
    );
    // Page footers and repeated table headers never become rows or sections.
    expect(pdf.rows.some((r) => /ORBITAL MEDICAL/.test(r.label))).toBe(false);
    // Sections continue across pages (bone rows on pages 1–3).
    expect(
      new Set(pdf.rows.filter((r) => r.section?.domain === "bone").map((r) => r.page)),
    ).toEqual(new Set([1, 2, 3]));
  });

  test("the committed registry equals a fresh deterministic extraction and carries no values", async () => {
    expect(registryJson).toEqual(JSON.parse(JSON.stringify(await buildRegistry())));
    const docs = evidenceRegistryDocuments(registryJson);
    expect(docs).toHaveLength(1);
    expect(docs[0]!.rows.every((r) => r.excerpt === "")).toBe(true);
    const text = JSON.stringify(registryJson);
    expect(text).not.toContain("Alex Morgan");
    expect(text).not.toContain("15.93");
    expect(evidenceRegistryDocuments({ ...registryJson, schema: "other" })).toEqual([]);
    expect(
      evidenceRegistryDocuments({
        ...registryJson,
        documents: [{ ...registryJson.documents[0], rulesVersion: "v0" }],
      }),
    ).toEqual([]);
  });
});

describe("the 117-term backlog", () => {
  const rows = () =>
    buildBulkDemoPreflight(terms, {
      ...baseOptions,
      sourceDocuments: evidenceRegistryDocuments(registryJson),
    });

  test("before: the P38 baseline without source evidence", () => {
    const r = buildBulkDemoPreflight(terms, baseOptions);
    const c = preflightCounts(r);
    expect([c.total, c.already_active, r.filter(needsDomainChoice).length]).toEqual([209, 67, 117]);
    expect([c.conflicting_identity, c.ambiguous_unit, c.existing_catalog_match]).toEqual([
      2, 17, 6,
    ]);
  });

  test("after: 115 high-confidence proposals (70 cardiovascular, 45 immune); 2 remain for manual review", () => {
    const r = rows();
    const awaiting = r.filter(awaitsSectionAcceptance);
    expect(awaiting).toHaveLength(115);
    expect(awaiting.every((x) => x.sectionProposal?.confidence === "high")).toBe(true);
    const by = (d: string) => awaiting.filter((x) => x.domain === d).length;
    expect([by("cardiovascular"), by("immune"), by("bone"), by("behavioral")]).toEqual([
      70, 45, 0, 0,
    ]);
    const manual = r.filter(needsDomainChoice);
    expect(manual.map((x) => x.labels[0]).sort()).toEqual(["Hydration intake", "Sedentary time"]);
    for (const m of manual) {
      expect(m.sectionProposal?.conflict).toBe(true);
      expect(m.reasons.join(" ")).toContain("different medical sections");
    }
    // Every proposal cites its page, line and heading in the cited document.
    for (const x of awaiting) {
      const e = x.sectionProposal!.evidence[0]!;
      expect([e.documentSha256, typeof e.page, typeof e.line]).toEqual([
        PDF_SHA,
        "number",
        "number",
      ]);
      expect(e.heading).toMatch(/HEALTH|SYSTEM/);
    }
  });

  test("spot checks: exact label, unit, section and page", () => {
    const find = (label: string) => rows().find((x) => x.labels[0] === label)!;
    const troponin = find("Troponin I");
    expect([troponin.unit, troponin.domain, troponin.sectionProposal?.evidence[0]?.page]).toEqual([
      "ng/L",
      "cardiovascular",
      3,
    ]);
    const c3 = find("Complement C3");
    expect([c3.domain, c3.sectionProposal?.evidence[0]?.heading]).toEqual([
      "immune",
      "IMMUNE SYSTEM",
    ]);
    expect(find("CD4+ T cells").unit).toBe("cells/μL");
    expect(find("CD4+ T cells").domain).toBe("immune");
  });

  test("bulk acceptance makes them eligible; nothing is decided or activated", () => {
    const awaiting = rows().filter(awaitsSectionAcceptance);
    const accepted = buildBulkDemoPreflight(terms, {
      ...baseOptions,
      sourceDocuments: evidenceRegistryDocuments(registryJson),
      acceptedSectionProposals: new Set(awaiting.map((x) => x.key)),
    });
    const c = preflightCounts(accepted);
    expect(c.eligible).toBe(115);
    expect(accepted.filter((x) => x.sectionAccepted)).toHaveLength(115);
    expect([c.already_active, c.already_decided]).toEqual([67, 0]);
    expect(baseOptions.events).toHaveLength(67);
  });

  test("the 67 active entries are preserved, never re-proposed or reprocessed", () => {
    const r = rows();
    const activeKeys = new Set(live.active.map((a) => termKey(a.submissionId, a.termId)));
    const active = r.filter((x) => activeKeys.has(x.key));
    expect(active).toHaveLength(67);
    expect(active.every((x) => x.category === "already_active")).toBe(true);
    // Even an explicit acceptance or override never changes an active entry.
    const forced = buildBulkDemoPreflight(terms, {
      ...baseOptions,
      sourceDocuments: evidenceRegistryDocuments(registryJson),
      acceptedSectionProposals: activeKeys,
      overrides: new Map([...activeKeys].map((k) => [k, { domain: "behavioral" as const }])),
    });
    expect(
      forced.filter((x) => activeKeys.has(x.key)).every((x) => x.category === "already_active"),
    ).toBe(true);
  });

  test("P1NP and CTX identity conflicts stay separately reviewable", () => {
    const conflicts = rows().filter((x) => x.category === "conflicting_identity");
    expect(conflicts.map((x) => x.labels[0]).sort()).toEqual(["CTX", "P1NP"]);
    // Their source documents are not available: no section evidence can resolve them.
    expect(conflicts.every((x) => x.sectionProposal?.confidence === "none")).toBe(true);
  });

  test("ambiguous units and existing catalog matches stay excluded although their section is known", () => {
    const r = rows();
    const amb = r.filter((x) => x.category === "ambiguous_unit");
    expect(amb).toHaveLength(17);
    expect(amb.filter((x) => x.sectionProposal?.confidence === "high").length).toBe(16);
    expect(r.filter((x) => x.category === "existing_catalog_match")).toHaveLength(6);
    const accepted = buildBulkDemoPreflight(terms, {
      ...baseOptions,
      sourceDocuments: evidenceRegistryDocuments(registryJson),
      acceptedSectionProposals: new Set(r.map((x) => x.key)),
    });
    expect(accepted.filter((x) => x.category === "ambiguous_unit")).toHaveLength(17);
    expect(accepted.filter((x) => x.category === "existing_catalog_match")).toHaveLength(6);
  });

  test("a document is joined only by SHA-256: an uncited document never proposes", () => {
    const other = { ...pdf, sha256: "f".repeat(64) };
    const r = buildBulkDemoPreflight(terms, { ...baseOptions, sourceDocuments: [other] });
    expect(r.filter(awaitsSectionAcceptance)).toHaveLength(0);
  });
});

describe("classification rules and different layouts", () => {
  const meta = { sha256: "a".repeat(64), fileName: "x", kind: "text" as const };
  const propose = (
    doc: SourceDocumentEvidence,
    label: string,
    unit: string,
    refs: HealthDomainId[] = [],
  ) =>
    proposeDomainFromSources(
      { originalLabels: [label], exactUnit: unit, sourceDocumentSha256: [doc.sha256] },
      [doc],
      refs,
    );

  test("whole-heading aliases only; keywords inside a heading never assign a domain", () => {
    expect(headingDomain("BONE HEALTH | 63 observations")?.domain).toBe("bone");
    expect(headingDomain("Bone & Mineral Metabolism (continued)")?.domain).toBe("bone");
    expect(headingDomain("2. Immune System:")?.domain).toBe("immune");
    expect(headingDomain("## Behavioural Health")?.domain).toBe("behavioral");
    expect(headingDomain("Immune markers in bone")).toBeNull();
    expect(headingDomain("Cardiovascular risk of immune therapy")).toBeNull();
    expect(Object.keys(SECTION_HEADING_ALIASES).sort()).toEqual([
      "behavioral",
      "bone",
      "cardiovascular",
      "immune",
    ]);
  });

  test("missing headings: no section, no proposal", () => {
    const doc = extractTextSourceEvidence(
      "Troponin I | 4 | ng/L | 2026-11-06 | Review input",
      meta,
    );
    expect(doc.rows[0]!.section).toBeNull();
    expect(propose(doc, "Troponin I", "ng/L").prepopulate).toBe(false);
  });

  test("an unrecognized heading ends the previous section (no carry-over)", () => {
    const doc = extractTextSourceEvidence(
      [
        "CARDIOVASCULAR HEALTH",
        "Troponin I | 4 | ng/L | 2026-11-06",
        "ENDOCRINE PANEL",
        "TSH | 2.1 | mIU/L | 2026-11-06",
      ].join("\n"),
      meta,
    );
    expect(doc.rows.map((r) => r.section?.domain ?? null)).toEqual(["cardiovascular", null]);
    const p = propose(doc, "TSH", "mIU/L");
    expect([p.prepopulate, p.confidence]).toEqual([false, "low"]);
  });

  test("changed heading names, Title Case subsections, tabs and multi-space tables", () => {
    const doc = extractTextSourceEvidence(
      [
        "Section 1 – Cardiovascular",
        "Cardiac Biomarkers",
        "Test\tResult\tUnit\tDate",
        "NT-proBNP\t48\tpg/mL\t2026-11-06",
        "3. Immunology:",
        "IL-6    5.8    pg/mL    2026-11-05",
      ].join("\n"),
      meta,
    );
    expect(doc.rows.map((r) => [r.label, r.unit, r.section?.domain, r.section?.path])).toEqual([
      [
        "NT-proBNP",
        "pg/mL",
        "cardiovascular",
        ["Section 1 – Cardiovascular", "Cardiac Biomarkers"],
      ],
      ["IL-6", "pg/mL", "immune", ["3. Immunology:"]],
    ]);
    expect(propose(doc, "NT-proBNP", "pg/mL").domain).toBe("cardiovascular");
  });

  test("same label + unit in two sections is a conflict; different unit never proposes", () => {
    const doc = extractTextSourceEvidence(
      [
        "CARDIOVASCULAR HEALTH",
        "Body temperature | 36.6 | °C | 2026-11-06",
        "IMMUNE SYSTEM",
        "Body temperature | 36.9 | °C | 2026-11-06",
      ].join("\n"),
      meta,
    );
    const p = propose(doc, "Body temperature", "°C");
    expect([p.conflict, p.prepopulate, p.domain]).toEqual([true, false, null]);
    const unit = propose(doc, "Body temperature", "°F");
    expect([unit.confidence, unit.prepopulate]).toEqual(["low", false]);
  });

  test("a catalog reference naming another domain is a conflict, never resolved silently", () => {
    const doc = extractTextSourceEvidence(
      ["BONE HEALTH", "Vitamin D | 30 | ng/mL | 2026-11-06"].join("\n"),
      meta,
    );
    const p = propose(doc, "Vitamin D", "ng/mL", ["immune"]);
    expect([p.conflict, p.prepopulate]).toEqual([true, false]);
    expect(propose(doc, "Vitamin D", "ng/mL", ["bone"]).prepopulate).toBe(true);
  });

  test("a different PDF layout: the app's geometry text of the source report vs a flattened text layout", async () => {
    const { text, linePages } = await pdfGeometryText(new Uint8Array(readFileSync(SOURCE_PDF)));
    const flattened = text.replaceAll(" | ", "    ");
    const doc = extractTextSourceEvidence(flattened, { ...meta, kind: "pdf" }, linePages);
    expect(
      sectionCoverage(doc)
        .filter((c) => c.domain)
        .map((c) => c.rows),
    ).toEqual([63, 93, 108, 100]);
  });

  test("repeated imports are deterministic", async () => {
    expect(JSON.stringify(await pdfSourceEvidence())).toBe(JSON.stringify(pdf));
  });
});

describe("CSV and Excel examinations", () => {
  const csv = [
    "section,label,value,unit,collection_date",
    "Cardiovascular Health,Troponin I,4,ng/L,2026-11-06",
    "Immune System,IL-6,5.8,pg/mL,2026-11-06",
    "Unknown Panel,TSH,2.1,mIU/L,2026-11-06",
  ].join("\n");

  test("CSV section column: per-row section joined to intake candidates", () => {
    const evidence = extractGridSourceEvidence(csvCells(csv), {
      sha256: "b".repeat(64),
      fileName: "e.csv",
      kind: "csv",
    });
    const candidates = extractCsvCandidates(csv).rows;
    const sections = candidates.map((c) => sectionForExcerpt(evidence, c.excerpt));
    expect(sections.map((s) => [s.status, s.domain, s.line, s.locator])).toEqual([
      ["recognized", "cardiovascular", 2, "csv_row"],
      ["recognized", "immune", 3, "csv_row"],
      ["unrecognized_heading", null, 4, "csv_row"],
    ]);
  });

  test("CSV section rows (single-cell headings) apply to the rows below", () => {
    const grid = csvCells(
      [
        "label,value,unit,date",
        "BONE HEALTH,,,",
        "Osteocalcin,17.17,ng/mL,2026-11-06",
        "BEHAVIORAL HEALTH,,,",
        "Mission morale,2,0-10,2026-11-05",
      ].join("\n"),
    );
    const ev = extractGridSourceEvidence(grid, {
      sha256: "c".repeat(64),
      fileName: "s.csv",
      kind: "csv",
    });
    expect(ev.rows.map((r) => [r.label, r.section?.domain])).toEqual([
      ["Osteocalcin", "bone"],
      ["Mission morale", "behavioral"],
    ]);
  });

  test("XLSX first sheet with a section column", () => {
    const cell = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`;
    const rowsXml = csv
      .split("\n")
      .map(
        (line, i) =>
          `<row r="${i + 1}">${line
            .split(",")
            .map((v, j) => cell(`${"ABCDE"[j]}${i + 1}`, v))
            .join("")}</row>`,
      )
      .join("");
    const bytes = zipSync({
      "xl/worksheets/sheet1.xml": strToU8(
        `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData></worksheet>`,
      ),
    });
    const ev = extractGridSourceEvidence(xlsxCells(bytes), {
      sha256: "d".repeat(64),
      fileName: "e.xlsx",
      kind: "xlsx",
    });
    const candidates = extractXlsxCandidates(bytes).rows;
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => sectionForExcerpt(ev, c.excerpt).domain)).toEqual([
      "cardiovascular",
      "immune",
      null,
    ]);
  });

  test("PDF five-column candidates join their section by excerpt", () => {
    const sample = [
      "IMMUNE SYSTEM",
      "TEST / OBSERVATION | RESULT | UNIT / SCALE | COLLECTED | DATA FLAG",
      "IL-6 | 5.8 | pg/mL | 2026-11-05 | Review input",
    ].join("\n");
    const ev = extractTextSourceEvidence(
      sample,
      { sha256: "e".repeat(64), fileName: "p.pdf", kind: "pdf" },
      [1, 1, 1],
    );
    const [c] = extractFiveColumnLabCandidates(sample);
    expect(sectionForExcerpt(ev, c!.excerpt)).toMatchObject({
      status: "recognized",
      domain: "immune",
      page: 1,
      line: 3,
    });
  });
});

describe("automatic recognition in later examinations", () => {
  const MISSION = "MITO_DEMO_2026";
  const entry = (over: Partial<SyntheticDemoEntry> = {}): SyntheticDemoEntry => ({
    demoId: "demo:ubt-323050f4",
    displayName: "Body temperature",
    aliases: ["Body temperature"],
    unit: "°C",
    domain: "immune",
    provenance: "synthetic",
    missionId: MISSION,
    submissionId: "4fc8aee1-deb3-4f4c-9173-46c2a3401fa7",
    termId: "ubt-323050f4",
    classification: SYNTHETIC_DEMO_CLASSIFICATION,
    sourceDocumentSha256: [PDF_SHA],
    status: "ACTIVE",
    decision: {
      decisionEventId: "d1",
      decidedAt: "2026-11-07T13:00:00Z",
      entrySha256: "b".repeat(64),
    },
    activation: {
      activationEventId: "a1",
      activatedAt: "2026-11-07T13:05:00Z",
      demoCatalogVersion: 68,
    },
    revocation: null,
    ...over,
  });
  const snap = (missionId = MISSION): SyntheticDemoSnapshot => ({
    schema: "mitochondria.synthetic-demo-catalog-snapshot.v1",
    environment: "synthetic_demo",
    missionId,
    demoCatalogVersion: 68,
    issuedAt: "2026-11-07T13:06:00Z",
    entries: [entry()],
  });
  const catalogs = new Map([[MISSION, evaluateSyntheticDemoSnapshot(snap())]]);
  const row = (over: Record<string, unknown> = {}) => ({
    label: "Body temperature",
    unit: "°C",
    provenance: "synthetic" as const,
    missionId: MISSION,
    ...over,
  });
  const cls = (over: Record<string, unknown> = {}) =>
    classifyWithGovernedExtensions(row(over), undefined, undefined, catalogs).classification;

  afterAll(() => resetSyntheticDemoCatalogsForTests());

  test("compatible or absent section: recognized without any further approval", () => {
    expect(cls()).toMatchObject({
      status: "matched",
      metricId: "demo:ubt-323050f4",
      domain: "immune",
    });
    expect(cls({ sourceDomain: "immune" })).toMatchObject({ status: "matched", domain: "immune" });
  });

  test("an explicit conflicting section keeps the row review-only and explains why", () => {
    expect(cls({ sourceDomain: "cardiovascular" }).status).not.toBe("matched");
    expect(syntheticDemoSectionConflict(row({ sourceDomain: "cardiovascular" }), catalogs)).toEqual(
      {
        demoId: "demo:ubt-323050f4",
        displayName: "Body temperature",
        entryDomain: "immune",
        sourceDomain: "cardiovascular",
      },
    );
    expect(syntheticDemoSectionConflict(row({ sourceDomain: "immune" }), catalogs)).toBeNull();
  });

  test("exact unit, mission, synthetic provenance and unvalidated rows stay protected", () => {
    expect(cls({ unit: "°F" }).status).not.toBe("matched");
    expect(cls({ missionId: "OTHER_MISSION" }).status).not.toBe("matched");
    expect(cls({ provenance: "real" }).status).not.toBe("matched");
    expect(cls({ sourceValidation: "unvalidated" }).status).not.toBe("matched");
  });

  test("recognized rows create no duplicate unknown-biomarker request; conflicting rows do", () => {
    const req = (over: Record<string, unknown>) => {
      const r = classifyWithGovernedExtensions(row(over), undefined, undefined, catalogs);
      return buildUnknownBiomarkerTerms([
        {
          ...row(over),
          value: "36.8",
          observedAt: "2026-11-08",
          sourceKind: "pdf_text",
          sourceLabel: "Document",
          classification: r.classification,
          syntheticDemo: r.syntheticDemo ?? null,
        },
      ]).length;
    };
    expect(req({ sourceDomain: "immune" })).toBe(0);
    expect(req({ sourceDomain: "cardiovascular" })).toBe(1);
  });

  test("offline: the stored signed snapshot recognizes a later section-tagged row with the network cut", async () => {
    const k = await generateTestSigningKey("test-p39-offline");
    const trusted = { ...k.trusted, environment: "synthetic_demo" as const };
    const map = new Map<string, string>();
    const storage: SnapshotStorage = {
      get: (x) => map.get(x) ?? null,
      set: (x, v) => void map.set(x, v),
    };
    const opts = { storage, trustedKeys: [trusted] };
    await installOfferedDemoCatalog(
      await signSyntheticDemoSnapshot(snap(), trusted.keyId, k.privateKey),
      MISSION,
      opts,
    );
    resetSyntheticDemoCatalogsForTests();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network disabled");
    }) as unknown as typeof fetch;
    try {
      expect((await loadInstalledDemoCatalogs(opts)).loaded).toBe(1);
      expect(
        classifyWithGovernedExtensions(row({ sourceDomain: "immune" })).classification,
      ).toMatchObject({
        status: "matched",
        metricId: "demo:ubt-323050f4",
      });
      expect(
        classifyWithGovernedExtensions(row({ sourceDomain: "cardiovascular" })).classification
          .status,
      ).not.toBe("matched");
    } finally {
      globalThis.fetch = realFetch;
      resetSyntheticDemoCatalogsForTests();
    }
  });
});

describe("governance boundaries", () => {
  test("classification code never calls a server, records a decision or touches production catalogs", () => {
    const src = readFileSync(
      resolve(root, "src/domain/health-intelligence/source-section-classification.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/fetch\(|createServerFn|supabase|rpc\(/);
    const preflight = readFileSync(
      resolve(root, "src/domain/health-intelligence/p38-bulk-demo-preflight.ts"),
      "utf8",
    );
    expect(preflight).not.toMatch(/fetch\(|createServerFn|supabase|rpc\(/);
  });
  test("the registry is labelled as classification evidence, not scientific validation", () => {
    expect(registryJson.status).toContain("not scientific validation");
  });
});
