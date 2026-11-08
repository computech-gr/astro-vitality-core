/**
 * P60 — cross-domain clinical patterns, observation census, premium-report integration and real jsPDF rendering.
 * All data are synthetic test fixtures. The Alex Morgan export fixture is reconstructed from the P59 PDF
 * (identities inferred, see tests/support/p60-fixtures.ts) and is NOT proof that stored data were processed.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";
import library from "../../data/scientific/p60-clinical-pattern-library.v1.json";
import cvCatalog from "../../data/scientific/cardiovascular-handbook.catalog.v1.json";
import demoCatalog from "../fixtures/p40-mito-demo-active-catalog.v1.json";
import { evaluateClinicalPatterns, patternLibrary, type PatternRow } from "../../src/domain/health-intelligence/p60-clinical-patterns";
import { observationCensus, observationCensusText, sha256HexSync, canonicalCensusLines } from "../../src/domain/health-intelligence/p60-observation-census";
import { renderPremium, renderPremiumReport, transliterateScripts, mapLayout, type PremiumWriter } from "../../src/domain/health-intelligence/p59-premium-pdf";
import { readAllOfflineRecords } from "../../src/domain/health-intelligence/unified-health-report-loader";
import { DOSE_PATTERN } from "../../src/domain/health-intelligence/p58-clinical-reasoning";
import { SvgPdfWriter } from "../support/svg-pdf-writer";
import { premiumFrom, smallNormal, complexAbnormal, MITO_DEMO_MISSION_ID, o } from "../support/p59-fixtures";
import { alexNovemberExport, largeSynthetic, ALEX_NOVEMBER_EXPORT_ROWS } from "../support/p60-fixtures";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const demo = { provisional: true, mappings: true, missionId: MITO_DEMO_MISSION_ID };
const D1 = premiumFrom(alexNovemberExport(), demo);
const OFF = premiumFrom(alexNovemberExport(), { missionId: MITO_DEMO_MISSION_ID });
const REAL = premiumFrom(alexNovemberExport(), { ...demo, provenance: "real" });
const byId = (r: typeof D1, id: string) => r.patterns.patterns.find((p) => p.id === id);

const cvUnits = (() => {
  const m = new Map<string, string>();
  const walk = (x: unknown): void => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      const r = x as Record<string, unknown>;
      if (typeof r["id"] === "string" && /^cv-\d+$/.test(r["id"]) && typeof r["unit"] === "string") m.set(r["id"], r["unit"]);
      Object.values(r).forEach(walk);
    }
  };
  walk(cvCatalog);
  return m;
})();
const demoUnits = new Map((demoCatalog as { entries: { demoId: string; unit: string }[] }).entries.map((e) => [e.demoId, e.unit]));

/** Minimal PatternRow builder for rule tests. */
let seq = 0;
const row = (metricId: string, unit: string, valueText: string, date: string, over: Partial<PatternRow> = {}): PatternRow => ({
  recordId: `r${++seq}`, metricId, unit, valueText, date, name: metricId, displayClass: "NEUTRAL", basis: "none", bandLabel: null, reviewHigh: false, held: false, ...over,
});

describe("P60 pattern library — governance and identity integrity", () => {
  it("validates, is pending Researcher review and binds every member to an exact catalog identity + unit", () => {
    const lib = patternLibrary()!;
    expect(lib).not.toBeNull();
    expect(lib.status).toContain("PENDING_RESEARCHER_REVIEW");
    for (const c of lib.concepts)
      for (const m of c.members) {
        const unit = m.id.startsWith("cv-") ? cvUnits.get(m.id) : m.id.startsWith("demo:") ? demoUnits.get(m.id) : undefined;
        expect({ id: m.id, unit }).toEqual({ id: m.id, unit: m.unit });
      }
  });
  it("every threshold and priority rule cites a listed source; no NASA or approval claims", () => {
    const lib = patternLibrary()!;
    const ids = new Set(lib.sources.map((s) => s.id));
    for (const t of Object.values(lib.thresholds)) expect(ids.has(String((t as { sourceId: string }).sourceId))).toBe(true);
    expect(lib.priorityRules.map((r) => r.id)).toEqual(["PP-1", "PP-2", "PP-3", "PP-4", "PP-5"]);
    expect(lib.note ?? (library as { note: string }).note).toContain("nothing here is a NASA flight rule, a Researcher-approved criterion or a diagnosis");
    expect(JSON.stringify(lib.thresholds)).not.toMatch(/NASA|approved/i);
  });
  it("fails closed on an ambiguous library (one identity in two concepts) or a wrong schema", () => {
    const bad = structuredClone(library) as typeof library;
    bad.concepts[1]!.members.push({ id: "cv-070", unit: "mmol/L" });
    expect(patternLibrary(bad)).toBeNull();
    const r = evaluateClinicalPatterns([row("cv-070", "mmol/L", "120", "2026-11-07", { displayClass: "RED", basis: "provisional" })], { active: true, library: bad });
    expect(r.active).toBe(false);
    expect(r.patterns).toEqual([]);
    expect(r.basis).toContain("fail closed");
    expect(patternLibrary({ ...library, schema: "other" })).toBeNull();
  });
});

describe("P60 engine — activation boundary", () => {
  it("is inactive without synthetic demonstration mode, for real provenance and with provisional mode off", () => {
    expect(OFF.patterns.active).toBe(false);
    expect(OFF.patterns.patterns).toEqual([]);
    expect(OFF.patternAlerts).toBeNull();
    expect(REAL.patterns.active).toBe(false);
    expect(REAL.patternAlerts).toBeNull();
    expect(REAL.rows.every((r) => r.basis === "none")).toBe(true);
  });
  it("never changes a result's clinical class", () => {
    const withP = D1.rows.map((r) => `${r.recordId}|${r.displayClass}|${r.basis}`);
    const lib = structuredClone(library) as typeof library;
    lib.schema = "disabled";
    const without = premiumFrom(alexNovemberExport(), demo).rows; // same inputs, independent build
    expect(withP.length).toBe(without.length);
    expect(D1.rows.map((r) => r.displayClass).sort()).toEqual(without.map((r) => r.displayClass).sort());
  });
});

describe("P60 engine — Alex Morgan export fixture (97 observations)", () => {
  it("uses every observation exactly once and records a census", () => {
    expect(ALEX_NOVEMBER_EXPORT_ROWS.length).toBe(97);
    expect(D1.rows.length).toBe(97);
    expect(D1.census.observations).toBe(97);
    expect(D1.census.dates).toEqual(["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  });
  it("finds the acute physiological pattern (NEWS2 3-point bands + fever + CRP) as HIGH via PP-1 and PP-2", () => {
    const p = byId(D1, "p60-acute-physiology")!;
    expect(p.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
    expect(p.rules).toEqual(["PP-1", "PP-2"]);
    const obs = p.observed.join(" ");
    for (const s of ["Respiratory rate 26 breaths/min", "91 %", "88 mmHg", "38.8 °C", "28 mg/L", "Lactate 4.2 mmol/L"]) expect(obs).toContain(s);
    expect(p.supporting.join(" ")).toContain("2 of the 3 qSOFA criteria");
    expect(p.missing.join(" ")).toContain("mentation");
    expect(p.missing.join(" ")).toContain("White-cell count");
    expect(p.contradicting.join(" ")).toContain("97 mmHg");
  });
  it("links QTc 510 ms with potassium 3.2 mmol/L (PP-2) and the 18 mmol/L sodium change (PP-3) with a DATA CHECK", () => {
    const p = byId(D1, "p60-electrolytes")!;
    expect(p.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
    expect(p.rules).toEqual(["PP-3", "PP-2"]);
    expect(p.dataCheck).toBe(true);
    expect(p.measurement.join(" ")).toContain("pseudohyperkalaemia");
    expect(p.pattern).toContain("recorded on different days");
    expect(p.confirm[0]).toBe("Do not change fluid, salt or potassium intake before Ground Medical review.");
  });
  it("raises D-dimer to HIGH only through convergence with low SpO2 / fast breathing, never recommending imaging by itself", () => {
    const p = byId(D1, "p60-coagulation")!;
    expect(p.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
    expect(p.contradicting.join(" ")).toContain("alternative reason");
    expect(p.confirm.join(" ")).toContain("imaging only if the clinician judges it indicated");
    expect(JSON.stringify(D1.patterns)).not.toMatch(/imaging is recommended/i);
  });
  it("keeps HbA1c as a DATA CHECK, and lipids, cardiac, bone and recovery as MONITORING", () => {
    expect(byId(D1, "p60-hba1c-check")!.priority).toBe("DATA_CHECK");
    for (const id of ["p60-lipids", "p60-cardiac", "p60-bone", "p60-recovery"]) expect(byId(D1, id)!.priority).toBe("MONITORING");
    expect(byId(D1, "p60-lipids")!.pattern).toContain("peaked on 7 Nov");
    expect(byId(D1, "p60-cardiac")!.contradicting.join(" ")).toContain("below the acute-setting threshold");
  });
  it("states no diagnosis, no dose and conditions every investigation on Ground Medical", () => {
    for (const p of D1.patterns.patterns) {
      const text = [p.pattern, ...p.observed, ...p.hypotheses, ...p.confirm].join(" ");
      expect(text).not.toMatch(/\b(?:has|confirms?|diagnosed with|consistent with a diagnosis of) (?:sepsis|pneumonia|pulmonary embolism|heart failure|hyperkalaemia|hyponatraemia)\b/i);
      expect(DOSE_PATTERN.test(text)).toBe(false);
      for (const c of p.confirm.filter((x) => /repeat|ECG|imaging|echocardiogram|test/i.test(x))) expect(c).toMatch(/Ground Medical|clinician/);
      for (const h of p.hypotheses) expect(h.startsWith("Hypothesis:")).toBe(true);
    }
  });
  it("links patterns with labelled kinds; established links carry a source", () => {
    const e = D1.patternGraph.edges;
    expect(e.find((x) => x.to === "p60-lipids")?.kind).toBe("established");
    expect(e.filter((x) => x.kind === "established").every((x) => x.sourceId)).toBe(true);
    expect(e.find((x) => x.to === "p60-electrolytes")?.kind).toBe("co-occurrence");
    expect(new Set(e.map((x) => [x.from, x.to].sort().join("|"))).size).toBe(e.length);
  });
});

describe("P60 engine — convergence rules", () => {
  const d = "2026-11-07";
  const run = (rows: PatternRow[]) => evaluateClinicalPatterns(rows, { active: true }).patterns;
  it("PP-1: a single NEWS2 3-point vital sign is HIGH; a 2-point one alone is MONITORING", () => {
    expect(run([row("demo:ubt-f4b8be7b", "breaths/min", "26", d)])[0]!.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
    expect(run([row("demo:ubt-f4b8be7b", "breaths/min", "22", d)])[0]!.priority).toBe("MONITORING");
  });
  it("PP-2: QTc above 500 ms alone is MONITORING; with potassium < 3.5 mmol/L within a day it is HIGH", () => {
    expect(run([row("cv-032", "ms", "510", d)])[0]!.priority).toBe("MONITORING");
    expect(run([row("cv-032", "ms", "500", d)])).toEqual([]); // AHA/ACCF 2010: above 500 ms
    expect(run([row("cv-032", "ms", "510", d), row("cv-071", "mmol/L", "3.2", "2026-11-08", { displayClass: "AMBER", basis: "provisional" })])[0]!.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
    expect(run([row("cv-032", "ms", "510", d), row("cv-071", "mmol/L", "3.2", "2026-11-10", { displayClass: "AMBER", basis: "provisional" })])[0]!.priority).toBe("MONITORING");
  });
  it("PP-2: fever alone is MONITORING; fever with CRP > 10 mg/L is HIGH", () => {
    expect(run([row("demo:ubt-323050f4", "°C", "38.8", d)])[0]!.priority).toBe("MONITORING");
    expect(run([row("demo:ubt-323050f4", "°C", "38.8", d), row("cv-091", "mg/L", "28", d)])[0]!.priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
  });
  it("binds QTc through either the catalog or the demo identity, never through a different unit or an unknown identity", () => {
    expect(run([row("demo:ubt-33eb23f7", "ms", "510", d), row("cv-071", "mmol/L", "3.1", d, { displayClass: "AMBER", basis: "provisional" })])[0]!.title).toContain("QTc");
    expect(run([row("cv-032", "s", "0.51", d)])).toEqual([]);
    expect(run([row("fixture:unknown-qtc", "ms", "530", d)])).toEqual([]);
  });
  it("held results never support a pattern; non-numeric values are ignored", () => {
    expect(run([row("demo:ubt-f4b8be7b", "breaths/min", "30", d, { held: true })])).toEqual([]);
    expect(run([row("demo:ubt-f4b8be7b", "breaths/min", "high", d)])).toEqual([]);
  });
  it("missing clinical context is listed rather than assumed", () => {
    const p = run([row("demo:ubt-f4b8be7b", "breaths/min", "26", d)])[0]!;
    expect(p.missing.join(" ")).toContain("Lactate — not recorded");
    expect(p.missing.join(" ")).toContain("White-cell count and differential — not recorded");
  });
  it("a small normal dataset produces no pattern", () => {
    expect(premiumFrom(smallNormal(), demo).patterns.patterns).toEqual([]);
  });
});

describe("P60 observation census", () => {
  it("matches a reference SHA-256 implementation and is order-independent", () => {
    for (const t of ["", "abc", "a".repeat(1000), "SpO₂ 91 % · 38.8 °C"]) expect(sha256HexSync(t)).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
    const rows = D1.rows.map((r) => ({ metricId: r.metricId, unit: r.unit, date: r.date, valueText: r.valueText, provenance: "synthetic" }));
    const a = observationCensus(rows), b = observationCensus([...rows].reverse());
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).toBe(createHash("sha256").update(`p60-observation-census.v1\n${canonicalCensusLines(rows).join("\n")}`, "utf8").digest("hex"));
    expect(D1.census.sha256).toBe(a.sha256);
  });
  it("the census text lists exactly the lines the digest covers", () => {
    const rows = D1.rows.map((r) => ({ metricId: r.metricId, unit: r.unit, date: r.date, valueText: r.valueText, provenance: "synthetic" }));
    const t = observationCensusText(rows, { mission: "MITO_DEMO_2026", crew: "Alex Morgan", period: "2026-11-01 to 2026-11-08" });
    const lines = t.trim().split("\n");
    expect(lines[3]).toBe(`SHA-256: ${D1.census.sha256}`);
    expect(lines.slice(5)).toEqual(canonicalCensusLines(rows));
    expect(lines.length).toBe(5 + 97);
  });
  it("the export fixture census is pinned (equality with the stored dataset proves the fixture matches it)", () => {
    expect(D1.census.sha256).toBe("8bb1433624cabbcca7e284b8f4a1fad296e3bbb09eb3cd7d17f4a38ab6458c28");
  });
  it("changes when any stored value changes", () => {
    const rows = D1.rows.map((r) => ({ metricId: r.metricId, unit: r.unit, date: r.date, valueText: r.valueText, provenance: "synthetic" }));
    const changed = rows.map((r, i) => (i === 0 ? { ...r, valueText: `${r.valueText}1` } : r));
    expect(observationCensus(changed).sha256).not.toBe(observationCensus(rows).sha256);
  });
});

describe("P60 loader coverage", () => {
  const recs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, sourceId: "x", mission: { missionId: "m", crewMemberId: "c" }, payload: null, createdAt: "2026-11-01T00:00:00Z", eventTimestamp: "2026-11-01T00:00:00Z" }));
  it("reads every stored record beyond 1000 when the store can count them", async () => {
    const all = recs(1500);
    let asked = 0;
    const store = { countRecords: async () => all.length, list: async (limit = 200) => { asked = limit; return all.slice(0, limit); } };
    const r = await readAllOfflineRecords(store as never);
    expect(asked).toBe(1500);
    expect(r.records.length).toBe(1500);
    expect(r.coverage).toEqual({ source: "device-local-encrypted-store", storedRecords: 1500, readRecords: 1500, complete: true });
  });
  it("reports unknown completeness for stores without a count", async () => {
    const r = await readAllOfflineRecords({ list: async () => recs(3) } as never);
    expect(r.coverage.complete).toBeNull();
    expect(r.coverage.storedRecords).toBeNull();
  });
  it("bone/immune/cardiovascular/behavioral entries are read count-based (no newest-1000 cut-off)", () => {
    const src = readFileSync(join(ROOT, "src/domain/bone-health/history.ts"), "utf8");
    expect(src).toContain("store.list(Math.max(1000, total))");
    expect(src).not.toContain("getOfflineMissionStore().list(1000)");
  });
});

describe("P60 premium model integration", () => {
  it("page-1 cards come from patterns (HIGH first, then the overflow card) while P59 alerts stay unchanged", () => {
    const cards = D1.patternAlerts!;
    expect(cards.slice(0, 3).every((c) => c.priority === "HIGH_PRIORITY_MEDICAL_REVIEW")).toBe(true);
    expect(cards.length).toBe(4);
    expect(cards[3]!.findingIds.length).toBe(5);
    expect(cards[3]!.evidence.split("\n").length).toBe(5);
    expect(D1.alerts.length).toBeGreaterThan(0);
  });
  it("defers exercise advice during an acute high-priority pattern and puts pattern actions first", () => {
    const ex = D1.recommendations.find((c) => c.column === "Exercise")!;
    expect(ex.items.map((i) => i.id)).toEqual(["p60:defer-exercise"]);
    expect(D1.overview.find((q) => q.question === "What should the astronaut do?")!.answer).toContain("Do not start or change supplements or exercise");
    const med = D1.recommendations.find((c) => c.column === "Medical follow-up")!;
    expect(med.items[0]!.id.startsWith("p60:")).toBe(true);
    expect(med.items.every((i) => i.basis.length > 0)).toBe(true);
  });
  it("results-table notes explain markers once; compact criterion text never repeats long conditions", () => {
    expect(D1.tableNotes[0]).toContain("No applicable criterion");
    expect(D1.rows.every((r) => r.criterionShort.length < 90)).toBe(true);
    expect(D1.rows.filter((r) => r.notes.includes("§")).map((r) => r.metricId).sort()).toEqual(["demo:ubt-7b25ce69", "demo:ubt-7b25ce69", "demo:ubt-efe7e2fb"]);
  });
  it("every P58 concern is either represented by a pattern or rendered on its own", () => {
    for (const c of D1.concerns) expect(D1.coveredConcerns.includes(c.concernId) || !Object.values(D1.patternConcerns).flat().includes(c.concernId)).toBe(true);
  });
  it("large datasets keep every observation once", () => {
    const L = premiumFrom(largeSynthetic(), demo);
    expect(L.rows.length).toBe(largeSynthetic().length);
    expect(new Set(L.rows.map((r) => r.recordId)).size).toBe(L.rows.length);
  });
});

describe("P60 renderer", () => {
  it("transliterates sub/superscript digits the embedded font lacks", () => {
    expect(transliterateScripts("SpO₂ 91 %")).toBe("SpO2 91 %");
    expect(transliterateScripts("dyn·s/cm⁵")).toBe("dyn·s/cm^5");
    expect(transliterateScripts("g/cm² and m³")).toBe("g/cm² and m³");
    expect(transliterateScripts("cm⁻⁵")).toBe("cm^-5");
  });
  it("map layout puts the most-connected pattern in the centre and never reuses a cell", () => {
    const nodes = D1.patternGraph.nodes, lay = mapLayout(nodes, D1.patternGraph.edges);
    expect(lay.length).toBe(nodes.length);
    expect(new Set(lay.map((p) => `${p.col},${p.row}`)).size).toBe(lay.length);
    expect(lay[0]!.id).toBe("p60-acute-physiology");
  });
  const svg = (r: typeof D1) => {
    const w = new SvgPdfWriter();
    const { pages } = renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true });
    return { w, pages, text: w.texts.map((t) => t.text).join("\n") };
  };
  it("renders patterns, the map legend, structured assessments, census and references", () => {
    const { text } = svg(D1);
    for (const s of ["Most important findings", "Fever and inflammation with abnormal vital signs", "Overall picture", "MEASUREMENT", "MISSING CONTEXT", "CLINICAL PATTERN", "References for the cross-domain patterns", "Census p60-observation-census.v1", D1.census.sha256, "SpO2"]) expect(text).toContain(s);
    expect(text).not.toContain("SpO₂");
    // Generated text only: recorded values (e.g. "86 mL" end-diastolic volume) and the fixed no-dose disclaimers are excluded.
    const values = new Set(D1.rows.map((r) => `${r.valueText} ${r.unit}`));
    const generated = svg(D1).w.texts.map((t) => t.text).filter((t) => !values.has(t) && !/supplement doses are given|medication or dose advice/i.test(t));
    expect(generated.filter((t) => DOSE_PATTERN.test(t))).toEqual([]);
  });
  it("no orphan heading, no clipped text, footer numbering consistent (SVG writer geometry)", () => {
    for (const r of [D1, premiumFrom(smallNormal(), demo), premiumFrom(complexAbnormal(), demo), OFF]) {
      const { w, pages } = svg(r);
      const t = w.texts;
      expect(t.filter((x) => x.size >= 14 && x.y > 279 - 25 && x.y < 279).length).toBe(0);
      expect(t.every((x) => x.x >= 12.5 && x.y >= 6 && x.y <= 291)).toBe(true);
      expect(t.filter((x) => /^Page \d+ of \d+$/.test(x.text)).length).toBe(pages);
    }
  });
  it("renders with the real jsPDF 4 engine (pages dynamic, deterministic bytes with a fixed date)", async () => {
    const fontDir = join(ROOT, "node_modules/pdfjs-dist/standard_fonts");
    const fonts = { regular: readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"), bold: readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64") };
    const make = () => renderPremium(new jsPDF({ unit: "mm", format: "a4" }) as unknown as PremiumWriter, fonts, D1, { fixedDate: "2026-11-08T12:00:00.000Z" });
    const a = make(), b = make();
    expect(a.pages).toBeGreaterThanOrEqual(10);
    expect(a.pages).toBeLessThanOrEqual(20);
    expect(a.fontMode).toBe("unicode");
    const ba = new Uint8Array(await a.blob.arrayBuffer()), bb = new Uint8Array(await b.blob.arrayBuffer());
    expect(Buffer.from(ba).equals(Buffer.from(bb))).toBe(true);
    const small = renderPremium(new jsPDF({ unit: "mm", format: "a4" }) as unknown as PremiumWriter, fonts, premiumFrom(smallNormal(), demo));
    expect(small.pages).toBeLessThanOrEqual(5);
    const large = renderPremium(new jsPDF({ unit: "mm", format: "a4" }) as unknown as PremiumWriter, fonts, premiumFrom(largeSynthetic(), demo));
    expect(large.pages).toBeGreaterThan(a.pages);
  });
  it("adding an observation changes the census and the report but never a stored record", () => {
    const input = alexNovemberExport();
    const snapshot = JSON.stringify(input);
    const r = premiumFrom([...input, o("cv-070", "mmol/L", "139", "2026-11-08")], demo);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(r.census.sha256).not.toBe(D1.census.sha256);
    expect(r.census.observations).toBe(98);
  });
});
