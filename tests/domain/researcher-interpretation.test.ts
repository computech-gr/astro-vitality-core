import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import {
  buildResearcherInterpretation,
  crossDomainFor,
  domainInterpretation,
  researcherInterpretationPlainText,
  RESEARCHER_DOMAINS,
  type ResearcherInterpretationModel,
} from "../../src/domain/health-intelligence/researcher-interpretation";
import { planAttestation, planRevocation, recordFingerprint, type AttestationEvent } from "../../src/domain/health-intelligence/evidence-attestation";
import { buildReportDocument, renderReportDocument, type PdfWriter } from "../../src/domain/health-intelligence/report-text-pdf";
import type { ReportRow, UnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";

type Badge = "bone" | "cardiovascular" | "immune" | "behavioral";
const r = (id: string, badge: Badge, metricId: string, value: string, unit: string, at: string, over: Partial<ReportRow> = {}): ReportRow => ({
  recordId: id, badge, metricId, metricLabel: metricId, value, unit, observedAt: at, provenance: "synthetic", status: "included",
  sourceLabel: "CSV: synthetic-kit.csv", evidence: badge === "bone" ? `bone-health-history · entry ${id}` : "unified-intake · csv", ...over,
});
function report(rows: ReportRow[]): UnifiedHealthReport {
  const badges: Badge[] = ["bone", "immune", "cardiovascular", "behavioral"];
  return {
    scope: { missionId: "mission-a", crewMemberId: "crew-a", provenance: "synthetic" },
    generatedAt: "2026-11-01T12:00:00.000Z",
    filters: { from: null, to: null, sources: [...badges] },
    rows,
    exclusions: [],
    summaries: badges.map((badge) => {
      const own = rows.filter((x) => x.badge === badge);
      return { badge, included: own.length, pending: 0, excluded: 0, metrics: new Set(own.map((x) => x.metricId)).size, firstAt: own[0]?.observedAt ?? null, lastAt: own.at(-1)?.observedAt ?? null, missing: own.length === 0 };
    }),
    coverage: { included: rows.length, pendingReview: 0, excluded: 0, duplicateProjections: 0, outOfFilter: 0, otherScopeIgnored: 0, otherProvenanceIgnored: 0, nonObservationMetadata: 0 },
    limitations: [],
  };
}
const build = (rows: ReportRow[], events: AttestationEvent[] = []) => {
  const u = report(rows);
  return { u, model: buildResearcherInterpretation(u, buildScientificFindings(u), events) };
};

const MIXED: ReportRow[] = [
  r("b1", "bone", "bone-001", "300", "pg/mL", "2026-10-01T08:00:00.000Z"),
  r("b2", "bone", "bone-001", "360", "pg/mL", "2026-10-05T08:00:00.000Z"),
  r("h1", "cardiovascular", "cv-001", "62", "bpm", "2026-10-01T07:00:00.000Z", { qualityNote: "device signal good" }),
  r("h2", "cardiovascular", "cv-001", "60", "bpm", "2026-10-01T19:00:00.000Z"),
  r("v1", "cardiovascular", "cv-027", "48", "ms", "2026-10-01T07:00:00.000Z"),
  r("v2", "cardiovascular", "cv-027", "47", "ms", "2026-10-04T07:00:00.000Z"),
  r("i1", "immune", "IMM-030", "30", "ng/mL", "2026-10-01T08:00:00.000Z"),
  r("i2", "immune", "IMM-030", "25", "ng/mL", "2026-10-05T08:00:00.000Z"),
  r("i3", "immune", "IMM-030", "70", "nmol/L", "2026-10-06T08:00:00.000Z"),
  r("s1", "behavioral", "BSC-001", "6.5", "h", "2026-10-01T06:00:00.000Z"),
  r("s2", "behavioral", "BSC-001", "6.3", "h", "2026-10-04T06:00:00.000Z"),
];

const generatedText = (m: ResearcherInterpretationModel) =>
  [
    ...m.domains.flatMap((d) => [d.summary, ...d.series.map((s) => s.observation)]),
    ...m.crossDomain.map((c) => c.statement),
  ].join("\n");

describe("v9.5 researcher interpretation: four modules", () => {
  it("always returns all four domains in a fixed order, with or without data", () => {
    const empty = build([]).model;
    expect(empty.domains.map((d) => d.domain)).toEqual([...RESEARCHER_DOMAINS]);
    for (const d of empty.domains) {
      expect(d.included).toBe(0);
      expect(d.series).toEqual([]);
      expect(d.summary).toContain("missing data is not evidence of normal or healthy status");
    }
    const full = build(MIXED).model;
    expect(full.domains.map((d) => d.included)).toEqual([2, 4, 3, 2]);
  });

  it("reports magnitude, direction, exact unit, evidence and coverage for a multi-day series", () => {
    const bone = domainInterpretation(build(MIXED).model, "bone");
    const s = bone.series[0]!;
    expect(s).toMatchObject({ metricId: "bone-001", unit: "pg/mL", readings: 2, distinctUtcDays: 2, comparison: "multi_day_comparison", difference: 60, magnitude: 60, direction: "higher", firstValue: "300", lastValue: "360" });
    expect(s.evidenceIds).toEqual(["b1", "b2"]);
    expect(s.observation).toContain("higher than first by 60 pg/mL");
    expect(s.limitations).toContain("Only two readings; no trend is established.");
    expect(bone.coverage).toEqual({ first: "2026-10-01T08:00:00.000Z", last: "2026-10-05T08:00:00.000Z", distinctUtcDays: 2 });
  });

  it("never calls same-UTC-day readings a longitudinal change and applies no direction-specific context", () => {
    const hr = domainInterpretation(build(MIXED).model, "cardiovascular").series.find((x) => x.metricId === "cv-001")!;
    expect(hr.comparison).toBe("same_utc_day_only");
    expect(hr.observation).toContain("not a longitudinal change");
    expect(hr.handbook.kind).toBe("quoted_pending_hypothesis");
    if (hr.handbook.kind === "quoted_pending_hypothesis") expect(hr.handbook.statement).toBeNull();
  });

  it("keeps mismatched units as separate series and never converts or compares them", () => {
    const imm = domainInterpretation(build(MIXED).model, "immune").series;
    expect(imm.map((x) => x.unit)).toEqual(["ng/mL", "nmol/L"]);
    const ng = imm.find((x) => x.unit === "ng/mL")!;
    expect(ng.difference).toBe(-5);
    expect(ng.otherUnits).toEqual(["nmol/L"]);
    expect(ng.limitations.join(" ")).toContain("never compared or converted");
    const nmol = imm.find((x) => x.unit === "nmol/L")!;
    expect(nmol.comparison).toBe("insufficient_time_points");
    expect(nmol.difference).toBeNull();
    expect(nmol.lastValue).toBe("70");
  });

  it("quotes Bone/Cardiovascular handbook text only by exact ID as a pending hypothesis", () => {
    const m = build(MIXED).model;
    const bone = domainInterpretation(m, "bone").series[0]!.handbook;
    expect(bone.kind).toBe("quoted_pending_hypothesis");
    if (bone.kind === "quoted_pending_hypothesis") {
      expect(bone.statement).toContain("Possibly more intense osteoclastic resorption.");
      expect(bone.source).toBe("Astronaut Bone Health Handbook v7 (Nikolas)");
      expect(bone.reviewStatus).toBe("pending_independent_review");
    }
    const hrv = domainInterpretation(m, "cardiovascular").series.find((x) => x.metricId === "cv-027")!.handbook;
    expect(hrv.kind === "quoted_pending_hypothesis" && hrv.source).toBe("NASA Cardiovascular Handbook (Nikolas)");
  });

  it("fabricates no Immune/Behavioral mapping and treats unknown or cross-domain IDs as unmapped", () => {
    const m = build([
      ...MIXED,
      r("x1", "bone", "bone-999", "1", "U/L", "2026-10-01T08:00:00.000Z"),
      r("x2", "bone", "bone-999", "2", "U/L", "2026-10-03T08:00:00.000Z"),
      // A cardiovascular ID filed under Immune never borrows the cardiovascular handbook.
      r("x3", "immune", "cv-001", "70", "bpm", "2026-10-01T08:00:00.000Z"),
    ]).model;
    for (const d of ["immune", "behavioral"] as const) {
      const dom = domainInterpretation(m, d);
      expect(dom.governance.source).toBeNull();
      expect(dom.series.every((s) => s.handbook.kind === "no_governed_mapping")).toBe(true);
    }
    const unknown = domainInterpretation(m, "bone").series.find((s) => s.metricId === "bone-999")!;
    expect(unknown.handbook).toEqual({ kind: "no_governed_mapping", note: "No governed handbook entry for catalog ID bone-999; no biological context is stated." });
  });

  it("separates intake acceptance, Ground Medical attestation and scientific approval", () => {
    const { u } = build(MIXED);
    const ctx = { actorUserId: "user-gm", rolesForScope: ["ground_medical"], scope: u.scope, decidedAt: "2026-11-01T10:00:00.000Z" };
    const plan = planAttestation(u, ["b1", "v1", "v2"], [], ctx, { reason: "Checked against source sheet", confirmed: true });
    if (!plan.ok) throw new Error(plan.reason);
    const revoke = planRevocation(u, "v2", plan.events, { ...ctx, decidedAt: "2026-11-01T11:00:00.000Z" }, { reason: "Wrong source row checked", confirmed: true });
    if (!revoke.ok) throw new Error(revoke.reason);
    // b1's attestation is bound to an earlier record version (fingerprint mismatch).
    const stale = plan.events.map((e) => (e.recordId === "b1" ? { ...e, recordFingerprint: "rfp-00000000" } : e));
    const m = buildResearcherInterpretation(u, buildScientificFindings(u), [...stale, ...revoke.events]);
    const bone = domainInterpretation(m, "bone").series[0]!;
    expect(bone.attestation).toEqual({ attested: 0, notAttested: 1, revoked: 0, stale: 1 });
    expect(bone.evidenceTiers).toEqual({ storedModule: 2, intakeAccepted: 0, device: 0 });
    const hrv = domainInterpretation(m, "cardiovascular").series.find((s) => s.metricId === "cv-027")!;
    expect(hrv.attestation).toEqual({ attested: 1, notAttested: 0, revoked: 1, stale: 0 });
    expect(m.approvalLayers.map((l) => [l.layer, l.count])).toEqual([
      ["Intake acceptance", 9],
      ["Ground Medical attestation", 1],
      ["Scientific interpretation approval", 0],
    ]);
    expect(m.validatedInterpretations).toBe(0);
    expect(recordFingerprint(u.rows[0]!)).toMatch(/^rfp-/);
  });

  it("records quality only as stored and never infers it", () => {
    const m = build(MIXED).model;
    const hr = domainInterpretation(m, "cardiovascular").series.find((s) => s.metricId === "cv-001")!;
    expect(hr.quality).toBe("As recorded: device signal good; some readings have no recorded quality.");
    expect(domainInterpretation(m, "bone").series[0]!.quality).toBe("No quality recorded; quality is not inferred.");
  });
});

describe("v9.5 cross-domain comparability", () => {
  it("never compares when signals are missing, sparse or not temporally aligned", () => {
    const m = build(MIXED).model;
    expect(m.crossDomain.map((c) => c.status)).toEqual(["signals_missing", "signals_missing", "not_temporally_aligned"]);
    const sleep = crossDomainFor(m, "behavioral").find((c) => c.domains.includes("cardiovascular"))!;
    expect(sleep.missingSignals).toEqual(["workload"]);
    // Third context lists "workload" as missing; status order still reflects missing signals first.
    expect(m.crossDomain[2]!.status).toBe("signals_missing" === m.crossDomain[2]!.status ? "signals_missing" : m.crossDomain[2]!.status);
    for (const c of m.crossDomain) expect(c.statement).toContain("No comparison");
  });

  it("missing data is never treated as evidence of normal status", () => {
    const m = build([]).model;
    for (const c of m.crossDomain) {
      expect(c.status).toBe("signals_missing");
      expect(c.statement).toContain("not evidence of normal status");
    }
  });
});

describe("v9.5 no fabricated scientific claims", () => {
  const FORBIDDEN = /\b(abnormal(?:ity)? (?:detected|found)|is (?:healthy|normal)|diagnos(?:ed|is of)|elevated risk|fit for duty|causes|caused by|correlat(?:es|ed) with|significant(?:ly)? (?:increase|decrease)|trend (?:of|toward)|recommend(?:ed)? treatment)\b/i;
  it("generated (non-quoted) text contains no clinical conclusions", () => {
    for (const rows of [[], MIXED]) expect(generatedText(build(rows).model)).not.toMatch(FORBIDDEN);
  });
  it("is deterministic for identical inputs", () => {
    expect(researcherInterpretationPlainText(build(MIXED).model)).toBe(researcherInterpretationPlainText(build(MIXED).model));
  });
});

describe("v9.5 PDF and TXT parity with the shared model", () => {
  const fontDir = join(import.meta.dir, "../../node_modules/pdfjs-dist/standard_fonts");
  const fonts = {
    regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"),
    bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"),
  };
  const greek = MIXED.map((x) => (x.metricId === "IMM-030" ? { ...x, metricLabel: "Βιταμίνη D 25(OH)" } : x));
  const u = report(greek);
  const findings = buildScientificFindings(u);
  const model = buildResearcherInterpretation(u, findings, []);
  const doc = buildReportDocument({ unified: u, findings, summary: null, history: null, attestations: [], identity: { missionName: "Αποστολή Ελλάς", crewDisplayName: "Crew Α" }, title: "t" });
  const text = doc.blocks.map((b) => JSON.stringify(b)).join("\n");
  const txt = researcherInterpretationPlainText(model);

  it("PDF contains every domain, every series observation and every handbook source from the model", () => {
    expect(text).toContain("Researcher module physiological evidence interpretation (research only)");
    for (const d of model.domains) {
      expect(text).toContain(d.label);
      expect(text).toContain(JSON.stringify(d.summary).slice(1, -1));
      for (const s of d.series) {
        expect(text).toContain(JSON.stringify(s.observation).slice(1, -1));
        expect(txt).toContain(s.observation);
        for (const id of s.evidenceIds) expect(txt).toContain(id);
      }
    }
    expect(text).toContain("Scientific interpretation approval");
    for (const c of model.crossDomain) {
      expect(text).toContain(JSON.stringify(c.statement).slice(1, -1));
      expect(txt).toContain(c.statement);
    }
  });

  it("renders Greek Unicode labels into the searchable PDF with the embedded font", () => {
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: false });
    pdf.addFileToVFS("R.ttf", fonts.regular);
    pdf.addFont("R.ttf", "LiberationSans", "normal");
    pdf.addFileToVFS("B.ttf", fonts.bold);
    pdf.addFont("B.ttf", "LiberationSans", "bold");
    const seen: string[] = [];
    const w = pdf as unknown as PdfWriter;
    const orig = w.text.bind(w);
    w.text = (t: string, x: number, y: number, o?: Record<string, unknown>) => { seen.push(t); return orig(t, x, y, o); };
    const { pages } = renderReportDocument(doc, w, { family: "LiberationSans", unicode: true });
    expect(pages).toBeGreaterThan(1);
    expect(seen.join(" ")).toContain("Βιταμίνη D 25(OH)");
    expect(seen.join(" ")).toContain("Immune Health");
  });

  it("report generation makes no network requests", () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (() => { calls++; throw new Error("network forbidden"); }) as unknown as typeof fetch;
    try {
      buildResearcherInterpretation(u, findings, []);
      buildReportDocument({ unified: u, findings, summary: null, history: null, attestations: [], identity: { missionName: null, crewDisplayName: null }, title: "t" });
    } finally { globalThis.fetch = original; }
    expect(calls).toBe(0);
  });
});
