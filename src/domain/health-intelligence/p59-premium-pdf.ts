/**
 * P59 — Premium Health Intelligence Report PDF renderer (vector, searchable text, jsPDF).
 *
 * Renders a PremiumReport (p59-premium-model.ts) with the reference design tokens. Content, chart
 * count, concern count, table length and page count are fully dynamic. Pagination: atomic blocks
 * (cards, chart panels, table rows, assessment rows), keep-with-next headings, repeated table headers,
 * no empty pages (a page is only added when the current page already holds content).
 */
import { redactProhibitedNames } from "./report-identity-redaction";
import { openTextPdf, toWinAnsi, type PdfDeps, type PdfWriter, type ReportFonts, type TextPdfResult } from "./report-text-pdf";
import { REPORT_LEGEND, legendProblems } from "./p571-report-legend";
import { COLOR, PAGE, type RGB } from "./p59-report-tokens";
import type { PremiumChart, PremiumReport, ResultRow, DisplayClass, ClassBasis, SystemTile } from "./p59-premium-model";
import { GROUPS } from "./p59-premium-model";
import type { AlertCard } from "./p59-executive-alerts";
import { WARNING_PRIORITY_LABEL, WARNING_PRIORITY_MEANING, WARNING_PRIORITY_RULES, WARNING_PRIORITY_TONE, type WarningPriority } from "./p59-warning-priority";
import { demonstrationMappings } from "./p59-provisional-interpretation";
import { shortSource, sourceCitation, type ClinicalPattern } from "./p60-clinical-patterns";

/**
 * P60: sub/superscript digits are transliterated before text reaches the PDF writer. The embedded
 * pdf.js standard Liberation Sans used by the app lacks U+2080–U+2089 and most of U+2070–U+2079,
 * which rendered "SpO₂" as "SpO" and "cm⁵" as "cm" in the P59 export. ASCII forms are unambiguous.
 */
const SUB = "₀₁₂₃₄₅₆₇₈₉", SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
export function transliterateScripts(text: string): string {
  return text
    .replace(/[₀-₉]/g, (c) => String(SUB.indexOf(c)))
    .replace(/⁻?[⁰⁴-⁹]+|⁻[¹²³]+/g, (m) => `^${m.replace("⁻", "-").replace(/[⁰-⁹¹²³]/g, (c) => String(SUP.indexOf(c) >= 0 ? SUP.indexOf(c) : c === "¹" ? 1 : c === "²" ? 2 : 3))}`);
}

export type PremiumWriter = PdfWriter & {
  roundedRect?(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): unknown;
  circle?(x: number, y: number, r: number, style?: string): unknown;
  triangle?(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string): unknown;
  setLineDashPattern?(pattern: number[], phase: number): unknown;
  setCreationDate?(d: Date | string): unknown;
  setFileId?(id: string): unknown;
  addFileToVFS?(n: string, d: string): unknown;
  addFont?(f: string, n: string, s: string): unknown;
  output?(k: "blob"): Blob;
};

const W = PAGE.width, H = PAGE.height, MX = PAGE.marginX, CW = PAGE.contentWidth;
const TOP1 = 13, TOP = 17, BOTTOM = 279, GUT = PAGE.gutter, COL2 = (CW - GUT) / 2, COL3 = (CW - 2 * GUT) / 3;
const PT = 0.3528;
const lh = (size: number, k = 1.36) => size * PT * k;
const SOFT: Record<string, RGB> = { red: COLOR.redSoft, amber: COLOR.amberSoft, normal: COLOR.greenSoft, none: COLOR.neutralSoft, neutral: COLOR.neutralSoft };
const NEUTRAL_TEXT: RGB = [71, 85, 105];

class P {
  y = TOP1;
  usesPriorityLayout = false;
  page = 1;
  pageHasBody = false;
  constructor(readonly pdf: PremiumWriter, readonly family: string, readonly unicode: boolean) {}
  t(s: string): string {
    const r = transliterateScripts(redactProhibitedNames(s));
    return this.unicode ? r : toWinAnsi(r);
  }
  font(size: number, bold = false, color: RGB = COLOR.ink) {
    this.pdf.setFont(this.family, bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(color[0], color[1], color[2]);
  }
  fill(c: RGB) { this.pdf.setFillColor(c[0], c[1], c[2]); }
  draw(c: RGB) { this.pdf.setDrawColor(c[0], c[1], c[2]); }
  dash(on: boolean, p: number[] = [1.2, 1]) { this.pdf.setLineDashPattern?.(on ? p : [], 0); }
  wrap(text: string, size: number, width: number, bold = false): string[] {
    this.font(size, bold);
    return this.pdf.splitTextToSize(this.t(text), width);
  }
  width(text: string, size: number, bold = false) { this.font(size, bold); return this.pdf.getTextWidth(this.t(text)); }
  /** Wrap and cap at maxLines, cutting at the last sentence end that fits; adds an ellipsis otherwise. */
  capped(text: string, size: number, width: number, maxLines: number, bold = false): string[] {
    const ls = this.wrap(text, size, width, bold);
    if (ls.length <= maxLines) return ls;
    // Sentence ends only where punctuation is followed by whitespace (decimals such as 3.2 never split).
    const sentences = text.split(/(?<=[.!?])\s+/);
    let acc = "";
    for (const s of sentences) {
      const next = acc ? `${acc} ${s}` : s;
      if (this.wrap(next.trim(), size, width, bold).length > maxLines) break;
      acc = next;
    }
    if (acc.trim()) return this.wrap(acc.trim(), size, width, bold);
    const cut = ls.slice(0, maxLines);
    cut[maxLines - 1] = `${cut[maxLines - 1]!.replace(/\s+\S*$/, "")} …`;
    return cut;
  }
  lines(ls: string[], x: number, y: number, size: number, bold = false, color: RGB = COLOR.ink, k = 1.36): number {
    this.font(size, bold, color);
    ls.forEach((l, i) => this.pdf.text(l, x, y + lh(size, k) * (i + 0.8)));
    if (ls.length) this.pageHasBody = true;
    return ls.length * lh(size, k);
  }
  box(x: number, y: number, w: number, h: number, fill: RGB | null, stroke?: RGB, r = 2.8, lw = 0.25) {
    if (fill) this.fill(fill);
    if (stroke) { this.draw(stroke); this.pdf.setLineWidth(lw); }
    const style = fill && stroke ? "FD" : fill ? "F" : "S";
    if (this.pdf.roundedRect && r > 0) this.pdf.roundedRect(x, y, w, h, r, r, style);
    else this.pdf.rect(x, y, w, h, style);
  }
  newPage() {
    this.pdf.addPage();
    this.page++;
    this.y = TOP;
    this.pageHasBody = false;
  }
  /** Start a new page only when the block does not fit AND the current page already has content (no blank pages). */
  ensure(h: number) {
    if (this.y + h > BOTTOM && this.pageHasBody) this.newPage();
  }
  room() { return BOTTOM - this.y; }
  /** Section start: new page only when less than `share` of the page height remains. */
  sectionBreak(share = 0.45) {
    if (this.pageHasBody && this.room() < (BOTTOM - TOP) * share) this.newPage();
    else if (this.pageHasBody) this.y += 4;
  }
  h2(text: string, keep = 26) {
    this.ensure(12 + keep);
    this.lines([this.t(text)], MX, this.y, 14.5, true, COLOR.navy);
    this.y += lh(14.5) + 0.6;
    this.fill(COLOR.teal);
    this.pdf.rect(MX, this.y, CW, 0.7, "F");
    this.y += 3.2;
  }
  h3(text: string, keep = 18) {
    this.ensure(8 + keep);
    this.y += 1.5;
    this.y += this.lines(this.wrap(text, 11, CW, true), MX, this.y, 11, true, COLOR.navy) + 1;
  }
  para(text: string, size = 9.2, color: RGB = COLOR.ink, x: number = MX, w: number = CW) {
    const ls = this.wrap(text, size, w);
    for (let i = 0; i < ls.length; ) {
      if (this.room() < lh(size) * 2 && this.pageHasBody) this.newPage();
      const n = Math.max(1, Math.floor(this.room() / lh(size)));
      const chunk = ls.slice(i, i + n);
      this.y += this.lines(chunk, x, this.y, size, false, color);
      i += chunk.length;
    }
    this.y += 1.6;
  }
}

// ------------------------------------------------------------------ badges

type BadgeKind = "red" | "amber" | "green" | "neutral" | "check" | "flag" | "gm" | "trend" | "pri-red" | "pri-amber" | "pri-purple" | "pri-green" | "pri-neutral";
/**
 * P60.1 terminology (one meaning per label across page 1, charts, assessments and the results table):
 * HIGH PRIORITY / MONITORING / DATA CHECK = the finding's medical-review (warning) priority;
 * TREND REVIEW = a significant longitudinal change (P56 review rules) that never establishes a priority by itself;
 * CHECK = an observation-level data-quality rule. Clinical class stays a separate badge.
 */
export const TREND_REVIEW_LABEL = "TREND REVIEW";
const COMPACT_PRIORITY: Record<WarningPriority, string> = {
  HIGH_PRIORITY_MEDICAL_REVIEW: "HIGH PRIORITY", MONITORING: "MONITORING", DATA_CHECK: "DATA CHECK", WITHIN_CRITERIA: "WITHIN CRITERIA", INSUFFICIENT_EVIDENCE: "NEUTRAL",
};
const showsPriority = (p: WarningPriority | null | undefined): p is WarningPriority => p === "HIGH_PRIORITY_MEDICAL_REVIEW" || p === "MONITORING" || p === "DATA_CHECK";
const PRIORITY_BADGE: Record<WarningPriority, BadgeKind> = {
  HIGH_PRIORITY_MEDICAL_REVIEW: "pri-red", MONITORING: "pri-amber", DATA_CHECK: "pri-purple", WITHIN_CRITERIA: "pri-green", INSUFFICIENT_EVIDENCE: "pri-neutral",
};
function badgeOf(cls: DisplayClass): BadgeKind {
  return cls === "RED" ? "red" : cls === "AMBER" ? "amber" : cls === "NORMAL" ? "green" : "neutral";
}
function badgeLabel(cls: DisplayClass, basis: ClassBasis) {
  const base = cls === "NORMAL" ? "GREEN" : cls;
  return basis === "provisional" ? `${base} (PROVISIONAL)` : base;
}
/** Width a badge will take (same arithmetic as badge()). */
function badgeWidth(L: P, kind: BadgeKind, label: string, size = 6.6, flag = true): number {
  const flagW = flag && (kind === "flag" || kind === "pri-red" || kind === "pri-amber" || kind === "pri-purple") ? 2.6 : 0;
  return L.width(label, size, true) + 3 + flagW;
}
/** Draws a badge at (x, y = top); returns its width. */
function badge(L: P, kind: BadgeKind, label: string, x: number, y: number, size = 6.6, flag = true): number {
  const flagW = flag && (kind === "flag" || kind === "pri-red" || kind === "pri-amber" || kind === "pri-purple") ? 2.6 : 0;
  const w = L.width(label, size, true) + 3 + flagW;
  const h = 3.9;
  if (kind === "pri-red" || kind === "pri-amber" || kind === "pri-purple" || kind === "pri-green") {
    // Warning-priority pill: filled tone with a white vector flag (review priority, not a clinical class).
    const c = kind === "pri-red" ? COLOR.redDeep : kind === "pri-amber" ? COLOR.amberDeep : kind === "pri-purple" ? COLOR.violet : COLOR.green;
    L.box(x, y, w, h, c, undefined, 0.9);
    if (flagW) {
      L.draw(COLOR.white);
      L.pdf.setLineWidth(0.3);
      L.pdf.line(x + 1.3, y + 0.8, x + 1.3, y + 3.2);
      if (L.pdf.triangle) { L.fill(COLOR.white); L.pdf.triangle(x + 1.3, y + 0.8, x + 2.9, y + 1.35, x + 1.3, y + 1.9, "F"); }
    }
    L.lines([L.t(label)], x + 1.5 + flagW, y + 0.2, size, true, COLOR.white, 1.2);
  } else if (kind === "pri-neutral") {
    L.box(x, y, w, h, COLOR.white, COLOR.neutral, 0.9, 0.3);
    L.lines([L.t(label)], x + 1.5, y + 0.2, size, true, NEUTRAL_TEXT, 1.2);
  } else if (kind === "red" || kind === "amber" || kind === "green") {
    const c = kind === "red" ? COLOR.red : kind === "amber" ? COLOR.amber : COLOR.green;
    L.box(x, y, w, h, c, undefined, 0.9);
    L.lines([L.t(label)], x + 1.5, y + 0.2, size, true, COLOR.white, 1.2);
  } else if (kind === "neutral") {
    L.box(x, y, w, h, COLOR.neutralSoft, COLOR.neutral, 0.9, 0.25);
    L.lines([L.t(label)], x + 1.5, y + 0.2, size, true, NEUTRAL_TEXT, 1.2);
  } else if (kind === "check") {
    L.box(x, y, w, h, COLOR.white, COLOR.violet, 0.9, 0.4);
    L.lines([L.t(label)], x + 1.5, y + 0.2, size, true, COLOR.violet, 1.2);
  } else if (kind === "trend") {
    // Trend review: teal outline with a small rising/falling glyph — deliberately unlike the red priority pill.
    L.box(x, y, w, h, COLOR.white, COLOR.teal, 0.9, 0.4);
    L.lines([L.t(label)], x + 1.5, y + 0.2, size, true, COLOR.teal, 1.2);
  } else if (kind === "gm") {
    L.box(x, y, w, h, COLOR.rule, undefined, 0.9);
    L.lines([L.t(label)], x + 1.5, y + 0.2, size, true, COLOR.navy, 1.2);
  } else {
    L.box(x, y, w, h, COLOR.white, COLOR.red, 0.9, 0.4);
    // vector flag: pole + pennant (outline only — review priority is never filled)
    L.draw(COLOR.red);
    L.pdf.setLineWidth(0.3);
    L.pdf.line(x + 1.3, y + 0.8, x + 1.3, y + 3.2);
    if (L.pdf.triangle) { L.fill(COLOR.red); L.pdf.triangle(x + 1.3, y + 0.8, x + 2.9, y + 1.35, x + 1.3, y + 1.9, "F"); }
    L.lines([L.t(label)], x + 1.5 + flagW, y + 0.2, size, true, COLOR.red, 1.2);
  }
  return w;
}

// ------------------------------------------------------------------ page 1

function hero(L: P, r: PremiumReport) {
  const x = MX, y = TOP1, h = r.demonstrationLabel && r.header.provenance === "synthetic" ? 48.5 : 47;
  const strips = 24;
  for (let i = 0; i < strips; i++) {
    const f = i / (strips - 1);
    const a = f < 0.6 ? COLOR.navy : COLOR.navy2, b = f < 0.6 ? COLOR.navy2 : COLOR.teal, k = f < 0.6 ? f / 0.6 : (f - 0.6) / 0.4;
    const c: RGB = [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
    L.fill(c);
    L.pdf.rect(x + (CW * i) / strips, y, CW / strips + 0.3, h, "F");
  }
  L.lines([L.t("MITOCHONDRIA  ·  ASTRONAUT HEALTH INTELLIGENCE")], x + 5, y + 3, 7.6, true, COLOR.heroKicker);
  L.lines([L.t("Health Intelligence Report")], x + 5, y + 7.5, 22, true, COLOR.white, 1.1);
  L.lines([L.t("Preliminary automated assessment — for Ground Medical review. Not a physician's diagnosis.")], x + 5, y + 17, 9, false, COLOR.heroText);
  const tiles = [
    ["ASTRONAUT", r.header.astronaut],
    ["MISSION", r.header.mission],
    ["ASSESSMENT PERIOD", r.header.period],
    ["EXAMINATIONS WITH DATA", `${r.header.examinationDates.join(", ")}`],
  ];
  const tw = (CW - 10 - 3 * 2.5) / 4;
  tiles.forEach(([k, v], i) => {
    const tx = x + 5 + i * (tw + 2.5);
    L.box(tx, y + 24, tw, 13, [40, 72, 110], undefined, 1.6);
    L.lines([L.t(k!)], tx + 2, y + 25, 6.2, true, COLOR.heroKicker);
    L.lines(L.capped(v!, 7.8, tw - 4, 2), tx + 2, y + 28.4, 7.8, false, COLOR.white, 1.25);
  });
  if (r.header.provenance === "synthetic" && r.demonstrationLabel) {
    L.lines(L.capped("SYNTHETIC DEMONSTRATION DATA — not real astronaut data. Age, sex, symptoms, medications and history are not recorded or assumed.", 7, CW - 10, 1, true), x + 5, y + 38.2, 7, true, COLOR.synthetic, 1.2);
    L.lines([L.t(r.demonstrationLabel)], x + 5, y + 41.9, 8.6, true, COLOR.white, 1.2);
  } else if (r.header.provenance === "synthetic")
    L.lines(L.capped("SYNTHETIC DEMONSTRATION DATA — not real astronaut data. Age, sex, symptoms, medications and medical history are not recorded and are not assumed.", 7.2, CW - 10, 2, true), x + 5, y + 38.6, 7.2, true, COLOR.synthetic, 1.25);
  L.y = y + h + 4;
}

function alertCard(L: P, a: AlertCard, x: number, y: number, w: number, measureOnly: boolean): number {
  const pr = a.mixed ? "neutral" : a.priority ? WARNING_PRIORITY_TONE[a.priority] : null;
  const tone = pr ? (pr === "purple" ? "check" : pr) : a.kind === "clinical-red" ? "red" : a.kind === "data-check" ? "check" : a.kind === "clinical-amber" || a.kind === "provisional" ? "amber" : a.kind === "review-high" ? "red" : "neutral";
  const deep: RGB = tone === "red" ? COLOR.redDeep : tone === "amber" ? COLOR.amberDeep : tone === "check" ? COLOR.violet : tone === "green" ? COLOR.green : COLOR.navy;
  const soft: RGB = tone === "red" ? COLOR.redSoft : tone === "amber" ? COLOR.amberSoft : tone === "check" ? COLOR.violetSoft : tone === "green" ? COLOR.greenSoft : COLOR.panel;
  const inner = w - 7;
  const title = L.capped(a.title, 10, inner, 2, true);
  const ev = a.findingIds.length > 1 ? a.evidence.split("\n").flatMap((x) => L.capped(x, 8.1, inner, 6)) : L.capped(a.evidence, 8.1, inner, a.priority ? 6 : 7);
  const why = a.priority && a.rationale && a.findingIds.length === 1 ? L.capped(`Why this priority: ${a.rationale}`, 7.3, inner, 4) : [];
  const next = L.capped(`Next: ${a.nextStep}`, 7.9, inner, 4);
  const clinicalRow = Boolean(a.priority) && a.findingIds.length === 1;
  const badgeRows = a.mixed || a.priority ? 5 + (clinicalRow ? 5 : 0) : a.badges.length ? 5 : 0;
  const h = 3 + badgeRows + title.length * lh(10) + 1 + ev.length * lh(8.1) + (why.length ? 1 + why.length * lh(7.3) : 0) + 3 + next.length * lh(7.9) + 2.5;
  if (measureOnly) return h;
  L.box(x, y, w, h, soft, undefined, 2.4);
  L.fill(deep);
  L.pdf.rect(x, y + 0.4, 1.6, h - 0.8, "F");
  let cy = y + 2.6;
  let bx = x + 4.2;
  if (a.mixed) {
    badge(L, "pri-neutral", "SEVERAL PRIORITIES — SEE EACH LINE", bx, cy);
    cy += 5;
  } else if (a.priority) {
    badge(L, PRIORITY_BADGE[a.priority], WARNING_PRIORITY_LABEL[a.priority], bx, cy);
    cy += 5;
    if (clinicalRow) {
      L.lines([L.t("Clinical class")], bx, cy + 0.1, 6.6, true, COLOR.muted, 1.2);
      bx += L.width("Clinical class", 6.6, true) + 1.8;
      const cls = a.clinical ?? "NEUTRAL";
      const basis = a.clinicalBasis ?? "none";
      bx += badge(L, cls === "NEUTRAL" || basis === "none" ? "neutral" : badgeOf(cls), cls === "NEUTRAL" || basis === "none" ? "NEUTRAL" : badgeLabel(cls, basis), bx, cy) + 1.5;
      if (a.dataCheck || a.badges.includes("DATA CHECK")) badge(L, "check", "DATA CHECK", bx, cy);
      cy += 5;
    }
  } else {
    for (const b of a.badges) {
      const kind: BadgeKind = /^RED/.test(b) ? "red" : /^AMBER/.test(b) ? "amber" : /^NORMAL|^GREEN/.test(b) ? "green" : b === "DATA CHECK" ? "check" : b.startsWith("HIGH") ? "flag" : "neutral";
      bx += badge(L, kind, b, bx, cy) + 1.5;
    }
    if (a.badges.length) cy += 5;
  }
  cy += L.lines(title, x + 4.2, cy, 10, true, deep);
  cy += 1;
  cy += L.lines(ev, x + 4.2, cy, 8.1, false, COLOR.ink);
  if (why.length) { cy += 1; cy += L.lines(why, x + 4.2, cy, 7.3, false, [71, 85, 105]); }
  cy += 1.2;
  L.draw([180, 180, 190]);
  L.pdf.setLineWidth(0.2);
  L.dash(true, [0.8, 0.8]);
  L.pdf.line(x + 4.2, cy, x + w - 3, cy);
  L.dash(false);
  cy += 1.6;
  L.lines(next, x + 4.2, cy, 7.9, false, COLOR.ink);
  return h;
}

function demonstrationBanner(L: P, r: PremiumReport) {
  if (!r.demonstrationLabel) return;
  const text = `Literature criteria${r.options.demonstrationMappingsActive ? " and synthetic identity mappings" : ""} colour results for this demonstration only: not Researcher-approved, never validated alerts, never applied to real data.`;
  const ls = L.wrap(text, 7.4, CW - 8, true);
  const h = ls.length * lh(7.4) + 2.6;
  L.box(MX, L.y - 1.5, CW, h, [255, 248, 225], COLOR.amber, 1.4, 0.35);
  L.lines(ls, MX + 4, L.y - 0.4, 7.4, true, COLOR.amberDeep);
  L.y += h + 1;
}

function pageOne(L: P, r: PremiumReport) {
  hero(L, r);
  demonstrationBanner(L, r);
  L.h2("Most important findings", 40);
  const cards = r.patternAlerts ?? r.alerts;
  if (cards.length === 1) {
    const h = alertCard(L, cards[0]!, MX, L.y, CW, true);
    alertCard(L, cards[0]!, MX, L.y, CW, false);
    L.y += h + 3;
  } else {
    for (let i = 0; i < cards.length; i += 2) {
      const pair = cards.slice(i, i + 2);
      const h = Math.max(...pair.map((c) => alertCard(L, c, 0, 0, COL2, true)));
      L.ensure(h);
      pair.forEach((c, j) => alertCard(L, c, MX + j * (COL2 + GUT), L.y, COL2, false));
      L.y += h + GUT;
    }
  }
  // legend: warning priority (panels) and clinical class (badges) are separate fields
  const usesPriority = cards.some((c) => c.priority);
  L.usesPriorityLayout = usesPriority;
  const items: [BadgeKind, string, string][] = usesPriority
    ? [
        ["pri-red", "RED", "High priority medical review; not a diagnosis"],
        ["pri-amber", "AMBER", "Monitoring or further evaluation"],
        ["pri-purple", "DATA CHECK", "Purple — verify the measurement first"],
        ["green", "GREEN", "Within applicable reference criteria"],
        ["neutral", "NEUTRAL", "Insufficient classification evidence"],
        ...(r.options.provisionalActive ? ([["amber", "(PROVISIONAL)", "Literature-based class; not clinically validated"]] as [BadgeKind, string, string][]) : []),
        ...(r.rows.some((x) => x.axes.review.value === "HIGH") ? ([["trend", TREND_REVIEW_LABEL, "Significant change between examinations; not a priority"]] as [BadgeKind, string, string][]) : []),
      ]
    : [
        ["red", "RED", "Important medical concern — criterion met"],
        ["amber", "AMBER", "Monitor / further evaluation"],
        ["green", "GREEN", "Supported normal — criterion applicable"],
        ["neutral", "NEUTRAL", "Insufficient evidence to classify"],
        ["check", "DATA CHECK", "Verify the measurement before interpretation"],
        ["flag", "HIGH-PRIORITY REVIEW", "Urgency only — not a classification"],
        ...(r.rows.some((x) => x.axes.review.value === "HIGH") ? ([["trend", TREND_REVIEW_LABEL, "Significant change between examinations; not a priority"]] as [BadgeKind, string, string][]) : []),
      ];
  if (legendProblems(REPORT_LEGEND).length) throw new Error("Report legend failed validation; PDF not created.");
  const note = usesPriority ? L.wrap(r.basisText, 6.8, CW - 6) : [];
  const legendRows = Math.ceil(items.length / 3);
  const lgH = legendRows * 9 + 3 + (note.length ? note.length * lh(6.8) + 1 : 0);
  L.ensure(lgH);
  L.box(MX, L.y, CW, lgH, COLOR.panel, COLOR.rule);
  items.forEach(([k, label, text], i) => {
    const cx = MX + 3 + (i % 3) * (CW / 3), cy = L.y + 2 + Math.floor(i / 3) * 9;
    const bw = badge(L, k, label, cx, cy);
    L.lines(L.capped(text, 7, CW / 3 - bw - 6, 2), cx + bw + 1.5, cy - 0.3, 7, false, COLOR.ink, 1.25);
  });
  if (note.length) L.lines(note, MX + 3, L.y + 2 + legendRows * 9 - 0.6, 6.8, false, COLOR.muted, 1.25);
  L.y += lgH + 3;
  if (r.nextSteps.length) {
    // Steps repeat the cards' "Next" lines; on page 1 show those that fit (at least one) to avoid a near-empty page 2.
    const stepH = r.nextSteps.map((s) => L.capped(s, 8.1, CW - 6, 2).length * lh(8.1) + 0.6);
    let fit = 0, acc = 9.5;
    for (const h of stepH) { if (L.y + acc + h > BOTTOM) break; acc += h; fit++; }
    const steps = L.page === 1 && fit >= 1 && L.usesPriorityLayout ? r.nextSteps.slice(0, fit) : r.nextSteps;
    L.h3("Priority next steps", 12);
    steps.forEach((s, i) => {
      const ls = L.capped(s, 8.1, CW - 6, 2);
      L.ensure(ls.length * lh(8.1));
      L.lines([`${i + 1}.`], MX, L.y, 8.1, true, COLOR.navy);
      L.y += L.lines(ls, MX + 5, L.y, 8.1) + 0.6;
    });
  }
  if (usesPriority) return;
  const basis = L.wrap(r.basisText, 7.5, CW - 6);
  L.ensure(basis.length * lh(7.5) + 4);
  L.y += 1.5;
  L.box(MX, L.y, CW, basis.length * lh(7.5) + 3, COLOR.tealSoft, undefined, 1.8);
  L.lines(basis, MX + 3, L.y + 1.4, 7.5, false, [51, 65, 85]);
  L.y += basis.length * lh(7.5) + 5;
}

// ------------------------------------------------------------------ overview

function overview(L: P, r: PremiumReport) {
  // P60: start on page 1 when at least 45 % of it is free (short reports no longer leave page 1 mostly empty).
  if (L.page === 1 && L.room() < (BOTTOM - TOP) * 0.45) L.newPage();
  else L.y += 4;
  L.h2("Executive health overview");
  L.para(r.lead, 9);
  for (let i = 0; i < r.overview.length; i += 2) {
    const pair = r.overview.slice(i, i + 2).map((q, j) => ({ q: L.wrap(`${i + j + 1} · ${q.question}`, 8.6, COL2, true), a: L.capped(q.answer, 8.1, COL2, 16) }));
    const h = Math.max(...pair.map((p) => p.q.length * lh(8.6) + p.a.length * lh(8.1))) + 3;
    L.ensure(h);
    pair.forEach((p, j) => {
      const x = MX + j * (COL2 + GUT);
      let cy = L.y + 0.8;
      cy += L.lines(p.q, x, cy, 8.6, true, COLOR.navy);
      L.lines(p.a, x, cy, 8.1);
    });
    L.y += h;
    L.draw(COLOR.rule);
    L.pdf.setLineWidth(0.25);
    L.pdf.line(MX, L.y - 0.8, MX + CW, L.y - 0.8);
  }
  const tiles = r.systems;
  // P60.1: the tile grid is kept together with its heading (no tile row orphaned onto the next page); when it
  // does not fit, the body text is first shortened (5 → 3 lines) before the whole grid moves on.
  const layoutTiles = (cap: number) => {
    const rows: { row: SystemTile[]; bodies: string[][]; h: number }[] = [];
    for (let i = 0; i < tiles.length; i += 3) {
      const row = tiles.slice(i, i + 3);
      const bodies = row.map((t) => L.capped(t.lines.join("; "), 7.6, COL3 - 6, cap));
      rows.push({ row, bodies, h: Math.max(...row.map((t, j) => bodies[j]!.length * lh(7.8) + flowBadges(L, tileBadges(t), 0, 0, COL3 - 6, true) * 4.6)) + 9 });
    }
    return { rows, total: rows.reduce((s2, x) => s2 + x.h + GUT, 0) };
  };
  const headH = 8 + lh(11) + 2.5;
  let grid = layoutTiles(5);
  if (headH + grid.total > L.room()) { const tight = layoutTiles(3); if (headH + tight.total <= L.room()) grid = tight; }
  if (headH + grid.total > L.room() && headH + grid.total <= BOTTOM - TOP && L.pageHasBody) L.newPage();
  L.h3("Body systems at a glance", grid.rows[0]?.h ?? 30);
  for (const { row, bodies, h } of grid.rows) {
    L.ensure(h);
    row.forEach((t, j) => systemTile(L, t, bodies[j]!, MX + j * (COL3 + GUT), L.y, COL3, h));
    L.y += h + GUT;
  }
}
function tileBadges(t: SystemTile): [BadgeKind, string][] {
  const out: [BadgeKind, string][] = [];
  if (t.measured && t.worst !== "NEUTRAL") out.push([badgeOf(t.worst), badgeLabel(t.worst, t.basis)]);
  if (t.high) out.push(["trend", TREND_REVIEW_LABEL]);
  if (t.dataCheck) out.push(["check", "DATA CHECK"]);
  return out;
}
/** Draws badges left-to-right, wrapping to a new row when the width is exceeded; returns rows used. */
function flowBadges(L: P, bs: [BadgeKind, string][], x: number, y: number, w: number, measureOnly: boolean): number {
  if (!bs.length) return 0;
  let bx = x, row = 0;
  for (const [k, label] of bs) {
    const bw = badgeWidth(L, k, label);
    if (bx > x && bx + bw > x + w) { row++; bx = x; }
    if (!measureOnly) badge(L, k, label, bx, y + row * 4.6);
    bx += bw + 1.2;
  }
  return row + 1;
}
function systemTile(L: P, t: SystemTile, body: string[], x: number, y: number, w: number, h: number) {
  const c = t.worst === "RED" ? COLOR.red : t.worst === "AMBER" ? COLOR.amber : t.worst === "NORMAL" ? COLOR.green : COLOR.neutral;
  L.box(x, y, w, h, COLOR.white, COLOR.rule, 2.2);
  L.fill(c);
  L.pdf.rect(x + 0.3, y, w - 0.6, 1.3, "F");
  L.lines([L.t(t.label)], x + 3, y + 2.6, 9.2, true, COLOR.navy);
  const bs = tileBadges(t);
  const rowsUsed = flowBadges(L, bs, x + 3, y + 7, w - 6, false);
  L.lines(body, x + 3, y + 7 + rowsUsed * 4.6, 7.8, false, t.measured ? COLOR.ink : COLOR.muted);
}

// ------------------------------------------------------------------ integrated + diagram

function diagram(L: P, r: PremiumReport) {
  const g = r.graph;
  if (g.nodes.length < 2) {
    L.para("Fewer than two related body systems were measured, so no relationship diagram is drawn.", 8.4, COLOR.muted);
    return;
  }
  // P60: the P59 body-system graph uses the same non-overlapping numbered map. Node contents come from the
  // node's own marker identities (P59 grouped lipids and glycaemia together, which mixed their values).
  const markerRows = (n: (typeof g.nodes)[number]) => r.rows.filter((x) => ((n as { markers?: string[] }).markers ?? []).includes(x.metricId));
  const toneOf = (rs: ResultRow[]): WarningPriority => {
    const worst = rs.reduce<DisplayClass>((m, x) => (rankOf(x.displayClass) > rankOf(m) ? x.displayClass : m), "NEUTRAL");
    return worst === "RED" ? "HIGH_PRIORITY_MEDICAL_REVIEW" : worst === "AMBER" ? "MONITORING" : rs.some((x) => x.axes.dataQuality.value === "DATA_QUALITY_WARNING") ? "DATA_CHECK" : worst === "NORMAL" ? "WITHIN_CRITERIA" : "INSUFFICIENT_EVIDENCE";
  };
  const kickerOf = (rs: ResultRow[]) => {
    const worst = rs.reduce<DisplayClass>((m, x) => (rankOf(x.displayClass) > rankOf(m) ? x.displayClass : m), "NEUTRAL");
    const basis = rs.find((x) => x.displayClass === worst)?.basis ?? "none";
    return `${worst === "NEUTRAL" ? "NEUTRAL" : badgeLabel(worst, basis)}${rs.some((x) => x.axes.review.value === "HIGH") ? ` · ${TREND_REVIEW_LABEL}` : ""}${rs.some((x) => x.axes.dataQuality.value === "DATA_QUALITY_WARNING") ? " · DATA CHECK" : ""}`;
  };
  const kindOf = (cls: string): "established" | "co-occurrence" | "hypothesis" => (cls === "ESTABLISHED_MECHANISM" ? "established" : cls === "HYPOTHESIS" ? "hypothesis" : "co-occurrence");
  patternMap(L, {
    nodes: g.nodes.map((n) => { const rs = markerRows(n); return { id: n.id, title: n.label, priority: toneOf(rs), dataCheck: false, headline: summarize(rs), kicker: kickerOf(rs) }; }),
    edges: g.edges.map((e, i) => ({ from: e.from, to: e.to, kind: kindOf(e.cls), label: `${e.label}${e.referencePending ? " (reference pending)" : ""}`, sourceId: null, n: i + 1 })),
  });
}
const rankOf = (c: DisplayClass) => ({ RED: 3, AMBER: 2, NORMAL: 1, NEUTRAL: 0 })[c];
function summarize(rs: ResultRow[]) {
  const by = new Map<string, ResultRow[]>();
  for (const r of rs) by.set(`${r.name}|${r.unit}`, [...(by.get(`${r.name}|${r.unit}`) ?? []), r]);
  return [...by.values()].filter((s) => s.some((r) => r.displayClass !== "NEUTRAL" || r.axes.review.value === "HIGH" || r.axes.dataQuality.value === "DATA_QUALITY_WARNING")).slice(0, 3).map((s) => `${s[0]!.name.replace(/\s*\(.*\)$/, "")} ${s.map((r) => r.valueText).join("→")}`).join(" · ") || "measured; no flag";
}

function integrated(L: P, r: PremiumReport) {
  if (r.patterns?.patterns.length) return integratedPatterns(L, r);
  L.sectionBreak(0.35);
  L.h2("Integrated health assessment", 70);
  L.para("Findings are read as connected patterns. Solid arrows: established biological links (with source). Dashed lines: co-occurrence in this period or a labelled hypothesis — neither shows cause.", 8.6, COLOR.ink);
  diagram(L, r);
  for (const s of r.integrated) {
    L.h3(s.heading);
    for (const p of s.paragraphs) L.para(p, 8.9);
  }
}

// ------------------------------------------------------------------ P60: integrated patterns + relationship map

const TONE_OF: Record<WarningPriority, { stroke: RGB; soft: RGB; text: RGB }> = {
  HIGH_PRIORITY_MEDICAL_REVIEW: { stroke: COLOR.redDeep, soft: COLOR.redSoft, text: COLOR.redDeep },
  MONITORING: { stroke: COLOR.amberDeep, soft: COLOR.amberSoft, text: COLOR.amberDeep },
  DATA_CHECK: { stroke: COLOR.violet, soft: COLOR.violetSoft, text: COLOR.violet },
  WITHIN_CRITERIA: { stroke: COLOR.green, soft: COLOR.greenSoft, text: COLOR.green },
  INSUFFICIENT_EVIDENCE: { stroke: COLOR.neutral, soft: COLOR.panel, text: NEUTRAL_TEXT },
};
const SHORT_PRIORITY: Record<WarningPriority, string> = {
  HIGH_PRIORITY_MEDICAL_REVIEW: "HIGH PRIORITY REVIEW", MONITORING: "MONITORING", DATA_CHECK: "DATA CHECK", WITHIN_CRITERIA: "WITHIN CRITERIA", INSUFFICIENT_EVIDENCE: "NEUTRAL",
};

/**
 * Relationship map: patterns sit in a fixed grid around the most-connected pattern; lines run
 * between box edges and carry only a numbered marker in the gap between boxes. All wording is in
 * the numbered legend below, so labels can never overlap boxes, lines or each other.
 */
export function mapLayout(nodes: readonly { id: string }[], edges: readonly { from: string; to: string }[]): { id: string; col: number; row: number }[] {
  if (!nodes.length) return [];
  const deg = (id: string) => edges.filter((e) => e.from === id || e.to === id).length;
  const lead = [...nodes].sort((a, b) => deg(b.id) - deg(a.id))[0]!;
  const linked = nodes.filter((n) => n.id !== lead.id && edges.some((e) => (e.from === lead.id && e.to === n.id) || (e.to === lead.id && e.from === n.id)));
  const others = nodes.filter((n) => n.id !== lead.id && !linked.includes(n));
  const ring: [number, number][] = [[0, 1], [1, 0], [1, 2], [2, 1], [0, 0], [0, 2], [2, 0], [2, 2]];
  const out = [{ id: lead.id, col: 1, row: 1 }];
  const queue = [...linked, ...others];
  queue.forEach((n, i) => {
    if (i < ring.length) out.push({ id: n.id, col: ring[i]![1], row: ring[i]![0] });
    else out.push({ id: n.id, col: (i - ring.length) % 3, row: 3 + Math.floor((i - ring.length) / 3) });
  });
  // Deterministic improvement: swap cells (including empty ones) while it lowers the cost —
  // lines through a box that is not their endpoint, edge markers hidden under a box, edge crossings, length.
  const cells: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]];
  const W3 = 3, H3 = 2.2, GX = 0.25, GY = 1; // box size and gaps in abstract units (box ≈ 3:1 like the drawing)
  const centre = (p: { col: number; row: number }) => [p.col * (W3 + GX) + W3 / 2, p.row * (H3 + GY) + H3 / 2] as const;
  const inBox = (x: number, y: number, p: { col: number; row: number }) => { const [cx, cy] = centre(p); return Math.abs(x - cx) < W3 / 2 + 0.05 && Math.abs(y - cy) < H3 / 2 + 0.05; };
  const cost = (lay: { id: string; col: number; row: number }[]) => {
    const at = new Map(lay.map((p) => [p.id, p]));
    let c = 0;
    const segs: [number, number, number, number][] = [];
    for (const e of edges) {
      const a = at.get(e.from), b = at.get(e.to);
      if (!a || !b) continue;
      const [ax, ay] = centre(a), [bx, by] = centre(b);
      segs.push([ax, ay, bx, by]);
      c += Math.hypot(bx - ax, by - ay);
      for (const q of lay) {
        if (q === a || q === b) continue;
        for (let t = 0.08; t < 0.93; t += 0.04) if (inBox(ax + (bx - ax) * t, ay + (by - ay) * t, q)) { c += 1000; break; }
      }
      if (lay.some((q) => inBox((ax + bx) / 2, (ay + by) / 2, q))) c += 1000;
    }
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
      const [a, b, c2, d] = segs[i]!, [e2, f, g, h] = segs[j]!;
      const den = (a - c2) * (f - h) - (b - d) * (e2 - g);
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a - e2) * (f - h) - (b - f) * (e2 - g)) / den, u = -((a - c2) * (b - f) - (b - d) * (a - e2)) / den;
      if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) c += 100;
    }
    return c;
  };
  if (nodes.length <= 9) {
    let best = out.map((p) => ({ ...p })), bestCost = cost(best);
    for (let improved = true, guard = 0; improved && guard < 200; guard++) {
      improved = false;
      for (let i = 0; i < best.length; i++)
        for (const [row, col] of cells) {
          const trial = best.map((p) => ({ ...p }));
          const other = trial.find((p) => p.row === row && p.col === col);
          if (other) { other.row = trial[i]!.row; other.col = trial[i]!.col; }
          trial[i]!.row = row; trial[i]!.col = col;
          const tc = cost(trial);
          if (tc < bestCost - 1e-9) { best = trial; bestCost = tc; improved = true; }
        }
    }
    out.splice(0, out.length, ...best);
  }
  // Drop empty top rows (compact maps for few patterns).
  const minRow = Math.min(...out.map((p) => p.row));
  return out.map((p) => ({ ...p, row: p.row - minRow }));
}

function clipToBox(cx: number, cy: number, tx: number, ty: number, w: number, h: number): [number, number] {
  const dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const sx = dx ? (w / 2 + 0.8) / Math.abs(dx) : Infinity, sy = dy ? (h / 2 + 0.8) / Math.abs(dy) : Infinity;
  const k = Math.min(sx, sy);
  return [cx + dx * k, cy + dy * k];
}

type MapGraph = { nodes: { id: string; title: string; priority: WarningPriority; dataCheck: boolean; headline: string; kicker?: string }[]; edges: { from: string; to: string; kind: "established" | "co-occurrence" | "hypothesis"; label: string; sourceId: string | null; n: number }[] };
function patternMap(L: P, g: MapGraph) {
  const lay = mapLayout(g.nodes, g.edges);
  const rows = Math.max(...lay.map((p) => p.row)) + 1;
  const bw = COL3, gy = 10, pad = 4;
  // P60.1: box height follows the longest card (title ≤ 3 lines, values ≤ 6 lines) instead of truncating.
  const cardText = (n: MapGraph["nodes"][number]) => {
    const title = L.capped(n.title, 8.2, bw - 4.8, 3, true);
    const head = L.capped(n.headline, 6.4, bw - 4.8, 6);
    return { title, head };
  };
  const texts = new Map(g.nodes.map((n) => [n.id, cardText(n)]));
  const bh = Math.max(22, ...[...texts.values()].map((t) => 4.4 + t.title.length * lh(8.2, 1.15) + 0.3 + t.head.length * lh(6.4, 1.15) + 1.8));
  const h = rows * bh + (rows - 1) * gy + 2 * pad;
  const legend = g.edges.map((e) => {
    const a = g.nodes.find((n) => n.id === e.from)!, b = g.nodes.find((n) => n.id === e.to)!;
    const kind = e.kind === "established" ? "Established" : e.kind === "hypothesis" ? "Hypothesis" : "Co-occurrence";
    return { n: e.n, text: L.wrap(`${a.title} — ${b.title}. ${kind}: ${e.label}${e.sourceId ? ` (${shortSource(e.sourceId)})` : ""}.`, 7.4, CW - 9) };
  });
  const legendH = legend.reduce((s, x) => s + x.text.length * lh(7.4) + 0.8, 0) + (legend.length ? 3 : 0);
  L.ensure(h + legendH + 6);
  const top = L.y;
  L.box(MX, top, CW, h, COLOR.white, COLOR.rule);
  const pos = new Map(lay.map((p) => [p.id, { x: MX + p.col * (COL3 + GUT), y: top + pad + p.row * (bh + gy) }]));
  // edges first (under boxes)
  for (const e of g.edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    const acx = a.x + bw / 2, acy = a.y + bh / 2, bcx = b.x + bw / 2, bcy = b.y + bh / 2;
    const [sx, sy] = clipToBox(acx, acy, bcx, bcy, bw, bh);
    const [ex, ey] = clipToBox(bcx, bcy, acx, acy, bw, bh);
    const solid = e.kind === "established";
    L.draw(solid ? COLOR.teal : e.kind === "hypothesis" ? COLOR.violet : COLOR.neutral);
    L.pdf.setLineWidth(solid ? 0.5 : 0.4);
    L.dash(!solid, e.kind === "hypothesis" ? [0.5, 0.9] : [1.4, 1]);
    L.pdf.line(sx, sy, ex, ey);
    L.dash(false);
    if (solid && L.pdf.triangle) {
      const len = Math.hypot(ex - sx, ey - sy) || 1, ux = (ex - sx) / len, uy = (ey - sy) / len;
      L.fill(COLOR.teal);
      L.pdf.triangle(ex, ey, ex - ux * 2.4 - uy * 1.1, ey - uy * 2.4 + ux * 1.1, ex - ux * 2.4 + uy * 1.1, ey - uy * 2.4 - ux * 1.1, "F");
    }
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    L.fill(COLOR.white);
    L.draw(solid ? COLOR.teal : COLOR.neutral);
    L.pdf.setLineWidth(0.3);
    if (L.pdf.circle) L.pdf.circle(mx, my, 2.1, "FD");
    else L.pdf.rect(mx - 2, my - 2, 4, 4, "FD");
    L.font(6.8, true, COLOR.navy);
    L.pdf.text(L.t(String(e.n)), mx, my + 0.9, { align: "center" });
  }
  for (const n of g.nodes) {
    const p = pos.get(n.id)!;
    const tone = TONE_OF[n.priority];
    L.box(p.x, p.y, bw, bh, tone.soft, tone.stroke, 2, 0.45);
    L.lines([L.t(n.kicker ?? SHORT_PRIORITY[n.priority] + (n.dataCheck && n.priority !== "DATA_CHECK" ? " · DATA CHECK" : ""))], p.x + 2.4, p.y + 1.2, 6, true, tone.text, 1.15);
    const { title, head } = texts.get(n.id)!;
    L.lines(title, p.x + 2.4, p.y + 4.4, 8.2, true, COLOR.navy, 1.15);
    L.lines(head, p.x + 2.4, p.y + 4.4 + title.length * lh(8.2, 1.15) + 0.3, 6.4, false, [51, 65, 85], 1.15);
  }
  L.y = top + h + 3;
  for (const x of legend) {
    L.fill(COLOR.white);
    L.draw(COLOR.navy);
    L.pdf.setLineWidth(0.3);
    if (L.pdf.circle) L.pdf.circle(MX + 2.2, L.y + 1.7, 2, "FD");
    L.font(6.6, true, COLOR.navy);
    L.pdf.text(L.t(String(x.n)), MX + 2.2, L.y + 2.6, { align: "center" });
    L.y += L.lines(x.text, MX + 6, L.y, 7.4, false, COLOR.ink) + 0.8;
  }
  L.y += 2;
}

function integratedPatterns(L: P, r: PremiumReport) {
  L.sectionBreak(0.6);
  L.h2("Integrated health assessment", 90);
  L.para("Findings are read as connected patterns. Box colour = warning priority. Solid teal arrows: established biological links with a source. Dashed grey: co-occurrence in this period (not cause). Dotted violet: hypothesis. Numbers refer to the legend below the map.", 8.2, [51, 65, 85]);
  if (r.patternGraph.nodes.length >= 2) patternMap(L, r.patternGraph);
  L.h3("Overall picture", 20);
  for (const s of r.synthesis) L.para(s, 8.9);
}

// ------------------------------------------------------------------ P60: structured pattern assessment

function labelledRows(L: P, rows: [string, string][], header: (cont: boolean) => void) {
  const labelW = 27, bodyW = CW - labelW - 4, size = 7.9;
  for (const [label, text] of rows) {
    if (!text.trim()) continue;
    const body = text.split("\n").flatMap((p) => L.wrap(p, size, bodyW));
    let i = 0;
    while (i < body.length) {
      const fit = Math.max(1, Math.floor((BOTTOM - L.y - 1.6) / lh(size)));
      if (fit < Math.min(3, body.length - i)) { L.newPage(); header(true); continue; }
      const chunk = body.slice(i, i + fit);
      const h = Math.max(chunk.length * lh(size), L.wrap(i ? `${label} (cont.)` : label.toUpperCase(), 6.9, labelW - 2, true).length * lh(6.9)) + 1.4;
      L.lines(L.wrap(i ? `${label} (cont.)` : label.toUpperCase(), 6.9, labelW - 2, true), MX + 2, L.y + 0.4, 6.9, true, COLOR.teal);
      L.lines(chunk, MX + labelW + 2, L.y + 0.2, size);
      L.y += h;
      i += chunk.length;
      L.draw([241, 245, 249]);
      L.pdf.setLineWidth(0.2);
      L.pdf.line(MX, L.y - 0.5, MX + CW, L.y - 0.5);
      if (i < body.length) { L.newPage(); header(true); }
    }
  }
}

function patternAssessment(L: P, r: PremiumReport, p: ClinicalPattern, idx: number) {
  const tone = TONE_OF[p.priority];
  const bullets = (xs: readonly string[]) => xs.map((x) => `• ${x}`).join("\n");
  const related = (r.patternConcerns?.[p.id] ?? []).map((id) => r.concerns.find((c) => c.concernId === id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  const hyp = p.hypotheses.map((h) => h.replace(/^Hypothesis: /, "").toLowerCase());
  const alternatives = [...new Set(related.flatMap((c) => c.alternatives))].filter((a) => !hyp.some((h) => h.includes(a.toLowerCase().slice(0, 24)))).slice(0, 4);
  const status = related.map((c) => r.base.review.statuses[c.concernId]?.label).find((x) => x && !x.startsWith("Pending")) ?? "Pending Ground Medical review (session review — not persisted)";
  const extraSupport = p.supporting.filter((x) => !p.observed.includes(x));
  const rows: [string, string][] = [
    ["Warning priority", `${p.priorityLabel} (rule ${p.rules.join(", ")}). ${p.rationale}${p.dataCheck && p.priority !== "DATA_CHECK" ? " A DATA CHECK also applies; it does not lower this priority." : ""}`],
    ["Clinical class", bullets(r.patternClasses?.[p.id] ?? [])],
    ["Observed", bullets(p.observed)],
    ["Measurement quality", bullets(p.measurement)],
    ["Clinical pattern", p.pattern],
    ["Hypotheses", bullets(p.hypotheses.map((h) => h.replace(/^Hypothesis: (.)/, (_m, c: string) => c.toUpperCase())))],
    ["Also supporting", bullets(extraSupport)],
    ["Contradicting / limiting", bullets(p.contradicting)],
    ["Alternatives (P58)", bullets(alternatives)],
    ["Missing context", bullets(p.missing)],
    ["Confirm", bullets(p.confirm)],
    ["Sources · GM status", `${p.sources.map((s) => shortSource(s)).join("; ")}. Ground Medical: ${status}.`],
  ];
  const header = (cont: boolean) => {
    const title = L.capped(`${idx + 1} · ${p.title}${cont ? " (continued)" : ""}`, 10.4, CW - 70, 2, true);
    const hh = title.length * lh(10.4) + 3.2;
    L.box(MX, L.y, CW, hh, tone.soft, undefined, 2);
    L.fill(tone.stroke);
    L.pdf.rect(MX, L.y + 0.3, 1.4, hh - 0.6, "F");
    L.lines(title, MX + 3.4, L.y + 1.4, 10.4, true, COLOR.navy);
    let bx = MX + CW - 2;
    const pill = WARNING_PRIORITY_LABEL[p.priority];
    const pw = L.width(pill, 6.6, true) + 5.6;
    bx -= pw;
    badge(L, PRIORITY_BADGE[p.priority], pill, bx, L.y + 1.6);
    if (p.dataCheck && p.priority !== "DATA_CHECK") { const cw = L.width("DATA CHECK", 6.6, true) + 3; badge(L, "check", "DATA CHECK", bx - cw - 1.5, L.y + 1.6); }
    L.y += hh + 0.8;
  };
  L.ensure(40);
  header(false);
  labelledRows(L, rows, header);
  L.y += 4;
}

// ------------------------------------------------------------------ charts

/** P60.1: chart caption that never contradicts the bands actually drawn. */
export function chartCaption(c: PremiumChart): string {
  const drawn = c.bands.length > 0;
  const noBand = /no reference band is drawn|without a reference band/i;
  const limitation = c.base.limitation && !(drawn && noBand.test(c.base.limitation)) ? ` ${c.base.limitation}` : "";
  const bandNote = !drawn ? ""
    : c.dataCheck ? ` ${c.bandSource === "provisional" ? "Provisional literature" : "Approved"} criterion limits are shown only as dashed orientation lines until the measurement is verified.`
    : c.bandSource === "provisional" ? " No Researcher-approved criterion applies; the coloured bands are provisional literature criteria (synthetic demonstration)."
    : "";
  return `${c.base.name}. ${c.base.caption}${limitation}${bandNote}`;
}
/** P60.1: lower axis bound — never below zero for a series whose observed values (and drawn limits) are all non-negative. */
export function chartAxisFloor(values: readonly number[], limits: readonly number[], proposed: number): number {
  return proposed < 0 && values.every((v) => v >= 0) && limits.every((v) => v >= 0) ? 0 : proposed;
}
function chartBadges(c: PremiumChart): [BadgeKind, string][] {
  return [
    ...(showsPriority(c.priority) ? ([[PRIORITY_BADGE[c.priority], COMPACT_PRIORITY[c.priority]]] as [BadgeKind, string][]) : []),
    ...(c.highReview ? ([["trend", TREND_REVIEW_LABEL]] as [BadgeKind, string][]) : []),
    ...(c.dataCheck && c.priority !== "DATA_CHECK" ? ([["check", "DATA CHECK"]] as [BadgeKind, string][]) : []),
  ];
}
function chartPanel(L: P, c: PremiumChart, x: number, y: number, w: number, measureOnly: boolean): number {
  const caption = L.capped(chartCaption(c), 7.6, w - 6, 7);
  const plotH = 46;
  const legendRows = c.bands.length && !c.dataCheck ? c.bands.length : 0;
  const title = L.capped(c.base.name, 9.6, w - 22, 2, true);
  const titleH = title.length * lh(9.6) + 1.2; // descenders included: badges start below the title block
  const bs = chartBadges(c);
  const badgeRows = bs.length ? flowBadges(L, bs, 0, 0, w - 6, true) : 0;
  const top = 1.6 + titleH + badgeRows * 4.6 + (c.patternDataCheck ? 3.4 : 0);
  const h = top + 3 + plotH + 9 + legendRows * 3.6 + caption.length * lh(7.6) + 3;
  if (measureOnly) return h;
  L.box(x, y, w, h, COLOR.white, COLOR.rule);
  L.lines(title, x + 3, y + 1.6, 9.6, true, COLOR.navy);
  L.font(7.6, false, COLOR.muted);
  L.pdf.text(L.t(c.base.unit), x + w - 3, y + 5, { align: "right" });
  if (bs.length) flowBadges(L, bs, x + 3, y + 1.6 + titleH, w - 6, false);
  if (c.patternDataCheck) L.lines([L.t("+ pattern data check † — verify this series before interpretation")], x + 3, y + 1.6 + titleH + badgeRows * 4.6 - 0.2, 6.2, false, COLOR.violet, 1.2);
  const px0 = x + 13, px1 = x + w - 4, py0 = y + top + 3, py1 = y + top + plotH;
  const pts = c.base.points;
  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || Math.abs(hi) * 0.2 || 1;
  for (const b of c.bands) for (const v of [b.lower, b.upper]) if (v !== null && v >= lo - span * 1.2 && v <= hi + span * 1.2) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo || 1) * 0.15;
  const limits = c.bands.flatMap((b) => [b.lower, b.upper]).filter((v): v is number => v !== null && v >= lo && v <= hi);
  const ticks = niceTicks(chartAxisFloor(vals, limits, lo - pad), hi + pad);
  const ymin = ticks[0]!, ymax = ticks.at(-1)!;
  const Y = (v: number) => py1 - ((v - ymin) / (ymax - ymin || 1)) * (py1 - py0);
  // bands
  if (!c.dataCheck)
    for (const b of c.bands) {
      const top = Y(Math.min(ymax, b.upper ?? ymax)), bot = Y(Math.max(ymin, b.lower ?? ymin));
      if (bot - top <= 0.2) continue;
      L.fill(SOFT[b.severity] ?? COLOR.neutralSoft);
      L.pdf.rect(px0, top, px1 - px0, bot - top, "F");
    }
  // grid + ticks
  L.draw(COLOR.rule);
  L.pdf.setLineWidth(0.2);
  for (const t of ticks) {
    L.pdf.line(px0, Y(t), px1, Y(t));
    L.font(6.8, false, COLOR.muted);
    L.pdf.text(L.t(fmt(t)), px0 - 1.5, Y(t) + 0.9, { align: "right" });
  }
  // orientation lines for data-check series
  if (c.dataCheck) {
    const seen = new Set<number>();
    for (const b of c.bands) for (const v of [b.lower, b.upper]) if (v !== null && v > ymin && v < ymax && !seen.has(v)) {
      seen.add(v);
      L.draw(COLOR.neutral);
      L.dash(true, [1, 0.8]);
      L.pdf.line(px0, Y(v), px1, Y(v));
      L.dash(false);
      L.font(6, false, COLOR.muted);
      L.pdf.text(L.t(`${fmt(v)} (orientation only)`), px0 + 1, Y(v) - 0.7);
    }
  }
  // x positions by day
  const days = pts.map((p) => Date.parse(`${p.day}T00:00:00Z`));
  const d0 = Math.min(...days), d1 = Math.max(...days);
  const X = (d: number) => (d1 === d0 ? (px0 + px1) / 2 : px0 + 8 + ((d - d0) / (d1 - d0)) * (px1 - px0 - 16));
  L.draw([148, 163, 184]);
  L.pdf.setLineWidth(0.3);
  L.pdf.line(px0, py1, px1, py1);
  // Date labels never overlap: a label that would touch its drawn neighbour is omitted (the first date is
  // always kept; the last replaces a clashing neighbour). Every point keeps its marker and value label.
  const xLabels: { x: number; text: string; w: number }[] = [];
  for (let i = 0; i < pts.length; i++) {
    const text = dayLabel(pts[i]!.day);
    if (xLabels.some((l) => l.text === text && l.x === X(days[i]!))) continue;
    xLabels.push({ x: X(days[i]!), text, w: L.width(text, 7) });
  }
  const gap = 1.2;
  const clash = (a: { x: number; w: number }, b: { x: number; w: number }) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap;
  const keep: typeof xLabels = [];
  xLabels.forEach((l, i) => {
    if (i === xLabels.length - 1 && keep.length > 1 && clash(keep.at(-1)!, l)) keep.pop();
    if (!keep.length || !clash(keep.at(-1)!, l)) keep.push(l);
  });
  for (const l of keep) {
    L.font(7, false, COLOR.ink);
    L.pdf.text(L.t(l.text), l.x, py1 + 3.6, { align: "center" });
  }
  // series
  if (pts.length > 1) {
    L.draw(COLOR.navy);
    L.pdf.setLineWidth(0.5);
    L.dash(c.dataCheck, [1.6, 1.2]);
    for (let i = 1; i < pts.length; i++) L.pdf.line(X(days[i - 1]!), Y(pts[i - 1]!.value), X(days[i]!), Y(pts[i]!.value));
    L.dash(false);
  }
  pts.forEach((p, i) => {
    const pc = c.pointClasses[i] ?? { cls: "NEUTRAL" as const, basis: "none" as ClassBasis };
    const col: RGB = pc.cls === "CHECK" ? COLOR.violet : pc.cls === "RED" ? COLOR.red : pc.cls === "AMBER" ? COLOR.amber : pc.cls === "NORMAL" ? COLOR.green : COLOR.neutral;
    const cx = X(days[i]!), cy = Y(p.value);
    if (L.pdf.circle) {
      if (pc.cls === "CHECK") { L.fill(COLOR.white); L.draw(col); L.pdf.setLineWidth(0.6); L.pdf.circle(cx, cy, 1.4, "FD"); }
      else { L.fill(col); L.draw(COLOR.white); L.pdf.setLineWidth(0.4); L.pdf.circle(cx, cy, 1.4, "FD"); }
    } else { L.fill(col); L.pdf.rect(cx - 1.2, cy - 1.2, 2.4, 2.4, "F"); }
    const lab = `${p.valueText}${p.annotation ? ` ${p.annotation}` : ""}`;
    L.font(7.6, true, col);
    const above = cy - 2.6 > py0 + 1;
    L.pdf.text(L.t(lab), cx, above ? cy - 2.4 : cy + 4.4, { align: "center" });
  });
  let cy = py1 + 6.2;
  if (legendRows) {
    c.bands.forEach((b, i) => {
      const lx = x + 3, ly = cy + i * 3.6;
      L.fill(SOFT[b.severity] ?? COLOR.neutralSoft);
      L.draw([203, 213, 225]);
      L.pdf.setLineWidth(0.15);
      L.pdf.rect(lx, ly, 2.6, 2.2, "FD");
      L.lines(L.capped(b.label, 6.1, w - 10, 1), lx + 3.4, ly - 0.75, 6.1, false, COLOR.ink, 1.2);
    });
    cy += legendRows * 3.6;
  }
  L.lines(caption, x + 3, cy, 7.6, false, [51, 65, 85]);
  return h;
}
const dayLabel = (d: string) => {
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(d.slice(5, 7)) - 1];
  return `${d.slice(8, 10)} ${m}`;
};
function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw)!;
  const out: number[] = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step * 0.999; t += step) out.push(Number(t.toFixed(6)));
  return out;
}
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? String(Number(v.toFixed(1))) : String(Number(v.toFixed(2))));

function singlePanel(L: P, title: string, cs: PremiumChart[], x: number, y: number, w: number, measureOnly: boolean): number {
  const rowH = 10.5;
  const h = 9 + cs.length * rowH + 2;
  if (measureOnly) return h;
  L.box(x, y, w, h, COLOR.white, COLOR.rule);
  L.lines(L.capped(title, 9.6, w - 6, 1, true), x + 3, y + 1.6, 9.6, true, COLOR.navy);
  cs.forEach((c, i) => {
    const p = c.base.points[0]!;
    const pc = c.pointClasses[0] ?? { cls: "NEUTRAL" as const, basis: "none" as ClassBasis };
    const col: RGB = pc.cls === "RED" ? COLOR.red : pc.cls === "AMBER" ? COLOR.amber : pc.cls === "NORMAL" ? COLOR.green : pc.cls === "CHECK" ? COLOR.violet : COLOR.neutral;
    const ry = y + 9 + i * rowH;
    L.lines(L.capped(c.base.name, 7.8, 38, 1, true), x + 3, ry, 7.8, true, COLOR.ink);
    L.lines([L.t(`${p.day}${showsPriority(c.priority) ? ` · ${COMPACT_PRIORITY[c.priority].toLowerCase()}` : ""}${c.highReview ? " · trend review" : ""}`)], x + 3, ry + 3.6, 6.4, false, COLOR.muted);
    const tx = x + 44, tw = w - 44 - 28;
    const bandMax = Math.max(...c.bands.flatMap((b) => [b.lower ?? 0, b.upper ?? 0]).filter((v) => v < p.value * 4), 0);
    const scale = Math.max(p.value, bandMax) * 1.15 || 1;
    L.box(tx, ry + 1.4, tw, 3, COLOR.neutralSoft, undefined, 0.8);
    L.box(tx, ry + 1.4, Math.max(0.8, Math.min(tw, (tw * p.value) / scale)), 3, col, undefined, 0.8);
    const ref = c.bands.find((b) => b.lower !== null && b.lower <= scale && b.lower > 0) ?? null;
    if (ref && ref.lower !== null) {
      const rx = tx + (tw * ref.lower) / scale;
      L.draw(COLOR.navy);
      L.pdf.setLineWidth(0.3);
      L.dash(true, [0.6, 0.5]);
      L.pdf.line(rx, ry + 0.6, rx, ry + 5.2);
      L.dash(false);
    }
    L.font(8.4, true, col);
    L.pdf.text(L.t(`${p.valueText} ${c.base.unit}`), x + w - 3, ry + 3.8, { align: "right" });
  });
  return h;
}

function longitudinal(L: P, r: PremiumReport) {
  L.y += 2;
  // Keep the heading, its intro and the first chart row together (no orphan heading).
  const firstRow = r.charts.filter((c) => c.base.kind === "line").slice(0, 2);
  const firstH = firstRow.length ? Math.max(...firstRow.map((c) => chartPanel(L, c, 0, 0, COL2, true))) : 0;
  L.ensure(12 + 14 + firstH);
  L.h2("Longitudinal biomarker intelligence", 80);
  L.para("Every chart shows only observed values, on their actual dates and in their original units. Coloured bands appear only where an approved (or, in demonstration mode, a provisional literature) criterion applies. Hollow violet markers and dashed lines: measurement must be verified first. Grey: unclassified.", 8, [51, 65, 85]);
  const line = r.charts.filter((c) => c.base.kind === "line");
  for (let i = 0; i < line.length; i += 2) {
    const pair = line.slice(i, i + 2);
    const h = Math.max(...pair.map((c) => chartPanel(L, c, 0, 0, COL2, true)));
    L.ensure(h);
    pair.forEach((c, j) => chartPanel(L, c, MX + j * (COL2 + GUT), L.y, COL2, false));
    L.y += h + GUT;
  }
  const inPattern = new Set((r.patterns?.patterns ?? []).flatMap((p) => p.recordIds));
  const notableSingle = (c: PremiumChart) => !r.patterns?.patterns.length || c.highReview || c.dataCheck || c.pointClasses.some((p) => p.cls !== "NEUTRAL") || r.rows.some((x) => x.metricId === c.base.metricId && x.unit === c.base.unit && inPattern.has(x.recordId));
  const single = r.charts.filter((c) => c.base.kind === "single" && notableSingle(c));
  const hiddenSingles = r.charts.filter((c) => c.base.kind === "single").length - single.length;
  const groups = new Map<string, PremiumChart[]>();
  for (const c of single) {
    const g = r.rows.find((x) => x.metricId === c.base.metricId && x.unit === c.base.unit)?.group ?? "other";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const panels: [string, PremiumChart[]][] = [];
  for (const [g, cs] of groups) for (let i = 0; i < cs.length; i += 6) panels.push([`${GROUPS.find((x) => x.id === g)?.label ?? "Other"} — single observations`, cs.slice(i, i + 6)]);
  for (let i = 0; i < panels.length; i += 2) {
    const pair = panels.slice(i, i + 2);
    const h = Math.max(...pair.map(([t, cs]) => singlePanel(L, t, cs, 0, 0, COL2, true)));
    L.ensure(h);
    pair.forEach(([t, cs], j) => singlePanel(L, t, cs, MX + j * (COL2 + GUT), L.y, COL2, false));
    L.y += h + GUT;
  }
  const tableOnly = r.base.charts.omitted.length + hiddenSingles;
  if (tableOnly) L.para(`${tableOnly} further unflagged, unclassified result(s) are shown in the results table only.`, 7.6, COLOR.muted);
}

// ------------------------------------------------------------------ preliminary medical assessment

function assessment(L: P, r: PremiumReport) {
  L.sectionBreak(0.45);
  L.h2("Preliminary Medical Assessment — For Ground Medical Review", 40);
  L.para("Automated preliminary assessment generated from the recorded measurements. It lists possible conditions for a qualified clinician to evaluate; it is not a physician-certified diagnosis and assigns no probabilities. Symptoms, examination findings, medications, age and sex were not available unless shown.", 7.9, [51, 65, 85]);
  const P = r.patterns?.patterns ?? [];
  P.forEach((p, idx) => patternAssessment(L, r, p, idx));
  const rest = r.concerns.filter((c) => !(r.coveredConcerns ?? []).includes(c.concernId));
  if (!P.length && !rest.length) { L.para("No preliminary clinical concern was identified in this period.", 9); return; }
  rest.forEach((c, i) => {
    const idx = P.length + i;
    const decision = r.priorities?.[c.concernId];
    const TINT: Record<string, RGB> = { red: COLOR.redSoft, amber: COLOR.amberSoft, purple: COLOR.violetSoft, green: COLOR.greenSoft, neutral: COLOR.panel };
    const pill = decision
      ? { t: decision.label, k: PRIORITY_BADGE[decision.priority], tint: TINT[decision.tone]! }
      : c.priority === "high" || c.priority === "prompt" ? { t: "HIGH-PRIORITY REVIEW", k: "flag" as BadgeKind, tint: COLOR.redSoft } : c.priority === "measurement_check" ? { t: "VERIFY FIRST", k: "check" as BadgeKind, tint: COLOR.violetSoft } : { t: "ROUTINE", k: "neutral" as BadgeKind, tint: COLOR.panel };
    const status = r.base.review.statuses[c.concernId]?.label ?? "Pending Ground Medical review";
    const rows: [string, string][] = [
      ...(decision ? ([
        ["Warning priority", `${decision.label}${decision.rules.length ? ` (rule ${decision.rules.join(", ")})` : ""}. ${decision.rationale}${decision.dataCheck && decision.priority !== "DATA_CHECK" ? " A DATA CHECK also applies; it does not lower this priority." : ""}`],
        ["Clinical class", (r.concernClasses?.[c.concernId] ?? []).map((x) => `• ${x}`).join("\n")],
      ] as [string, string][]) : []),
      ["Clinical concern", c.narrative.whyItMatters],
      ["Observation", c.narrative.whatHappened],
      ["Supporting", c.supporting.map((s) => `• ${s}`).join("\n")],
      ["Contradicting", c.contradicting.map((s) => `• ${s}`).join("\n")],
      ["Alternatives", c.alternatives.map((s) => `• ${s}`).join("\n")],
      ["Missing", c.missing.map((s) => `• ${s}`).join("\n")],
      ["Confirm", c.confirmation.map((s) => `• ${s}`).join("\n")],
      ["Ground Medical", `${status}${status.startsWith("Pending") ? " (session review — not persisted)" : ""}`],
    ];
    const labelW = 27, bodyW = CW - labelW - 6;
    const bodies = rows.map(([, t]) => t.split("\n").flatMap((p) => L.wrap(p, 8.2, bodyW)));
    const header = (cont: boolean) => {
      const title = L.capped(`${idx + 1} · ${c.title}${cont ? " (continued)" : ""}`, 10.4, CW - 60, 2, true);
      const hh = title.length * lh(10.4) + 3.2;
      L.box(MX, L.y, CW, hh, pill.tint, undefined, 2);
      L.lines(title, MX + 3, L.y + 1.4, 10.4, true, COLOR.navy);
      const pw = L.width(pill.t, 6.6, true) + 6;
      badge(L, pill.k, pill.t, MX + CW - pw - 2, L.y + 1.6);
      L.y += hh + 0.8;
    };
    L.ensure(14 + bodies[0]!.length * lh(8.2) + bodies[1]!.length * lh(8.2));
    header(false);
    rows.forEach(([label, ], i) => {
      const body = bodies[i]!;
      const h = Math.max(body.length * lh(8.2), lh(7.4) * 2) + 1.6;
      if (L.y + h > BOTTOM) { L.newPage(); header(true); }
      L.lines(L.wrap(label.toUpperCase(), 6.9, labelW - 2, true), MX + 2, L.y + 0.4, 6.9, true, COLOR.teal);
      L.lines(body, MX + labelW + 2, L.y + 0.2, 8.2);
      L.y += h;
      L.draw([241, 245, 249]);
      L.pdf.setLineWidth(0.2);
      L.pdf.line(MX, L.y - 0.5, MX + CW, L.y - 0.5);
    });
    L.y += 4;
  });
}

// ------------------------------------------------------------------ recommendations

function recommendations(L: P, r: PremiumReport) {
  L.sectionBreak(0.4);
  L.h2("Personalised recommendations", 40);
  L.para("Each recommendation is linked to the finding that generated it. GM marks actions that require a Ground Medical decision. No medication or supplement doses are given.", 7.9, [51, 65, 85]);
  const cols = r.recommendations.filter((c) => c.items.length);
  const card = (col: (typeof cols)[number], x: number, y: number, w: number, measureOnly: boolean) => {
    let h = 8;
    const items = col.items.map((it) => ({ gm: it.authorization === "clinician_required", text: L.wrap(it.text, 8.1, w - (it.authorization === "clinician_required" ? 14 : 8)), basis: L.capped(`→ ${it.basis.join("; ")}`, 7, w - 8, 2) }));
    for (const it of items) h += it.text.length * lh(8.1) + it.basis.length * lh(7) + 1.8;
    if (measureOnly) return h;
    L.box(x, y, w, h, COLOR.white, COLOR.rule);
    L.lines([L.t(col.column)], x + 3, y + 1.8, 9.8, true, COLOR.teal);
    let cy = y + 7.4;
    for (const it of items) {
      let tx = x + 4;
      L.fill(COLOR.teal);
      L.pdf.rect(x + 2.2, cy + 1.6, 0.9, 0.9, "F");
      if (it.gm) tx += badge(L, "gm", "GM", tx, cy + 0.3) + 1.2;
      cy += L.lines(it.text, tx, cy, 8.1);
      cy += L.lines(it.basis, x + 4, cy, 7, false, COLOR.muted) + 1.8;
    }
    return h;
  };
  for (let i = 0; i < cols.length; i += 2) {
    const pair = cols.slice(i, i + 2);
    const h = Math.max(...pair.map((c) => card(c, 0, 0, COL2, true)));
    if (h <= L.room() || (h <= BOTTOM - TOP && L.room() < (BOTTOM - TOP) * 0.4)) {
      L.ensure(h);
      pair.forEach((c, j) => card(c, MX + j * (COL2 + GUT), L.y, COL2, false));
      L.y += h + GUT;
    } else {
      // P60: flow the pair as lists (no half-empty page before a tall card pair).
      for (const c of pair) {
        L.h3(`${c.column}`, 14);
        for (const it of c.items) {
          L.para(`${it.authorization === "clinician_required" ? "GM · " : "• "}${it.text}`, 8.1, COLOR.ink, MX + 3, CW - 3);
          L.y -= 1.2;
          L.para(`→ ${it.basis.join("; ")}`, 7, COLOR.muted, MX + 6, CW - 6);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ results table

function results(L: P, r: PremiumReport) {
  L.y += 3;
  L.h2("Complete results — all observations", 30);
  const c = r.counts;
  L.para(`${c.observations} observations in ${c.series} biomarker series from ${c.examinationDates} examination date(s), exactly as recorded (no unit conversion). Classes use approved criteria${r.options.provisionalActive ? " or, where marked PROVISIONAL, literature criteria for this synthetic demonstration" : ""}. Priority is the medical-review priority of the finding the result belongs to (the same label as on page 1, in the charts and in the assessment); Trend / data shows a significant change between examinations (TREND REVIEW) and observation-level data-quality checks (CHECK) separately.`, 7.8, [51, 65, 85]);
  const cols = [
    { k: "Measurement", w: 0.245 }, { k: "Value", w: 0.12 }, { k: "Date", w: 0.06 }, { k: "Class", w: 0.125 }, { k: "Priority", w: 0.12 }, { k: "Trend / data", w: 0.125 }, { k: "Criterion", w: 0.205 },
  ].map((x) => ({ ...x, w: x.w * CW }));
  const TB = 5.9; // table badge size (pt)
  const xs = cols.map((_, i) => MX + cols.slice(0, i).reduce((s, x) => s + x.w, 0));
  const head = () => {
    L.fill(COLOR.navy);
    L.pdf.rect(MX, L.y, CW, 5.2, "F");
    cols.forEach((col, i) => L.lines([L.t(col.k)], xs[i]! + 1.4, L.y + 0.9, 7.1, true, COLOR.white, 1.2));
    L.y += 5.6;
  };
  const crit = (x: ResultRow) => (x.criterionShort === undefined ? `${x.criterionText}${x.limitation ? ` ${x.limitation}` : ""}` : `${x.criterionShort || "—"}${x.notes?.length ? ` ${x.notes.join(" ")}` : ""}`);
  const trendData = (x: ResultRow): [BadgeKind, string][] => [
    ...(x.axes.review.value === "HIGH" ? ([["trend", TREND_REVIEW_LABEL]] as [BadgeKind, string][]) : []),
    ...(x.axes.dataQuality.value === "DATA_QUALITY_WARNING" ? ([["check", "CHECK"]] as [BadgeKind, string][]) : []),
  ];
  const priH = (x: ResultRow) => (showsPriority(x.priority) ? 4.4 : 0) + (x.patternDataCheck ? 2.9 : 0);
  const rowH = (x: ResultRow) => {
    const a = L.wrap(x.name, 7.7, cols[0]!.w - 2.5).length, b = L.wrap(crit(x), 6.9, cols[6]!.w - 2.5).length;
    const v = L.capped(`${x.valueText} ${x.unit}`, 7.7, cols[1]!.w - 2.5, 2, true).length;
    return Math.max(a * lh(7.7), v * lh(7.7), b * lh(6.9), 4.3, trendData(x).length * 4.4, priH(x)) + 1.5;
  };
  L.ensure(20);
  head();
  for (const g of GROUPS) {
    const rs = r.rows.filter((x) => x.group === g.id);
    if (!rs.length) continue;
    if (L.y + 5 + rowH(rs[0]!) > BOTTOM) { L.newPage(); head(); }
    L.fill(COLOR.tealSoft);
    L.pdf.rect(MX, L.y, CW, 4.6, "F");
    L.lines([L.t(g.label.toUpperCase())], MX + 1.4, L.y + 0.6, 7.3, true, COLOR.navy, 1.2);
    L.y += 5;
    for (const x of rs) {
      const h = rowH(x);
      if (L.y + h > BOTTOM) { L.newPage(); head(); }
      const col: RGB = x.displayClass === "RED" ? COLOR.red : x.displayClass === "AMBER" ? COLOR.amber : x.displayClass === "NORMAL" ? COLOR.green : COLOR.ink;
      L.lines(L.wrap(x.name, 7.7, cols[0]!.w - 2.5), xs[0]! + 1.2, L.y + 0.5, 7.7);
      L.lines(L.capped(`${x.valueText} ${x.unit}`, 7.7, cols[1]!.w - 2.5, 2, true), xs[1]! + 1.2, L.y + 0.5, 7.7, true, col);
      L.lines([L.t(x.date.slice(5).replace("-", "/"))], xs[2]! + 1.2, L.y + 0.5, 7.4);
      badge(L, badgeOf(x.displayClass), x.basis === "provisional" ? `${badgeLabel(x.displayClass, "approved")} PROV.` : badgeLabel(x.displayClass, x.basis), xs[3]! + 1.2, L.y + 0.8);
      // Priority: the finding's medical-review priority (never derived from the size of a change).
      if (showsPriority(x.priority)) badge(L, PRIORITY_BADGE[x.priority], COMPACT_PRIORITY[x.priority], xs[4]! + 1.2, L.y + 0.8, TB, false);
      else L.lines(["—"], xs[4]! + 1.2, L.y + 0.5, 7.4, false, COLOR.muted);
      if (x.patternDataCheck) L.lines([L.t("+ pattern check †")], xs[4]! + 1.2, L.y + 0.6 + (showsPriority(x.priority) ? 4.4 : 0), 5.8, false, COLOR.violet, 1.2);
      // Trend / data: significant change and observation-level data-quality checks, stacked (never side by side).
      const td = trendData(x);
      td.forEach(([k, label], i) => badge(L, k, label, xs[5]! + 1.2, L.y + 0.8 + i * 4.4, TB));
      if (!td.length) L.lines(["—"], xs[5]! + 1.2, L.y + 0.5, 7.4, false, COLOR.muted);
      L.lines(L.wrap(crit(x), 6.9, cols[6]!.w - 2.5), xs[6]! + 1.2, L.y + 0.6, 6.9, false, [51, 65, 85]);
      L.y += h;
      L.draw(COLOR.rule);
      L.pdf.setLineWidth(0.15);
      L.pdf.line(MX, L.y - 0.4, MX + CW, L.y - 0.4);
    }
  }
  if (r.tableNotes?.length) {
    L.y += 1.5;
    for (const n of r.tableNotes) L.para(n, 6.9, COLOR.muted);
  }
}

function methodology(L: P, r: PremiumReport) {
  const c = r.counts;
  const cov = r.coverage;
  const items = [
    ...(r.census ? [`Data source and census. ${cov ? `Read from this device's encrypted local store: ${cov.readRecords} record(s) read${cov.storedRecords !== null ? ` of ${cov.storedRecords} stored` : ""}${cov.complete === true ? " (complete)" : cov.complete === false ? " — INCOMPLETE READ; regenerate before use" : ""}. ` : ""}Census ${r.census.version}: ${r.census.observations} observations, ${r.census.series} series, dates ${r.census.dates.join(", ")}; SHA-256 ${r.census.sha256}. Records held only on another device or only in the cloud are not included unless imported through the explicit cross-device sync. Generator ${r.generator ?? r.version} · Evidence ID ${r.header.evidenceId}.`] : []),
    `Data. ${c.observations} observations · ${c.series} biomarker series (exact catalog identity + unit) · ${c.examinationDates} examination date(s) · ${c.comparedSeries} series compared between examinations${c.excluded.length ? ` · excluded: ${c.excluded.map((e) => `${e.n} ${e.reason}`).join("; ")}` : ""}. Values exactly as recorded; no unit conversion or interpolation. ${r.header.provenanceLabel}.`,
    "Calculations. Changes only between consecutive observations of the same identity and unit; the full trajectory, including intermediate peaks and troughs, is reported.",
    `Criteria. ${c.approvedCriteria} Researcher-approved criteria available. ${r.options.provisionalActive ? `${r.demonstrationLabel}: provisional literature interpretation ON (synthetic demonstration only; marked PROVISIONAL; never approved classifications or validated alerts). ` : "Provisional literature interpretation OFF. "}General-population criteria are not NASA flight limits.`,
    ...(r.options.demonstrationMappingsActive ? [(() => {
      const used = [...new Map(r.rows.filter((x) => x.identityRoute?.kind === "demonstration_mapping").map((x) => [x.metricId, `${x.name} (${x.metricId} → ${x.identityRoute!.target}, ${x.unit})`])).values()];
      return `Synthetic identity mappings. ${demonstrationMappings().length} owner-directed mappings re-verified against the repository (same concept, identical unit, same domain, unique target, named mission); not Researcher-approved and never used for approved classification, real data or unit conversion. Used in this report: ${used.length ? used.join("; ") : "none"}.`;
    })()] : []),
    ...(Object.keys(r.priorities ?? {}).length && r.patterns?.patterns.length && r.concerns.every((c) => (r.coveredConcerns ?? []).includes(c.concernId)) ? ["Warning priority (panel colour) is a separate axis from clinical class. Every P58 concern in this report is represented by a P60 pattern, so the P59 rules WP-1 to WP-5 are not shown here; they remain in force for concerns that no pattern covers."] : []),
    ...(Object.keys(r.priorities ?? {}).length && !(r.patterns?.patterns.length && r.concerns.every((c) => (r.coveredConcerns ?? []).includes(c.concernId))) ? [`Warning priority (panel colour; separate from clinical class; owner-directed, pending Researcher review). ${WARNING_PRIORITY_RULES.map((x) => `${x.id} ${WARNING_PRIORITY_LABEL[x.priority]}: ${x.text}`).join(" ")} NEUTRAL: ${WARNING_PRIORITY_MEANING.INSUFFICIENT_EVIDENCE}`] : []),
    ...(r.patterns ? [`${r.patterns.basis}${r.patterns.active ? " Priority rules: PP-1 any vital sign in a NEWS2 3-point band; PP-2 two independent findings converging on the same or adjacent dates; PP-3 sodium change above 10 mmol/L within one day with abnormal values at both ends (plus DATA CHECK); PP-4 single threshold or review change (monitoring); PP-5 all contributing results held (data check)." : ""}`] : []),
    `Automated assessment. ${r.base.clinical.aiStatus} Review priority and data quality are separate from clinical classification. Not a diagnosis; no medication or dose advice.`,
    ...(r.census ? [] : [`Generator ${r.version} · Evidence ID ${r.header.evidenceId}.`]),
  ];
  const used = [...new Set((r.patterns?.patterns ?? []).flatMap((p) => p.sources))];
  const refs = used.map((id) => `${shortSource(id)} — ${sourceCitation(id) ?? id}`);
  // Keep the methodology together when it fits on one page (no near-empty trailing page).
  const size = 7.4, refSize = 6.8;
  const total = 12 + items.reduce((s, it) => s + L.wrap(`• ${it}`, size, CW).length * lh(size) + 1.6, 0) + (refs.length ? 9 + refs.reduce((s, x) => s + L.wrap(x, refSize, CW).length * lh(refSize) + 1.6, 0) : 0);
  if (total > L.room() - 3 && total <= BOTTOM - TOP) L.newPage();
  else L.y += 3;
  L.h2("Methodology note", 30);
  for (const it of items) L.para(`• ${it}`, size, [51, 65, 85]);
  if (refs.length) {
    L.h3("References for the cross-domain patterns", 10);
    for (const x of refs) L.para(x, refSize, [71, 85, 105]);
  }
}

// ------------------------------------------------------------------ header / footer pass and entry points

function frame(L: P, r: PremiumReport) {
  const pages = L.pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    L.pdf.setPage(p);
    if (p > 1) {
      L.font(6.8, false, COLOR.muted);
      L.pdf.text(L.t(r.demonstrationLabel ? "MITOCHONDRIA" : "MITOCHONDRIA · Astronaut Health Intelligence"), MX, 9.5);
      let sideW = CW * 0.45;
      if (r.demonstrationLabel) {
        L.font(6.6, true, COLOR.amberDeep);
        L.pdf.text(L.t(r.demonstrationLabel), W / 2, 9.5, { align: "center" });
        sideW = (CW - L.pdf.getTextWidth(L.t(r.demonstrationLabel))) / 2 - 3;
        L.font(6.8, false, COLOR.muted);
      }
      // Long astronaut/mission names are shortened so they never overlap the centred label.
      L.pdf.text(L.capped(`${r.header.astronaut} · ${r.header.mission}`, 6.8, sideW, 1)[0] ?? "", W - MX, 9.5, { align: "right" });
      L.draw(COLOR.rule);
      L.pdf.setLineWidth(0.2);
      L.pdf.line(MX, 11.3, W - MX, 11.3);
    }
    L.draw(COLOR.rule);
    L.pdf.setLineWidth(0.25);
    L.pdf.line(MX, H - 11.5, W - MX, H - 11.5);
    const synth = r.header.provenance === "synthetic" ? " · SYNTHETIC DEMONSTRATION DATA" : "";
    // P60.1: the complete footer is printed (wrapping to a second line when needed) instead of being cut short.
    const foot = L.wrap(`MITOCHONDRIA · Health Intelligence Report · ${r.header.astronaut}${synth} · Preliminary automated assessment — not a diagnosis`, 6.4, CW - 24);
    L.font(6.4, false, COLOR.muted);
    if (foot.length <= 1) L.pdf.text(foot[0] ?? "", MX, H - 8);
    else foot.slice(0, 2).forEach((line, i) => L.pdf.text(line, MX, H - 8.6 + i * 2.5));
    L.font(7, true, COLOR.navy);
    L.pdf.text(L.t(`Page ${p} of ${pages}`), W - MX, H - 8, { align: "right" });
  }
}

export function renderPremiumReport(r: PremiumReport, pdf: PremiumWriter, opts: { family: string; unicode: boolean }): { pages: number } {
  const L = new P(pdf, opts.family, opts.unicode);
  pageOne(L, r);
  overview(L, r);
  integrated(L, r);
  longitudinal(L, r);
  assessment(L, r);
  recommendations(L, r);
  results(L, r);
  methodology(L, r);
  frame(L, r);
  return { pages: pdf.getNumberOfPages() };
}

export async function createPremiumReportPdf(r: PremiumReport, deps?: PdfDeps, meta?: { fixedDate?: string }): Promise<TextPdfResult> {
  const { pdf, fonts } = await openTextPdf(deps);
  return renderPremium(pdf as unknown as PremiumWriter, fonts, r, meta);
}

export function renderPremium(pdf: PremiumWriter, fonts: ReportFonts | null, r: PremiumReport, meta?: { fixedDate?: string }): TextPdfResult {
  let family = "helvetica";
  if (fonts && pdf.addFileToVFS && pdf.addFont) {
    pdf.addFileToVFS("LiberationSans-Regular.ttf", fonts.regular);
    pdf.addFont("LiberationSans-Regular.ttf", "LiberationSans", "normal");
    pdf.addFileToVFS("LiberationSans-Bold.ttf", fonts.bold);
    pdf.addFont("LiberationSans-Bold.ttf", "LiberationSans", "bold");
    family = "LiberationSans";
  }
  pdf.setProperties({
    title: redactProhibitedNames(`Health Intelligence Report — ${r.header.astronaut}`),
    subject: `Evidence ID ${r.header.evidenceId}; preliminary assessment pending Ground Medical review`,
    creator: "MITOCHONDRIA - local export",
    keywords: `research use, preliminary, not a diagnosis${r.options.provisionalActive ? ", provisional literature interpretation (synthetic demonstration)" : ""}`,
  });
  if (meta?.fixedDate) {
    pdf.setCreationDate?.(new Date(meta.fixedDate));
    pdf.setFileId?.(`${r.header.evidenceId.replace(/[^0-9A-F]/g, "")}${"0".repeat(32)}`.slice(0, 32));
  }
  const { pages } = renderPremiumReport(r, pdf, { family, unicode: Boolean(fonts) });
  if (!pdf.output) throw new Error("PDF writer cannot produce output.");
  const blob = pdf.output("blob");
  if (!(blob.size > 0)) throw new Error("The PDF file is empty.");
  return { blob, pages, fontMode: fonts ? "unicode" : "standard" };
}
