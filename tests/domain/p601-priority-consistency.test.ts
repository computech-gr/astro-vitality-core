/**
 * P60.1 — HIGH / MONITORING / TREND REVIEW / DATA CHECK consistency and PDF readability regressions.
 * Synthetic fixtures only (reconstructed; never stored, never real astronaut data).
 */
import { describe, expect, it } from "bun:test";
import { renderPremiumReport, chartCaption, chartAxisFloor, TREND_REVIEW_LABEL } from "../../src/domain/health-intelligence/p59-premium-pdf";
import { selectExecutiveAlerts, type FindingSummary } from "../../src/domain/health-intelligence/p59-executive-alerts";
import { SvgPdfWriter, type TextItem } from "../support/svg-pdf-writer";
import { premiumFrom, smallNormal, complexAbnormal, MITO_DEMO_MISSION_ID, o } from "../support/p59-fixtures";
import { alexNovemberExport, largeSynthetic, missingContextAmbiguous } from "../support/p60-fixtures";

const demo = { provisional: true, mappings: true, missionId: MITO_DEMO_MISSION_ID };
const D1 = premiumFrom(alexNovemberExport(), demo);
const OFF = premiumFrom(alexNovemberExport(), { missionId: MITO_DEMO_MISSION_ID });
const REAL = premiumFrom(alexNovemberExport(), { ...demo, provenance: "real" });
const pattern = (r: typeof D1, id: string) => r.patterns.patterns.find((p) => p.id === id)!;
const rowsOf = (r: typeof D1, metricId: string) => r.rows.filter((x) => x.metricId === metricId);
const chartOf = (r: typeof D1, metricId: string) => r.charts.find((c) => c.base.metricId === metricId)!;

const render = (r: typeof D1) => {
  const w = new SvgPdfWriter();
  const { pages } = renderPremiumReport(r, w as never, { family: "LiberationSans", unicode: true });
  return { w, pages, text: w.texts.map((t) => t.text).join("\n") };
};
/** Texts drawn inside the complete-results table (between its heading and the methodology heading). */
const tableTexts = (w: SvgPdfWriter) => {
  const start = w.texts.findIndex((t) => t.text === "Complete results — all observations");
  const end = w.texts.findIndex((t) => t.text === "Methodology note");
  return w.texts.slice(start, end);
};
const PT = 25.4 / 72;
const box = (t: TextItem) => ({ x0: t.x, x1: t.x + t.w, y0: t.y - 0.72 * t.size * PT, y1: t.y + 0.2 * t.size * PT });
const overlaps = (a: TextItem, b: TextItem) => {
  const A = box(a), B = box(b);
  const ix = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), iy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  return ix > 0.3 && iy > 0.3;
};

// Trend-review series in the Alex fixture whose pattern is MONITORING, and genuine high-priority series.
const MONITORING_TREND = [
  { metricId: "cv-088", pattern: "p60-lipids", label: "triglycerides" },
  { metricId: "demo:ubt-12c22152", pattern: "p60-bone", label: "osteocalcin" },
  { metricId: "cv-027", pattern: "p60-recovery", label: "heart-rate variability (RMSSD)" },
];
const HIGH_SERIES = [
  { metricId: "cv-070", pattern: "p60-electrolytes", label: "sodium" },
  { metricId: "cv-071", pattern: "p60-electrolytes", label: "potassium" },
  { metricId: "cv-092", pattern: "p60-acute-physiology", label: "IL-6" },
];

describe("P60.1 — 1. a large change alone never becomes HIGH PRIORITY", () => {
  it("results-table HIGH PRIORITY badges match exactly the results whose finding is high priority", () => {
    const { w } = render(D1);
    const t = tableTexts(w);
    expect(t.filter((x) => x.text === "HIGH PRIORITY").length).toBe(D1.rows.filter((r) => r.priority === "HIGH_PRIORITY_MEDICAL_REVIEW").length);
    expect(t.filter((x) => x.text === TREND_REVIEW_LABEL).length).toBe(D1.rows.filter((r) => r.axes.review.value === "HIGH").length);
    // the P59 red "HIGH" review badge is gone from the table
    expect(t.filter((x) => x.text === "HIGH").length).toBe(0);
  });
  it("a series with only a trend-review change carries no high medical-review priority", () => {
    const r = premiumFrom([o("cv-092", "pg/mL", "5.8", "2026-11-05"), o("cv-092", "pg/mL", "74", "2026-11-07")], demo);
    const il6 = rowsOf(r, "cv-092");
    expect(il6.every((x) => x.axes.review.value === "HIGH")).toBe(true);
    expect(il6.some((x) => x.priority === "HIGH_PRIORITY_MEDICAL_REVIEW")).toBe(false);
    expect(chartOf(r, "cv-092").priority).not.toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
  });
  it("trend review is drawn as a teal outline, never as the red high-priority pill", () => {
    const { w } = render(D1);
    const trend = w.texts.filter((t) => t.text === TREND_REVIEW_LABEL);
    expect(trend.length).toBeGreaterThan(0);
    expect(trend.every((t) => t.color === "rgb(14,124,134)")).toBe(true);
  });
});

describe("P60.1 — 2. MONITORING stays MONITORING on page 1, in charts, assessments and the table", () => {
  for (const s of MONITORING_TREND)
    it(`${s.label}: trend change preserved, priority MONITORING everywhere`, () => {
      const p = pattern(D1, s.pattern);
      expect(p.priority).toBe("MONITORING");
      const rs = rowsOf(D1, s.metricId);
      expect(rs.some((x) => x.axes.review.value === "HIGH")).toBe(true);
      expect(rs.every((x) => x.priority === "MONITORING")).toBe(true);
      const ch = chartOf(D1, s.metricId);
      expect(ch.highReview).toBe(true);
      expect(ch.priority).toBe("MONITORING");
      const over = D1.patternAlerts!.find((a) => a.findingIds.includes(s.pattern))!;
      expect(over.evidence.split("\n").find((l) => l.includes(p.title))).toMatch(/— monitoring/);
    });
});

describe("P60.1 — 3. genuine HIGH PRIORITY findings keep their priority", () => {
  for (const s of HIGH_SERIES)
    it(`${s.label}: HIGH PRIORITY in the pattern, rows and chart; trend change shown separately`, () => {
      expect(pattern(D1, s.pattern).priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
      const rs = rowsOf(D1, s.metricId);
      expect(rs.every((x) => x.priority === "HIGH_PRIORITY_MEDICAL_REVIEW")).toBe(true);
      expect(rs.some((x) => x.axes.review.value === "HIGH")).toBe(true);
      expect(chartOf(D1, s.metricId).priority).toBe("HIGH_PRIORITY_MEDICAL_REVIEW");
      expect(chartOf(D1, s.metricId).highReview).toBe(true);
    });
  it("page 1 still opens with the three high-priority patterns", () => {
    expect(D1.patternAlerts!.slice(0, 3).every((c) => c.priority === "HIGH_PRIORITY_MEDICAL_REVIEW")).toBe(true);
  });
});

describe("P60.1 — 4. clinical classification is never overwritten by priority", () => {
  it("IL-6 is HIGH PRIORITY yet clinically NEUTRAL; triglycerides AMBER (provisional) yet MONITORING", () => {
    expect(rowsOf(D1, "cv-092").every((x) => x.displayClass === "NEUTRAL" && x.basis === "none")).toBe(true);
    expect(rowsOf(D1, "cv-088").some((x) => x.displayClass === "AMBER" && x.basis === "provisional")).toBe(true);
  });
  it("no result without a criterion has a non-neutral class, whatever its priority", () => {
    for (const r of D1.rows) if (r.basis === "none") expect(r.displayClass).toBe("NEUTRAL");
  });
  it("classes are identical with and without the priority layer (OFF has no patterns)", () => {
    const real = REAL.rows.map((r) => `${r.recordId}:${r.displayClass}:${r.basis}`);
    expect(real.every((x) => x.endsWith(":NEUTRAL:none"))).toBe(true);
  });
});

describe("P60.1 — 5. pattern-level DATA CHECK is not an observation-level measurement error", () => {
  it("sodium and potassium carry the pattern check without an observation-level CHECK", () => {
    for (const id of ["cv-070", "cv-071"]) {
      const rs = rowsOf(D1, id);
      expect(rs.every((x) => x.patternDataCheck)).toBe(true);
      expect(rs.every((x) => x.axes.dataQuality.value !== "DATA_QUALITY_WARNING")).toBe(true);
      expect(rs.every((x) => x.notes.includes("†"))).toBe(true);
    }
    // QTc belongs to the same pattern but is not what the data check refers to.
    expect(D1.rows.filter((r) => pattern(D1, "p60-electrolytes").recordIds.includes(r.recordId) && !["cv-070", "cv-071"].includes(r.metricId)).every((r) => !r.patternDataCheck)).toBe(true);
  });
  it("the table prints CHECK only for observation-level rules and explains the pattern check once", () => {
    const { w } = render(D1);
    const t = tableTexts(w);
    expect(t.filter((x) => x.text === "CHECK").length).toBe(D1.rows.filter((r) => r.axes.dataQuality.value === "DATA_QUALITY_WARNING").length);
    expect(t.filter((x) => x.text === "+ pattern check †").length).toBe(D1.rows.filter((r) => r.patternDataCheck).length);
    expect(D1.tableNotes.filter((n) => n.startsWith("† Pattern-level DATA CHECK")).length).toBe(1);
    expect(D1.tableNotes.find((n) => n.startsWith("†"))).toContain("not an observation-level measurement error");
  });
});

describe("P60.1 — 6. mixed executive panels are neutral, purple only for DATA CHECK", () => {
  const f = (id: string, priority: FindingSummary["priority"]): FindingSummary => ({ id, title: id, clinical: "NEUTRAL", clinicalBasis: "none", review: "ROUTINE", dataQuality: priority === "DATA_CHECK" ? "DATA_QUALITY_WARNING" : "UNKNOWN", evidence: id, nextStep: "x", clinicalOrder: 0, priority });
  it("an overflow card mixing MONITORING and DATA CHECK is flagged mixed; a uniform one is not", () => {
    const mixed = selectExecutiveAlerts([f("a", "HIGH_PRIORITY_MEDICAL_REVIEW"), f("b", "HIGH_PRIORITY_MEDICAL_REVIEW"), f("c", "HIGH_PRIORITY_MEDICAL_REVIEW"), f("d", "DATA_CHECK"), f("e", "MONITORING")], 4);
    expect(mixed.at(-1)!.mixed).toBe(true);
    const same = selectExecutiveAlerts([f("a", "HIGH_PRIORITY_MEDICAL_REVIEW"), f("b", "HIGH_PRIORITY_MEDICAL_REVIEW"), f("c", "HIGH_PRIORITY_MEDICAL_REVIEW"), f("d", "MONITORING"), f("e", "MONITORING")], 4);
    expect(same.at(-1)!.mixed).toBe(false);
  });
  it("the Alex page-1 overflow panel is mixed, lists medical-review findings before data checks and draws no violet panel", () => {
    const over = D1.patternAlerts!.at(-1)!;
    expect(over.mixed).toBe(true);
    const lines = over.evidence.split("\n");
    expect(lines.at(-1)).toMatch(/data check \(measurement quality\)$/);
    expect(lines.slice(0, -1).every((l) => !/— data check/.test(l))).toBe(true);
    const { w } = render(D1);
    expect(w.rects.filter((x) => x.page === 1 && x.fill === "rgb(245,240,255)").length).toBe(0);
    expect(w.texts.some((t) => t.page === 1 && t.text === "SEVERAL PRIORITIES — SEE EACH LINE")).toBe(true);
  });
});

describe("P60.1 — 7. provisional synthetic criteria never activate for real data", () => {
  it("real provenance: no provisional classes, aliases, patterns, pattern checks or demonstration label", () => {
    expect(REAL.options.provisionalActive).toBe(false);
    expect(REAL.options.demonstrationMappingsActive).toBe(false);
    expect(REAL.demonstrationLabel).toBeNull();
    expect(REAL.patterns.patterns.length).toBe(0);
    expect(REAL.rows.some((r) => r.basis === "provisional" || r.identityRoute !== null || r.patternDataCheck)).toBe(false);
    const { text } = render(REAL);
    expect(text).not.toContain("PROVISIONAL");
    expect(text).not.toContain("pattern check");
  });
});

describe("P60.1 — 8. demonstration mode ON/OFF", () => {
  it("ON shows the label and patterns; OFF shows neither but keeps concern priorities and trend review", () => {
    expect(D1.demonstrationLabel).toBe("LITERATURE-BASED SYNTHETIC DEMONSTRATION — NOT CLINICALLY VALIDATED");
    expect(D1.patterns.patterns.length).toBeGreaterThan(0);
    expect(OFF.demonstrationLabel).toBeNull();
    expect(OFF.patterns.patterns.length).toBe(0);
    expect(OFF.rows.some((r) => r.priority !== null)).toBe(true);
    expect(OFF.rows.some((r) => r.axes.review.value === "HIGH")).toBe(true);
    expect(render(D1).text).toContain("LITERATURE-BASED SYNTHETIC DEMONSTRATION — NOT CLINICALLY VALIDATED");
    expect(render(OFF).text).not.toContain("LITERATURE-BASED SYNTHETIC DEMONSTRATION");
  });
});

describe("P60.1 — 9. PDF readability", () => {
  const SETS: [string, typeof D1][] = [
    ["alex on", D1], ["alex off", OFF], ["small normal", premiumFrom(smallNormal(), demo)], ["complex", premiumFrom(complexAbnormal(), demo)],
    ["missing context", premiumFrom(missingContextAmbiguous(), demo)], ["large", premiumFrom(largeSynthetic(), demo)],
  ];
  it("no overlapping text in the results table or between chart titles and their badges", () => {
    for (const [, r] of SETS) {
      const { w } = render(r);
      const t = tableTexts(w);
      for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) if (t[i]!.page === t[j]!.page) expect(overlaps(t[i]!, t[j]!) ? `${t[i]!.text} × ${t[j]!.text}` : "").toBe("");
      const titles = w.texts.filter((x) => x.size === 9.6 && x.bold);
      const small = w.texts.filter((x) => x.size <= 6.6);
      for (const a of titles) for (const b of small) if (a.page === b.page) expect(overlaps(a, b) ? `${a.text} × ${b.text}` : "").toBe("");
    }
  });
  it("no blank page, no text outside the page, no ellipsis in the footer or the page-1 cards", () => {
    for (const [, r] of SETS) {
      const { w, pages } = render(r);
      for (let p = 1; p <= pages; p++) expect(w.texts.filter((t) => t.page === p && t.y > 14 && t.y < 279).length).toBeGreaterThan(3);
      expect(w.texts.every((x) => x.x >= 12.5 && x.x + x.w <= 210 - 12.5 + 0.5 && x.y >= 6 && x.y <= 291)).toBe(true);
      expect(w.texts.filter((t) => t.y > 285 && t.text.includes("…")).length).toBe(0);
      expect(w.texts.filter((t) => t.page === 1 && t.y > 60 && t.text.endsWith("…")).length).toBe(0);
    }
  });
  it("captions never say no band is drawn when bands are drawn", () => {
    for (const [, r] of SETS) for (const c of r.charts) if (c.bands.length) expect(chartCaption(c)).not.toMatch(/no reference band is drawn|without a reference band/);
    const tg = chartOf(D1, "cv-088");
    expect(tg.bands.length).toBeGreaterThan(0);
    expect(chartCaption(tg)).toContain("provisional literature criteria");
  });
  it("concentration axes never go below zero (IL-6 5.8 → 74 pg/mL)", () => {
    expect(chartAxisFloor([5.8, 74], [], -25)).toBe(0);
    expect(chartAxisFloor([-1.2, 0.4], [], -2)).toBe(-2);
    const { w } = render(D1);
    const il6Page = w.texts.find((t) => t.text === "IL-6 (inflammatory signal)" && t.size === 9.6)!.page;
    expect(w.texts.filter((t) => t.page === il6Page && /^-\d+(\.\d+)?$/.test(t.text)).length).toBe(0);
  });
  it("pagination stays dynamic (small < Alex < large)", () => {
    const n = (r: typeof D1) => render(r).pages;
    expect(n(premiumFrom(smallNormal(), demo))).toBeLessThan(n(D1));
    expect(n(D1)).toBeLessThan(n(premiumFrom(largeSynthetic(), demo)));
  });
});

describe("P60.1 — missing context and ambiguous identities", () => {
  it("unresolved identities and non-catalog units stay NEUTRAL and unconverted; no priority is invented", () => {
    const r = premiumFrom(missingContextAmbiguous(), demo);
    for (const x of r.rows.filter((x) => x.metricId.startsWith("fixture:") || (x.metricId === "cv-070" && x.unit === "mEq/L"))) {
      expect(x.displayClass).toBe("NEUTRAL");
      expect(x.priority).toBeNull();
    }
    expect(r.rows.find((x) => x.metricId === "cv-070")!.valueText).toBe("139");
    expect(r.overview.every((q) => q.answer.trim().length > 0)).toBe(true);
  });
});
