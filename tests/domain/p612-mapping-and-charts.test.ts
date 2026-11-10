/**
 * P61.2 — owner-directed synthetic intake aliases (pending Researcher review) and chart readability.
 * Synthetic fixtures only; aliases never convert units, never apply to real data and are not scientific approval.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import register from "../../data/scientific/p612-synthetic-intake-aliases.v1.json";
import {
  P612_ALIAS_STATUS,
  SYNTHETIC_INTAKE_ALIASES,
  syntheticIntakeAliasEntry,
  syntheticIntakeAliasFor,
  validateSyntheticIntakeAliasRegister,
} from "../../src/domain/health-intelligence/p612-synthetic-intake-aliases";
import { recognizeSyntheticDemo } from "../../src/domain/health-intelligence/synthetic-demo-catalog";
import { getSyntheticDemoCatalogs, loadInstalledDemoCatalogs, resetSyntheticDemoCatalogsForTests, SYNTHETIC_DEMO_STORAGE_KEY } from "../../src/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { classifyWithGovernedExtensions } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { chartDateAxisPlan, orientationLabelGroups, renderPremiumReport } from "../../src/domain/health-intelligence/p59-premium-pdf";
import { SvgPdfWriter, type TextItem } from "../support/svg-pdf-writer";
import { premiumFrom, MITO_DEMO_MISSION_ID, o } from "../support/p59-fixtures";
import { repoPath } from "../documents/p42-pdf-helpers";

const storage = new Map<string, string>([[SYNTHETIC_DEMO_STORAGE_KEY, readFileSync(repoPath("tests", "fixtures", "p61-mito-demo-signed-snapshots.v372.json"), "utf8")]]);
beforeAll(async () => {
  await loadInstalledDemoCatalogs({ storage: { get: (k) => storage.get(k) ?? null, set: (k, v) => void storage.set(k, v) } });
});
afterAll(() => resetSyntheticDemoCatalogsForTests());
const cls = (label: string, unit: string, provenance: "synthetic" | "real" = "synthetic", missionId = MITO_DEMO_MISSION_ID) =>
  classifyWithGovernedExtensions({ label, unit, provenance, missionId } as never).classification;

describe("P61.2 synthetic intake alias register", () => {
  it("is valid, owner-directed, pending Researcher review and lists exactly five exact-unit aliases", () => {
    expect(SYNTHETIC_INTAKE_ALIASES).not.toBeNull();
    expect(register.status).toBe(P612_ALIAS_STATUS);
    expect(P612_ALIAS_STATUS).toContain("PENDING_RESEARCHER_REVIEW");
    expect(SYNTHETIC_INTAKE_ALIASES!.aliases.map((a) => `${a.alias}|${a.unit}→${a.demoId}`)).toEqual([
      "25-OH vitamin D|ng/mL→demo:ubt-7b25ce69",
      "Systolic BP|mmHg→demo:ubt-e1140df3",
      "Diastolic BP|mmHg→demo:ubt-5d16fcaf",
      "Glucose, fasting|mg/dL→demo:ubt-7f47ee7c",
      "White blood cells|10^9/L→demo:ubt-813d9e97",
    ]);
  });
  it("any defect disables the whole register (fail closed)", () => {
    const bad = (patch: (r: Record<string, unknown>) => void) => {
      const r = JSON.parse(JSON.stringify(register));
      patch(r);
      return validateSyntheticIntakeAliasRegister(r);
    };
    expect(bad((r) => (r.status = "APPROVED"))).toBeNull();
    expect(bad((r) => ((r.aliases as { unit: string }[])[0]!.unit = " ng/mL"))).toBeNull();
    expect(bad((r) => ((r.aliases as { basis: string }[])[0]!.basis = "fuzzy"))).toBeNull();
    expect(bad((r) => (r.aliases as unknown[]).push((r.aliases as unknown[])[0]))).toBeNull();
  });
  it("maps only with the identical unit, only for synthetic data in the register's mission", () => {
    const vd = cls("25-OH vitamin D", "ng/mL");
    expect(vd.status === "matched" && vd.metricId).toBe("demo:ubt-7b25ce69");
    expect(vd.status === "matched" && vd.domain).toBe("bone");
    expect(cls("25-OH vitamin D", "nmol/L").status).not.toBe("matched"); // no unit conversion
    expect(cls("Systolic BP", "mm Hg").status).not.toBe("matched"); // no notation equivalence
    expect(cls("Systolic BP", "mmHg", "real").status).not.toBe("matched");
    expect(cls("White blood cells", "10^3/μL").status).not.toBe("matched"); // the other WBC entry is never chosen by alias
    const cat = getSyntheticDemoCatalogs().get(MITO_DEMO_MISSION_ID)!;
    expect(syntheticIntakeAliasEntry({ label: "Systolic BP", unit: "mmHg", missionId: "mission-other" }, cat)).toBeNull();
  });
  it("records alias provenance on the recognition and keeps the original label/unit", () => {
    const r = recognizeSyntheticDemo({ label: "Glucose, fasting", unit: "mg/dL", provenance: "synthetic", missionId: MITO_DEMO_MISSION_ID } as never, getSyntheticDemoCatalogs());
    expect(r.status).toBe("SYNTHETIC_DEMO_RECOGNIZED");
    expect(r.status === "SYNTHETIC_DEMO_RECOGNIZED" && r.intakeAlias).toEqual({ alias: "Glucose, fasting", basis: "word-order" });
    const c = cls("Glucose, fasting", "mg/dL");
    expect(c.status === "matched" && [c.originalLabel, c.originalUnit, c.reviewRequired]).toEqual(["Glucose, fasting", "mg/dL", true]);
    expect(syntheticIntakeAliasFor({ label: "Glucose, fasting", unit: "mg/dL", metricId: "demo:ubt-7f47ee7c" })?.basis).toBe("word-order");
    expect(syntheticIntakeAliasFor({ label: "Fasting glucose", unit: "mg/dL", metricId: "demo:ubt-7f47ee7c" })).toBeNull();
  });
  it("unresolved series stay unresolved (unit notation, specimen or definition needs Researcher review)", () => {
    for (const [l, u] of [["Body temperature", "deg C"], ["Platelets", "10^9/L"], ["Creatinine", "mg/dL"], ["Sleep duration", "h"], ["HRV SDNN", "ms"], ["Bicarbonate", "mmol/L"], ["Chloride", "mmol/L"], ["Urea nitrogen (BUN)", "mg/dL"]] as const)
      expect(`${l}:${cls(l, u).status}`).not.toBe(`${l}:matched`);
  });
});

describe("P61.2 chart date axis and orientation labels", () => {
  const W = (t: string) => t.length * 1.25;
  const DAYS = ["2026-11-03", "2026-11-06", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-20", "2026-11-24", "2026-11-28"];
  it("crowded single-month axes use day numbers and keep every date (including the peak)", () => {
    const pts = DAYS.map((day, i) => ({ day, value: [5.8, 12, 32, 74, 55, 29, 15, 8.1][i]!, ...(i === 3 ? { annotation: "peak" } : {}) }));
    const p = chartDateAxisPlan(pts, 72, W);
    expect(p.month).toBe("Nov 2026");
    expect(p.labels.map((l) => l.text)).toEqual(["03", "06", "09", "12", "16", "20", "24", "28"]);
    expect(p.omitted).toEqual([]);
  });
  it("when labels must be dropped, first, last and the peak are kept and the omitted dates are named", () => {
    const days = Array.from({ length: 20 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    const pts = days.map((day, i) => ({ day, value: i === 11 ? 99 : 10 + (i % 3), ...(i === 11 ? { annotation: "peak" } : {}) }));
    const p = chartDateAxisPlan(pts, 40, W);
    const kept = p.labels.map((l) => l.index);
    expect(kept).toContain(0);
    expect(kept).toContain(19);
    expect(kept).toContain(11);
    expect(p.omitted.length + p.labels.length).toBe(20);
    for (let i = 1; i < p.labels.length; i++) expect(p.labels[i]!.x - p.labels[i - 1]!.x).toBeGreaterThanOrEqual((W(p.labels[i]!.text) + W(p.labels[i - 1]!.text)) / 2 + 1.2 - 1e-9);
  });
  it("close orientation lines share one label", () => {
    const Y = (v: number) => 100 - v * 4;
    expect(orientationLabelGroups([5.7, 6.5, 5.7], Y)).toEqual([[6.5], [5.7]]);
    expect(orientationLabelGroups([6.4, 6.5], Y)).toEqual([[6.5, 6.4]]);
  });
  it("the rendered HbA1c / multi-date report has no overlapping chart labels", () => {
    const D = ["2026-11-03", "2026-11-06", "2026-11-09", "2026-11-12", "2026-11-16", "2026-11-20", "2026-11-24", "2026-11-28"];
    const hist = [
      ...D.map((d, i) => o("cv-085", "%", ["5.8", "5.9", "9.1", "5.9", "5.8", "5.8", "5.8", "5.8"][i]!, d)),
      ...D.map((d, i) => o("cv-092", "pg/mL", ["5.8", "12", "32", "74", "55", "29", "15", "8.1"][i]!, d)),
      ...D.map((d, i) => o("cv-088", "mg/dL", ["155", "165", "230", "330", "288", "216", "184", "160"][i]!, d)),
    ];
    const r = premiumFrom(hist, { provisional: true, mappings: true, missionId: MITO_DEMO_MISSION_ID, range: { from: "2026-11-01", to: "2026-11-30" } });
    const w = new SvgPdfWriter();
    renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true });
    const PT = 25.4 / 72;
    const box = (t: TextItem) => ({ x0: t.x, x1: t.x + t.w, y0: t.y - 0.72 * t.size * PT, y1: t.y + 0.2 * t.size * PT });
    const over = (a: TextItem, b: TextItem) => {
      const A = box(a), B = box(b);
      return Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 0.3 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0.3;
    };
    const axis = w.texts.filter((t) => !t.bold && (t.size === 7 || t.size === 6 || t.size === 6.4) && (/^\d{2}$/.test(t.text) || /orientation only/.test(t.text) || /^Nov 2026$/.test(t.text)));
    expect(axis.filter((t) => /^\d{2}$/.test(t.text)).length).toBeGreaterThanOrEqual(8 * 3);
    for (let i = 0; i < axis.length; i++) for (let j = i + 1; j < axis.length; j++) if (axis[i]!.page === axis[j]!.page) expect(over(axis[i]!, axis[j]!) ? `${axis[i]!.text} × ${axis[j]!.text}` : "").toBe("");
  });
});
