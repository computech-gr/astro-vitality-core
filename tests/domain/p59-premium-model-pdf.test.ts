/**
 * P59 premium read model + renderer. The renderer runs against the test-only SvgPdfWriter
 * (jsPDF-compatible subset with real Liberation Sans metrics); real jsPDF bytes are verified in CI.
 */
import { describe, expect, it } from "bun:test";
import { SvgPdfWriter } from "../support/svg-pdf-writer";
import { premiumFrom, alexFull, smallNormal, complexAbnormal, V9_SCOPE } from "../support/p59-fixtures";
import { renderPremiumReport } from "../../src/domain/health-intelligence/p59-premium-pdf";
import { bundledCriteriaRegistry, criterionFingerprint, type ApprovedCriterion } from "../../src/domain/health-intelligence/p57-reference-criteria";
import { DOSE_PATTERN } from "../../src/domain/health-intelligence/p58-clinical-reasoning";

const render = (r: ReturnType<typeof premiumFrom>) => {
  const w = new SvgPdfWriter();
  const { pages } = renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true });
  return { w, pages, text: w.texts.map((t) => t.text).join("\n") };
};
const D1 = premiumFrom(alexFull(), { provisional: true });
const D6 = premiumFrom(alexFull(), { provisional: false });
const D2 = premiumFrom(smallNormal(), { provisional: true });
const D3 = premiumFrom(complexAbnormal(), { provisional: true });

describe("P59 model — data fidelity", () => {
  it("F1/F2 every included observation appears exactly once with its stored value", () => {
    const input = alexFull();
    expect(D1.rows.length).toBe(input.length);
    expect(new Set(D1.rows.map((r) => r.recordId)).size).toBe(input.length);
    const values = input.map((o) => `${o.metricId}|${o.value}|${o.observedAt.slice(0, 10)}`).sort();
    expect(D1.rows.map((r) => `${r.metricId}|${r.valueText}|${r.date}`).sort()).toEqual(values);
  });
  it("F3 rows of a series are chronological; F5 units unchanged", () => {
    const tg = D1.rows.filter((r) => r.metricId === "cv-088");
    expect(tg.map((r) => r.valueText)).toEqual(["165", "330", "184"]);
    expect(tg.every((r) => r.unit === "mg/dL")).toBe(true);
  });
  it("F20 counts are labelled and consistent", () => {
    expect(D1.counts).toMatchObject({ observations: 47, examinationDates: 4, comparedSeries: 10 });
    expect(D1.counts.series).toBe(new Set(D1.rows.map((r) => `${r.metricId}|${r.unit}`)).size);
  });
  it("F4 intermediate peak preserved in charts", () => {
    const tg = D1.charts.find((c) => c.base.metricId === "cv-088")!;
    expect(tg.base.points.map((p) => p.annotation)).toEqual([null, "peak", null]);
  });
});

describe("P59 model — governance", () => {
  it("F7 without approvals and with provisional OFF nothing is coloured (D6)", () => {
    expect(D6.rows.every((r) => r.displayClass === "NEUTRAL")).toBe(true);
    expect(D6.charts.every((c) => c.bands.length === 0)).toBe(true);
    expect(D6.alerts.flatMap((a) => a.badges).some((b) => /^(RED|AMBER|GREEN)/.test(b))).toBe(false);
  });
  it("F8 provisional colours are always labelled provisional and never approved", () => {
    const coloured = D1.rows.filter((r) => r.displayClass !== "NEUTRAL");
    expect(coloured.length).toBeGreaterThan(0);
    expect(coloured.every((r) => r.basis === "provisional")).toBe(true);
    expect(D1.base.kpis.validatedAlerts).toBe(0);
  });
  it("D8 real provenance never gets provisional output", () => {
    const real = premiumFrom(alexFull(), { provisional: true, provenance: "real" });
    expect(real.options.provisionalActive).toBe(false);
    expect(real.rows.every((r) => r.basis !== "provisional" && r.provisional === null)).toBe(true);
  });
  it("D7 an approved criterion produces an approved (not provisional) class", async () => {
    const c = bundledCriteriaRegistry().criteria.find((x) => x.id === "p57-nhlbi-triglyceride-categories")!;
    const ap: ApprovedCriterion = { criterion: c, fingerprint: await criterionFingerprint(c), missions: [{ missionId: V9_SCOPE.missionId, conditions: ["adult_crew"] }], approvedAt: "2026-11-08T10:00:00.000Z", approverUserId: "test", approvalRef: "test-tg" };
    const r = premiumFrom(alexFull(), { approved: [ap], provisional: true });
    // fasting status is not recorded → approved criterion not applicable → stays NEUTRAL under approved basis, provisional shown instead
    const tg = r.rows.filter((x) => x.metricId === "cv-088");
    expect(tg.every((x) => x.basis !== "approved")).toBe(true);
    expect(r.counts.approvedCriteria).toBe(1);
  });
  it("F9/F10 high review and data check never become clinical colours", () => {
    for (const r of D1.rows) {
      if (r.axes.dataQuality.value === "DATA_QUALITY_WARNING") expect(r.displayClass).toBe("NEUTRAL");
    }
    const il6 = D1.rows.filter((r) => r.metricId === "cv-092");
    expect(il6.every((r) => r.axes.review.value === "HIGH" && r.displayClass === "NEUTRAL")).toBe(true);
  });
  it("F22–F24 D-dimer, Hb (g/dL) and resting HR are never coloured", () => {
    for (const id of ["demo:ubt-eed68002", "cv-075", "cv-002"]) expect(D1.rows.filter((r) => r.metricId === id).every((r) => r.displayClass === "NEUTRAL")).toBe(true);
  });
  it("demo identities stay NEUTRAL until aliases are approved (vitamin D, sleep efficiency)", () => {
    for (const id of ["demo:ubt-7b25ce69", "demo:ubt-efe7e2fb"]) expect(D1.rows.filter((r) => r.metricId === id).every((r) => r.displayClass === "NEUTRAL")).toBe(true);
  });
  it("F21 a normal dataset produces no red card", () => {
    expect(D2.alerts.map((a) => a.kind)).toEqual(["none"]);
  });
  it("F14 recommendations carry a basis", () => {
    expect(D1.recommendations.flatMap((c) => c.items).every((i) => i.basis.length > 0)).toBe(true);
  });
  it("F19 deterministic", () => {
    // record IDs come from the fixture's global counter; everything else must be identical
    const strip = (r: typeof D1) => JSON.stringify(r.rows.map(({ recordId: _r, ...x }) => x));
    expect(strip(premiumFrom(alexFull(), { provisional: true }))).toBe(strip(D1));
  });
});

describe("P59 renderer (SVG test writer)", () => {
  const all = [["D1", D1], ["D2", D2], ["D3", D3], ["D6", D6]] as const;
  it("P1 page 1 content and legend", () => {
    const { w } = render(D1);
    const p1 = w.texts.filter((t) => t.page === 1).map((t) => t.text).join(" ");
    for (const s of ["Health Intelligence Report", "Alex Morgan", "Most important findings", "Priority next steps", "HIGH PRIORITY MEDICAL REVIEW", "MONITORING OR FURTHER EVALUATION", "DATA CHECK", "NEUTRAL", "SYNTHETIC DEMONSTRATION DATA"]) expect(p1).toContain(s);
  });
  it("P2 section order", () => {
    const { text } = render(D1);
    const order = ["Most important findings", "Executive health overview", "Integrated health assessment", "Longitudinal biomarker intelligence", "Preliminary Medical Assessment — For Ground Medical Review", "Personalised recommendations", "Complete results — all observations", "Methodology note"].map((s) => text.indexOf(s));
    expect(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1]!))).toBe(true);
  });
  for (const [name, r] of all)
    it(`P3/P5/P7 ${name}: footer on every page, no empty page, all text inside the page box`, () => {
      const { w, pages } = render(r);
      for (let p = 1; p <= pages; p++) {
        const t = w.texts.filter((x) => x.page === p);
        expect(t.some((x) => x.text === `Page ${p} of ${pages}`)).toBe(true);
        expect(t.filter((x) => x.y > 14 && x.y < 283).length).toBeGreaterThan(3);
      }
      for (const t of w.texts) {
        expect(t.x).toBeGreaterThanOrEqual(12.5);
        expect(t.x + t.w).toBeLessThanOrEqual(197.6);
        expect(t.y).toBeLessThanOrEqual(290);
      }
    });
  it("P4 results-table header repeats on every table page", () => {
    const { w } = render(D3);
    const pagesWithRows = new Set(w.texts.filter((t) => t.text === "Criterion & limitation").map((t) => t.page));
    const tableStart = Math.min(...pagesWithRows), last = w.getNumberOfPages();
    const methodPage = w.texts.find((t) => t.text === "Methodology note")!.page;
    for (let p = tableStart; p <= Math.min(last, methodPage); p++) if (w.texts.some((t) => t.page === p && /^(NEUTRAL|AMBER PROV\.)$/.test(t.text))) expect(pagesWithRows.has(p)).toBe(true);
  });
  it("P6 no heading in the bottom 20 mm of a page", () => {
    const { w } = render(D3);
    for (const t of w.texts.filter((x) => x.size >= 11 && x.bold)) expect(t.y).toBeLessThan(279 - 8);
  });
  it("P9 page count adapts (small < Alex < complex)", () => {
    expect(render(D2).pages).toBeLessThan(render(D1).pages);
    expect(render(D1).pages).toBeLessThan(render(D3).pages);
  });
  it("F16 no dose wording; provisional labelled in text; review flag never a filled red badge", () => {
    const { w, text } = render(D1);
    // the fixed disclaimers ("no medication or supplement doses", "no medication or dose advice") are the only allowed matches
    const scrubbed = text.replace(/No medication or\s+supplement doses are given\./g, "").replace(/supplement doses are given\./g, "").replace(/no\s+medication\s+or\s+dose\s+advice\./g, "");
    expect(DOSE_PATTERN.test(scrubbed)).toBe(false);
    expect(text).toContain("PROVISIONAL");
    // filled red rectangles must never carry the review label
    const flags = w.texts.filter((t) => /HIGH-PRIORITY REVIEW|^HIGH$|^REVIEW$/.test(t.text));
    expect(flags.every((t) => t.color === "rgb(198,40,40)")).toBe(true);
  });
  it("D6 PDF text shows 0 approved criteria and no provisional label", () => {
    const { text } = render(D6);
    expect(text).toContain("0 Researcher-approved criteria");
    expect(text).not.toContain("(PROVISIONAL)");
  });
});

import { readFileSync } from "node:fs";
import provisionalRaw from "../../data/scientific/p59-provisional-literature-criteria.v1.json";
import register from "../../data/scientific/p59-demo-identity-alias-register.v1.json";
import { provisionalInterpretation } from "../../src/domain/health-intelligence/p59-provisional-interpretation";

describe("P59 synthetic identity alias register (proposal only)", () => {
  type Row = { demoId: string; unit: string; target: string | null; targetUnit: string | null; status: string; missionId: string };
  const rows = (register as { rows: Row[] }).rows;
  it("is not activated: the shipped provisional registry has no aliases and no code imports the register", () => {
    expect(Object.keys((provisionalRaw as { demoAliases: { map: object } }).demoAliases.map)).toEqual([]);
    const src = ["p59-provisional-interpretation.ts", "p59-premium-model.ts", "p59-premium-pdf.ts"].map((f) => readFileSync(`src/domain/health-intelligence/${f}`, "utf8")).join("\n");
    expect(src).not.toContain("p59-demo-identity-alias-register");
  });
  it("every PROPOSED row has an identical unit, a single mission and a unique target", () => {
    const proposed = rows.filter((r) => r.status.startsWith("PROPOSED"));
    expect(proposed.length).toBe(25);
    for (const r of proposed) expect(r.targetUnit).toBe(r.unit);
    expect(new Set(rows.map((r) => r.missionId)).size).toBe(1);
    expect(new Set(proposed.map((r) => `${r.target}|${r.unit}`)).size).toBe(proposed.length);
  });
  const withAliases = (map: Record<string, unknown>) => ({ ...provisionalRaw, demoAliases: { note: "test", map } });
  const vd = { metricId: "demo:ubt-7b25ce69", unit: "ng/mL", value: "12", provenance: "synthetic" as const, mode: "synthetic-demonstration" as const };
  const alias = { target: "criterion:p59-nihods-25ohd", unit: "ng/mL", missionId: "m-1", approvedBy: "researcher-test", approvedAt: "2026-11-08T10:00:00Z", registerRef: "demo:ubt-7b25ce69" };
  it("an approved, mission-scoped criterion-scoped alias applies (vitamin D 12 ng/mL → inadequate, provisional)", () => {
    const r = provisionalInterpretation({ ...vd, missionId: "m-1" }, withAliases({ "demo:ubt-7b25ce69": alias }));
    expect([r.status, r.severity, r.bandLabel]).toEqual(["PROVISIONAL", "amber", "Generally considered inadequate (NIH ODS)"]);
  });
  it("an alias never applies to another mission, another unit, or without a named approver", () => {
    expect(provisionalInterpretation({ ...vd, missionId: "m-2" }, withAliases({ "demo:ubt-7b25ce69": alias })).status).toBe("NO_CRITERION");
    expect(provisionalInterpretation({ ...vd, unit: "nmol/L", missionId: "m-1" }, withAliases({ "demo:ubt-7b25ce69": alias })).status).toBe("NO_CRITERION");
    expect(provisionalInterpretation({ ...vd, missionId: "m-1" }, withAliases({ "demo:ubt-7b25ce69": { ...alias, approvedBy: " " } })).status).toBe("NO_CRITERION");
  });
  it("with approved aliases the Alex report colours vitamin D and sleep efficiency provisionally", () => {
    const reg = withAliases({
      "demo:ubt-7b25ce69": { ...alias, missionId: V9_SCOPE.missionId },
      "demo:ubt-efe7e2fb": { target: "criterion:p59-nsf2017-sleep-efficiency", unit: "%", missionId: V9_SCOPE.missionId, approvedBy: "researcher-test", approvedAt: "2026-11-08T10:00:00Z", registerRef: "demo:ubt-efe7e2fb" },
    });
    const r = premiumFrom(alexFull(), { provisional: true, registry: reg });
    expect(r.rows.filter((x) => x.metricId === "demo:ubt-7b25ce69").every((x) => x.displayClass === "AMBER" && x.basis === "provisional")).toBe(true);
    expect(r.rows.find((x) => x.metricId === "demo:ubt-efe7e2fb")!.displayClass).toBe("AMBER");
  });
});
