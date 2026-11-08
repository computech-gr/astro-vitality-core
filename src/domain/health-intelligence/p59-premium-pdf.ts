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
  page = 1;
  pageHasBody = false;
  constructor(readonly pdf: PremiumWriter, readonly family: string, readonly unicode: boolean) {}
  t(s: string): string {
    const r = redactProhibitedNames(s);
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
    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
    let acc = "";
    for (const s of sentences) {
      const next = acc + s;
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
  para(text: string, size = 9.2, color: RGB = COLOR.ink, x = MX, w = CW) {
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

type BadgeKind = "red" | "amber" | "green" | "neutral" | "check" | "flag" | "gm" | "pri-red" | "pri-amber" | "pri-purple" | "pri-green" | "pri-neutral";
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
/** Draws a badge at (x, y = top); returns its width. */
function badge(L: P, kind: BadgeKind, label: string, x: number, y: number): number {
  const size = 6.6;
  const flagW = kind === "flag" || kind === "pri-red" || kind === "pri-amber" || kind === "pri-purple" ? 2.6 : 0;
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
  const x = MX, y = TOP1, h = 47;
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
  if (r.header.provenance === "synthetic")
    L.lines(L.capped("SYNTHETIC DEMONSTRATION DATA — not real astronaut data. Age, sex, symptoms, medications and medical history are not recorded and are not assumed.", 7.2, CW - 10, 2, true), x + 5, y + 38.6, 7.2, true, COLOR.synthetic, 1.25);
  L.y = y + h + 4;
}

function alertCard(L: P, a: AlertCard, x: number, y: number, w: number, measureOnly: boolean): number {
  const pr = a.priority ? WARNING_PRIORITY_TONE[a.priority] : null;
  const tone = pr ? (pr === "purple" ? "check" : pr) : a.kind === "clinical-red" ? "red" : a.kind === "data-check" ? "check" : a.kind === "clinical-amber" || a.kind === "provisional" ? "amber" : a.kind === "review-high" ? "red" : "neutral";
  const deep: RGB = tone === "red" ? COLOR.redDeep : tone === "amber" ? COLOR.amberDeep : tone === "check" ? COLOR.violet : tone === "green" ? COLOR.green : COLOR.navy;
  const soft: RGB = tone === "red" ? COLOR.redSoft : tone === "amber" ? COLOR.amberSoft : tone === "check" ? COLOR.violetSoft : tone === "green" ? COLOR.greenSoft : COLOR.panel;
  const inner = w - 7;
  const title = L.capped(a.title, 10, inner, 2, true);
  const ev = L.capped(a.evidence, 8.1, inner, a.priority ? 4 : 5);
  const why = a.priority && a.rationale && a.findingIds.length === 1 ? L.capped(`Why this priority: ${a.rationale}`, 7.3, inner, 4) : [];
  const next = L.capped(`Next: ${a.nextStep}`, 7.9, inner, 4);
  const clinicalRow = Boolean(a.priority) && a.findingIds.length === 1;
  const badgeRows = a.priority ? 5 + (clinicalRow ? 5 : 0) : a.badges.length ? 5 : 0;
  const h = 3 + badgeRows + title.length * lh(10) + 1 + ev.length * lh(8.1) + (why.length ? 1 + why.length * lh(7.3) : 0) + 3 + next.length * lh(7.9) + 2.5;
  if (measureOnly) return h;
  L.box(x, y, w, h, soft, undefined, 2.4);
  L.fill(deep);
  L.pdf.rect(x, y + 0.4, 1.6, h - 0.8, "F");
  let cy = y + 2.6;
  let bx = x + 4.2;
  if (a.priority) {
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
  const text = `${r.demonstrationLabel}. Literature criteria${r.options.demonstrationMappingsActive ? " and synthetic identity mappings" : ""} colour results for demonstration only: not Researcher-approved, never validated alerts, never applied to real data.`;
  const ls = L.wrap(text, 7.6, CW - 8, true);
  const h = ls.length * lh(7.6) + 3.4;
  L.box(MX, L.y, CW, h, [255, 248, 225], COLOR.amber, 1.8, 0.4);
  L.lines(ls, MX + 4, L.y + 1.5, 7.6, true, COLOR.amberDeep);
  L.y += h + 3;
}

function pageOne(L: P, r: PremiumReport) {
  hero(L, r);
  demonstrationBanner(L, r);
  L.h2("Most important findings", 40);
  const cards = r.alerts;
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
  const items: [BadgeKind, string, string][] = usesPriority
    ? [
        ["pri-red", "RED", "High priority medical review; not a diagnosis"],
        ["pri-amber", "AMBER", "Monitoring or further evaluation"],
        ["pri-purple", "DATA CHECK", "Purple — verify the measurement first"],
        ["green", "GREEN", "Within applicable reference criteria"],
        ["neutral", "NEUTRAL", "Insufficient classification evidence"],
        ...(r.options.provisionalActive ? ([["amber", "(PROVISIONAL)", "Literature-based class; not clinically validated"]] as [BadgeKind, string, string][]) : []),
      ]
    : [
        ["red", "RED", "Important medical concern — criterion met"],
        ["amber", "AMBER", "Monitor / further evaluation"],
        ["green", "GREEN", "Supported normal — criterion applicable"],
        ["neutral", "NEUTRAL", "Insufficient evidence to classify"],
        ["check", "DATA CHECK", "Verify the measurement before interpretation"],
        ["flag", "HIGH-PRIORITY REVIEW", "Urgency only — not a classification"],
      ];
  if (legendProblems(REPORT_LEGEND).length) throw new Error("Report legend failed validation; PDF not created.");
  const note = usesPriority ? L.wrap(r.basisText, 6.8, CW - 6) : [];
  const lgH = 2 * 9 + 3 + (note.length ? note.length * lh(6.8) + 1 : 0);
  L.ensure(lgH);
  L.box(MX, L.y, CW, lgH, COLOR.panel, COLOR.rule);
  items.forEach(([k, label, text], i) => {
    const cx = MX + 3 + (i % 3) * (CW / 3), cy = L.y + 2 + Math.floor(i / 3) * 9;
    const bw = badge(L, k, label, cx, cy);
    L.lines(L.capped(text, 7, CW / 3 - bw - 6, 2), cx + bw + 1.5, cy - 0.3, 7, false, COLOR.ink, 1.25);
  });
  if (note.length) L.lines(note, MX + 3, L.y + 2 + 2 * 9 - 0.6, 6.8, false, COLOR.muted, 1.25);
  L.y += lgH + 3;
  if (r.nextSteps.length) {
    L.h3("Priority next steps", 12);
    r.nextSteps.forEach((s, i) => {
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
  L.newPage();
  L.h2("Executive health overview");
  L.para(r.lead, 9);
  for (let i = 0; i < r.overview.length; i += 2) {
    const pair = r.overview.slice(i, i + 2).map((q, j) => ({ q: L.wrap(`${i + j + 1} · ${q.question}`, 8.6, COL2, true), a: L.capped(q.answer, 8.1, COL2, 7) }));
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
  L.h3("Body systems at a glance", 30);
  const tiles = r.systems;
  for (let i = 0; i < tiles.length; i += 3) {
    const row = tiles.slice(i, i + 3);
    const bodies = row.map((t) => L.capped(t.lines.join("; "), 7.8, COL3 - 6, 5));
    const h = Math.max(...row.map((t, j) => bodies[j]!.length * lh(7.8) + flowBadges(L, tileBadges(t), 0, 0, COL3 - 6, true) * 4.6)) + 9;
    L.ensure(h);
    row.forEach((t, j) => systemTile(L, t, bodies[j]!, MX + j * (COL3 + GUT), L.y, COL3, h));
    L.y += h + GUT;
  }
}
function tileBadges(t: SystemTile): [BadgeKind, string][] {
  const out: [BadgeKind, string][] = [];
  if (t.measured && t.worst !== "NEUTRAL") out.push([badgeOf(t.worst), badgeLabel(t.worst, t.basis)]);
  if (t.high) out.push(["flag", "REVIEW"]);
  if (t.dataCheck) out.push(["check", "DATA CHECK"]);
  return out;
}
/** Draws badges left-to-right, wrapping to a new row when the width is exceeded; returns rows used. */
function flowBadges(L: P, bs: [BadgeKind, string][], x: number, y: number, w: number, measureOnly: boolean): number {
  if (!bs.length) return 0;
  let bx = x, row = 0;
  for (const [k, label] of bs) {
    const bw = L.width(label, 6.6, true) + 3 + (k === "flag" ? 2.6 : 0);
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
  const slots: Record<string, [number, number]> = { inflammation: [1, 0], clotting: [0, 1], recovery: [1, 1], lipids: [2, 1], electrolytes: [0, 2], red_cells: [1, 2], glycaemia: [2, 2], bone: [2, 0] };
  const bw = 46, bh = 13, h = 66;
  L.ensure(h + 4);
  const top = L.y;
  L.box(MX, top, CW, h, COLOR.white, COLOR.rule);
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of g.nodes) {
    const [cx, cy] = slots[n.id] ?? [1, 1];
    pos.set(n.id, { x: MX + 6 + cx * ((CW - 12 - bw) / 2), y: top + 4 + cy * 21 });
  }
  const rowsOf = (id: string) => r.rows.filter((x) => n2group(id) === x.group);
  for (const e of g.edges) {
    const a = pos.get(e.from)!, b = pos.get(e.to)!;
    const ax = a.x + bw / 2, ay = a.y + bh / 2, bxm = b.x + bw / 2, bym = b.y + bh / 2;
    const dx = bxm - ax, dy = bym - ay, len = Math.hypot(dx, dy) || 1;
    const sx = ax + (dx / len) * (Math.abs(dy) > Math.abs(dx) * (bh / bw) ? (bh / 2) * (len / Math.abs(dy)) : (bw / 2) * (len / Math.abs(dx)));
    const sy = ay + (dy / len) * (Math.abs(dy) > Math.abs(dx) * (bh / bw) ? (bh / 2) * (len / Math.abs(dy)) : (bw / 2) * (len / Math.abs(dx)));
    const ex = bxm - (sx - ax), ey = bym - (sy - ay);
    const solid = e.cls === "ESTABLISHED_MECHANISM";
    L.draw(solid ? COLOR.teal : COLOR.neutral);
    L.pdf.setLineWidth(solid ? 0.45 : 0.35);
    L.dash(!solid, [1.4, 1]);
    L.pdf.line(sx, sy, ex, ey);
    L.dash(false);
    if (solid && L.pdf.triangle) {
      const ux = (ex - sx) / Math.hypot(ex - sx, ey - sy), uy = (ey - sy) / Math.hypot(ex - sx, ey - sy);
      L.fill(COLOR.teal);
      L.pdf.triangle(ex, ey, ex - ux * 2.4 - uy * 1.1, ey - uy * 2.4 + ux * 1.1, ex - ux * 2.4 + uy * 1.1, ey - uy * 2.4 - ux * 1.1, "F");
    }
    const label = `${e.label}${e.referencePending ? " (reference pending)" : ""}`;
    const ls = L.capped(label, 6.6, 46, 2);
    L.lines(ls, (sx + ex) / 2 - 22, (sy + ey) / 2 - 3.2, 6.6, false, COLOR.muted, 1.2);
  }
  for (const n of g.nodes) {
    const p = pos.get(n.id)!;
    const rs = rowsOf(n.id);
    const worst = rs.reduce<DisplayClass>((m, x) => (rankOf(x.displayClass) > rankOf(m) ? x.displayClass : m), "NEUTRAL");
    const stroke = worst === "RED" ? COLOR.red : worst === "AMBER" ? COLOR.amber : rs.some((x) => x.axes.dataQuality.value === "DATA_QUALITY_WARNING") ? COLOR.violet : COLOR.neutral;
    const fill = worst === "RED" ? COLOR.redSoft : worst === "AMBER" ? COLOR.amberSoft : stroke === COLOR.violet ? COLOR.violetSoft : COLOR.panel;
    L.box(p.x, p.y, bw, bh, fill, stroke, 2, 0.35);
    L.lines([L.t(n.label)], p.x + 2.5, p.y + 1.6, 8.6, true, COLOR.navy, 1.2);
    const summary = summarize(rs);
    L.lines(L.capped(summary, 6.6, bw - 5, 2), p.x + 2.5, p.y + 6, 6.6, false, [71, 85, 105], 1.2);
  }
  L.y = top + h + 4;
}
const rankOf = (c: DisplayClass) => ({ RED: 3, AMBER: 2, NORMAL: 1, NEUTRAL: 0 })[c];
function n2group(nodeId: string) {
  return ({ inflammation: "inflammation", clotting: "blood", lipids: "metabolic", glycaemia: "metabolic", electrolytes: "electrolytes", red_cells: "blood", bone: "bone", recovery: "recovery" } as Record<string, string>)[nodeId] ?? "other";
}
function summarize(rs: ResultRow[]) {
  const by = new Map<string, ResultRow[]>();
  for (const r of rs) by.set(`${r.name}|${r.unit}`, [...(by.get(`${r.name}|${r.unit}`) ?? []), r]);
  return [...by.values()].filter((s) => s.some((r) => r.displayClass !== "NEUTRAL" || r.axes.review.value === "HIGH" || r.axes.dataQuality.value === "DATA_QUALITY_WARNING")).slice(0, 3).map((s) => `${s[0]!.name.replace(/\s*\(.*\)$/, "")} ${s.map((r) => r.valueText).join("→")}`).join(" · ") || "measured; no flag";
}

function integrated(L: P, r: PremiumReport) {
  L.sectionBreak(0.6);
  L.h2("Integrated health assessment", 70);
  L.para("Findings are read as connected patterns. Solid arrows: established biological links (with source). Dashed lines: co-occurrence in this period or a labelled hypothesis — neither shows cause.", 8.6, COLOR.ink);
  diagram(L, r);
  for (const s of r.integrated) {
    L.h3(s.heading);
    for (const p of s.paragraphs) L.para(p, 8.9);
  }
}

// ------------------------------------------------------------------ charts

function chartPanel(L: P, c: PremiumChart, x: number, y: number, w: number, measureOnly: boolean): number {
  const caption = L.capped(`${c.base.name}. ${c.base.caption}${c.base.limitation ? ` ${c.base.limitation}` : ""}${c.bandSource === "provisional" ? " Bands: provisional literature criteria (synthetic demonstration)." : ""}`, 7.6, w - 6, 6);
  const plotH = 46;
  const legendRows = c.bands.length && !c.dataCheck ? c.bands.length : 0;
  const h = 9 + plotH + 9 + legendRows * 3.6 + caption.length * lh(7.6) + 3;
  if (measureOnly) return h;
  L.box(x, y, w, h, COLOR.white, COLOR.rule);
  L.lines(L.capped(c.base.name, 9.6, w - 30, 1, true), x + 3, y + 1.6, 9.6, true, COLOR.navy);
  L.font(7.6, false, COLOR.muted);
  L.pdf.text(L.t(c.base.unit), x + w - 3, y + 5, { align: "right" });
  let bx = x + 3;
  if (c.highReview) bx += badge(L, "flag", "REVIEW", bx, y + 5.8) + 1;
  if (c.dataCheck) bx += badge(L, "check", "DATA CHECK", bx, y + 5.8) + 1;
  const px0 = x + 13, px1 = x + w - 4, py0 = y + 12, py1 = y + 9 + plotH;
  const pts = c.base.points;
  const vals = pts.map((p) => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || Math.abs(hi) * 0.2 || 1;
  for (const b of c.bands) for (const v of [b.lower, b.upper]) if (v !== null && v >= lo - span * 1.2 && v <= hi + span * 1.2) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo || 1) * 0.15;
  const ticks = niceTicks(lo - pad, hi + pad);
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
  const labelled = new Set<string>();
  pts.forEach((p, i) => {
    if (labelled.has(p.day)) return;
    labelled.add(p.day);
    L.font(7, false, COLOR.ink);
    L.pdf.text(L.t(dayLabel(p.day)), X(days[i]!), py1 + 3.6, { align: "center" });
  });
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
    L.lines([L.t(`${p.day}${c.highReview ? " · review flag" : ""}`)], x + 3, ry + 3.6, 6.4, false, COLOR.muted);
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
  const single = r.charts.filter((c) => c.base.kind === "single");
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
  if (r.base.charts.omitted.length) L.para(`${r.base.charts.omitted.length} further result(s) are shown in the results table only.`, 7.6, COLOR.muted);
}

// ------------------------------------------------------------------ preliminary medical assessment

function assessment(L: P, r: PremiumReport) {
  L.sectionBreak(0.45);
  L.h2("Preliminary Medical Assessment — For Ground Medical Review", 40);
  L.para("Automated preliminary assessment generated from the recorded measurements. It lists possible conditions for a qualified clinician to evaluate; it is not a physician-certified diagnosis and assigns no probabilities. Symptoms, examination findings, medications, age and sex were not available unless shown.", 7.9, [51, 65, 85]);
  if (!r.concerns.length) { L.para("No preliminary clinical concern was identified in this period.", 9); return; }
  r.concerns.forEach((c, idx) => {
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
    if (h <= BOTTOM - TOP) {
      L.ensure(h);
      pair.forEach((c, j) => card(c, MX + j * (COL2 + GUT), L.y, COL2, false));
      L.y += h + GUT;
    } else {
      for (const c of pair) {
        L.h3(`${c.column}`);
        for (const it of c.items) L.para(`${it.authorization === "clinician_required" ? "[GM] " : ""}${it.text} → ${it.basis.join("; ")}`, 8.1);
      }
    }
  }
}

// ------------------------------------------------------------------ results table

function results(L: P, r: PremiumReport) {
  L.y += 3;
  L.h2("Complete results — all observations", 30);
  const c = r.counts;
  L.para(`${c.observations} observations in ${c.series} biomarker series from ${c.examinationDates} examination date(s), exactly as recorded (no unit conversion). Classes use approved criteria${r.options.provisionalActive ? " or, where marked PROVISIONAL, literature criteria for this synthetic demonstration" : ""}; review priority and data quality are shown separately.`, 7.8, [51, 65, 85]);
  const cols = [
    { k: "Measurement", w: 0.25 }, { k: "Value", w: 0.13 }, { k: "Date", w: 0.09 }, { k: "Class", w: 0.13 }, { k: "Review / data", w: 0.13 }, { k: "Criterion & limitation", w: 0.27 },
  ].map((x) => ({ ...x, w: x.w * CW }));
  const xs = cols.map((_, i) => MX + cols.slice(0, i).reduce((s, x) => s + x.w, 0));
  const head = () => {
    L.fill(COLOR.navy);
    L.pdf.rect(MX, L.y, CW, 5.2, "F");
    cols.forEach((col, i) => L.lines([L.t(col.k)], xs[i]! + 1.4, L.y + 0.9, 7.1, true, COLOR.white, 1.2));
    L.y += 5.6;
  };
  const rowH = (x: ResultRow) => {
    const a = L.wrap(x.name, 7.7, cols[0]!.w - 2.5).length, b = L.wrap(`${x.criterionText}${x.limitation ? ` ${x.limitation}` : ""}`, 6.9, cols[5]!.w - 2.5).length;
    return Math.max(a * lh(7.7), b * lh(6.9), 5) + 1.8;
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
      let bx = xs[4]! + 1.2;
      if (x.axes.review.value === "HIGH") bx += badge(L, "flag", "HIGH", bx, L.y + 0.8) + 1;
      if (x.axes.dataQuality.value === "DATA_QUALITY_WARNING") badge(L, "check", "CHECK", bx, L.y + 0.8);
      else if (x.axes.review.value !== "HIGH") L.lines(["—"], bx, L.y + 0.5, 7.4, false, COLOR.muted);
      L.lines(L.wrap(`${x.criterionText}${x.limitation ? ` ${x.limitation}` : ""}`, 6.9, cols[5]!.w - 2.5), xs[5]! + 1.2, L.y + 0.6, 6.9, false, [51, 65, 85]);
      L.y += h;
      L.draw(COLOR.rule);
      L.pdf.setLineWidth(0.15);
      L.pdf.line(MX, L.y - 0.4, MX + CW, L.y - 0.4);
    }
  }
}

function methodology(L: P, r: PremiumReport) {
  L.y += 3;
  L.h2("Methodology note", 30);
  const c = r.counts;
  const items = [
    `Data. ${c.observations} observations · ${c.series} biomarker series (exact catalog identity + unit) · ${c.examinationDates} examination date(s) · ${c.comparedSeries} series compared between examinations${c.excluded.length ? ` · excluded: ${c.excluded.map((e) => `${e.n} ${e.reason}`).join("; ")}` : ""}. Values exactly as recorded; no unit conversion or interpolation. ${r.header.provenanceLabel}.`,
    "Calculations. Changes only between consecutive observations of the same identity and unit; the full trajectory, including intermediate peaks and troughs, is reported.",
    `Criteria. ${c.approvedCriteria} Researcher-approved criteria available. ${r.options.provisionalActive ? `${r.demonstrationLabel}: provisional literature interpretation ON (synthetic demonstration only; marked PROVISIONAL; never approved classifications or validated alerts). ` : "Provisional literature interpretation OFF. "}General-population criteria are not NASA flight limits.`,
    ...(r.options.demonstrationMappingsActive ? [(() => {
      const used = [...new Map(r.rows.filter((x) => x.identityRoute?.kind === "demonstration_mapping").map((x) => [x.metricId, `${x.name} (${x.metricId} → ${x.identityRoute!.target}, ${x.unit})`])).values()];
      return `Synthetic identity mappings. ${demonstrationMappings().length} owner-directed mappings re-verified against the repository (same concept, identical unit, same domain, unique target, named mission); not Researcher-approved and never used for approved classification, real data or unit conversion. Used in this report: ${used.length ? used.join("; ") : "none"}.`;
    })()] : []),
    ...(Object.keys(r.priorities ?? {}).length ? [`Warning priority (panel colour; separate from clinical class; owner-directed, pending Researcher review). ${WARNING_PRIORITY_RULES.map((x) => `${x.id} ${WARNING_PRIORITY_LABEL[x.priority]}: ${x.text}`).join(" ")} NEUTRAL: ${WARNING_PRIORITY_MEANING.INSUFFICIENT_EVIDENCE}`] : []),
    `Automated assessment. ${r.base.clinical.aiStatus} Review priority and data quality are separate from clinical classification. Not a diagnosis; no medication or dose advice.`,
    `Generator ${r.version} · Evidence ID ${r.header.evidenceId}.`,
  ];
  for (const it of items) L.para(`• ${it}`, 7.6, [51, 65, 85]);
}

// ------------------------------------------------------------------ header / footer pass and entry points

function frame(L: P, r: PremiumReport) {
  const pages = L.pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    L.pdf.setPage(p);
    if (p > 1) {
      L.font(6.8, false, COLOR.muted);
      L.pdf.text(L.t(r.demonstrationLabel ? "MITOCHONDRIA" : "MITOCHONDRIA · Astronaut Health Intelligence"), MX, 9.5);
      if (r.demonstrationLabel) { L.font(6.6, true, COLOR.amberDeep); L.pdf.text(L.t(r.demonstrationLabel), W / 2, 9.5, { align: "center" }); L.font(6.8, false, COLOR.muted); }
      L.pdf.text(L.t(`${r.header.astronaut} · ${r.header.mission}`), W - MX, 9.5, { align: "right" });
      L.draw(COLOR.rule);
      L.pdf.setLineWidth(0.2);
      L.pdf.line(MX, 11.3, W - MX, 11.3);
    }
    L.draw(COLOR.rule);
    L.pdf.setLineWidth(0.25);
    L.pdf.line(MX, H - 11.5, W - MX, H - 11.5);
    const synth = r.header.provenance === "synthetic" ? " · SYNTHETIC DEMONSTRATION DATA" : "";
    L.font(6.6, false, COLOR.muted);
    L.pdf.text(L.t(`MITOCHONDRIA · Health Intelligence Report · ${r.header.astronaut}${synth} · Preliminary automated assessment — not a diagnosis`), MX, H - 8);
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
