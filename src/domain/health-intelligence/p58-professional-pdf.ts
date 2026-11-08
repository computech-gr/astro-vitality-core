/**
 * P58 — professional, adaptive, searchable A4 PDF for the ProfessionalReport.
 *
 * No page cap: pages follow content. Page 1 is an executive summary (identity,
 * KPI tiles, key conclusions, follow-up priority); then key findings, a
 * mandatory visual section (vector line charts and single-value visuals),
 * the preliminary clinical assessment, recommendations, and methodology with
 * the Evidence ID and a separate audit trail. Cards break only between rows,
 * headings are never orphaned and every page carries header/footer, Evidence
 * ID and "page X of Y". Text stays searchable (embedded Liberation Sans).
 * Colour marks only validated classifications; review flags use dashed blue.
 */
import type { Severity } from "./biomarker-health-assessment";
import { CRITERION_STATUS_TEXT } from "./p58-clinical-reasoning";
import type { ProfessionalReport } from "./p58-professional-report";
import type { ReportChart } from "./p58-report-charts";
import { RECOMMENDATION_CATEGORIES, RECOMMENDATION_CATEGORY_LABELS } from "./p56-pattern-library";
import { openTextPdf, toWinAnsi, type PdfDeps, type PdfFactory, type ReportFonts, type TextPdfResult } from "./report-text-pdf";
import { redactProhibitedNames } from "./report-identity-redaction";

type RGB = readonly [number, number, number];
const C = {
  navy: [18, 38, 74] as RGB,
  teal: [0, 112, 118] as RGB,
  ink: [30, 34, 40] as RGB,
  muted: [92, 100, 110] as RGB,
  rule: [212, 218, 226] as RGB,
  paper: [248, 249, 251] as RGB,
  navyTint: [234, 239, 247] as RGB,
  tealTint: [226, 242, 242] as RGB,
  red: [170, 28, 42] as RGB,
  redTint: [250, 232, 234] as RGB,
  amber: [160, 92, 0] as RGB,
  amberTint: [252, 241, 220] as RGB,
  green: [28, 112, 60] as RGB,
  review: [38, 70, 158] as RGB,
  reviewTint: [233, 238, 251] as RGB,
  white: [255, 255, 255] as RGB,
};
const SEV: Record<Severity, RGB> = { red: C.red, amber: C.amber, normal: C.green, neutral: C.teal };
const SEV_TINT: Record<Severity, RGB> = { red: C.redTint, amber: C.amberTint, normal: C.tealTint, neutral: C.paper };

const W = 210;
const H = 297;
const M = 14;
const CW = W - 2 * M;
const TOP = 18;
const BOTTOM = 280;
const PT = 0.3528;
const lh = (size: number, k = 1.32) => size * PT * k;

type Writer = InstanceType<PdfFactory> & {
  roundedRect?(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): unknown;
  circle?(x: number, y: number, r: number, style?: string): unknown;
  setLineDashPattern?(pattern: number[], phase: number): unknown;
  setCreationDate?(d: Date | string): unknown;
  setFileId?(id: string): unknown;
};

const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };

class Layout {
  y = TOP;
  constructor(
    readonly pdf: Writer,
    readonly family: string,
    readonly unicode: boolean,
  ) {}
  t(s: string): string {
    const r = redactProhibitedNames(s).replace(/[₀-₉]/g, (c) => SUB[c] ?? c);
    return this.unicode ? r : toWinAnsi(r);
  }
  font(size: number, bold = false, color: RGB = C.ink) {
    this.pdf.setFont(this.family, bold ? "bold" : "normal");
    this.pdf.setFontSize(size);
    this.pdf.setTextColor(color[0], color[1], color[2]);
  }
  fill(c: RGB) {
    this.pdf.setFillColor(c[0], c[1], c[2]);
  }
  draw(c: RGB) {
    this.pdf.setDrawColor(c[0], c[1], c[2]);
  }
  wrap(text: string, size: number, width: number, bold = false): string[] {
    this.font(size, bold);
    return this.pdf.splitTextToSize(this.t(text), width);
  }
  newPage() {
    this.pdf.addPage();
    this.y = TOP;
  }
  ensure(h: number) {
    if (this.y + h > BOTTOM) this.newPage();
  }
  room() {
    return BOTTOM - this.y;
  }
  /** Draws wrapped lines at (x, y); returns height used. */
  lines(ls: string[], x: number, y: number, size: number, bold = false, color: RGB = C.ink, k = 1.32): number {
    this.font(size, bold, color);
    ls.forEach((l, i) => this.pdf.text(l, x, y + lh(size, k) * (i + 0.78)));
    return ls.length * lh(size, k);
  }
  rect(x: number, y: number, w: number, h: number, fill: RGB, stroke?: RGB, r = 1.2) {
    this.fill(fill);
    if (stroke) {
      this.draw(stroke);
      this.pdf.setLineWidth(0.2);
    }
    const style = stroke ? "FD" : "F";
    if (this.pdf.roundedRect && r > 0) this.pdf.roundedRect(x, y, w, h, r, r, style);
    else this.pdf.rect(x, y, w, h, style);
  }
  dash(on: boolean) {
    this.pdf.setLineDashPattern?.(on ? [1.2, 1] : [], 0);
  }
  heading(text: string, sub?: string) {
    const subLines = sub ? this.wrap(sub, 8.5, CW) : [];
    this.ensure(14 + subLines.length * lh(8.5) + 24); // never orphan a heading
    this.lines(this.wrap(text, 14, CW, true), M, this.y, 14, true, C.navy);
    this.y += lh(14) + 1;
    this.fill(C.teal);
    this.pdf.rect(M, this.y, 18, 0.9, "F");
    this.draw(C.rule);
    this.pdf.setLineWidth(0.2);
    this.pdf.line(M + 19, this.y + 0.45, M + CW, this.y + 0.45);
    this.y += 3.5;
    if (subLines.length) this.y += this.lines(subLines, M, this.y, 8.5, false, C.muted) + 2;
  }
  para(text: string, size = 9.5, color: RGB = C.ink, bold = false, x = M, w = CW) {
    const ls = this.wrap(text, size, w, bold);
    let i = 0;
    while (i < ls.length) {
      const fit = Math.max(1, Math.floor(this.room() / lh(size)));
      const chunk = ls.slice(i, i + fit);
      if (this.room() < lh(size)) {
        this.newPage();
        continue;
      }
      this.y += this.lines(chunk, x, this.y, size, bold, color);
      i += chunk.length;
      if (i < ls.length) this.newPage();
    }
    this.y += 1.2;
  }
  /** Card made of rows; breaks only between rows; each row segment carries the accent bar and tint. */
  card(rows: { label?: string; text: string[]; size?: number; bold?: boolean; color?: RGB }[], accent: RGB, tint: RGB, header?: { title: string; chip?: { text: string; color: RGB; dashed?: boolean } }) {
    const pad = 3;
    const labelW = 36;
    const prepared = rows
      .filter((r) => r.text.length)
      .map((r) => {
        const size = r.size ?? 8.7;
        const w = r.label ? CW - pad * 2 - 2 - labelW : CW - pad * 2 - 2;
        const body = r.text.flatMap((t, i) => {
          const ls = this.wrap(r.text.length > 1 ? `•  ${t}` : t, size, w, r.bold);
          return i === 0 ? ls : ls;
        });
        const labelLines = r.label ? this.wrap(r.label, 7.6, labelW - 2, true) : [];
        const h = Math.max(body.length * lh(size), labelLines.length * lh(7.6)) + 1.8;
        return { ...r, size, body, labelLines, h, w };
      });
    const headLines = header ? this.wrap(header.title, 11, CW - pad * 2 - 2 - (header.chip ? 58 : 0), true) : [];
    const headH = header ? headLines.length * lh(11) + 3 : 0;
    const firstH = headH + (prepared[0]?.h ?? 0) + pad;
    this.ensure(Math.min(firstH, BOTTOM - TOP));
    let segTop = this.y;
    const startSeg = () => {
      segTop = this.y;
    };
    const closeSeg = () => {
      const h = this.y - segTop;
      if (h <= 0) return;
      // background drawn after content would hide text; so tint is drawn first via measuring below
    };
    void closeSeg;
    const drawSegBg = (h: number) => {
      this.rect(M, this.y, CW, h, tint);
      this.fill(accent);
      this.pdf.rect(M, this.y, 1.6, h, "F");
    };
    startSeg();
    if (header) {
      drawSegBg(headH + pad);
      this.y += pad;
      this.lines(headLines, M + pad + 2, this.y, 11, true, C.ink);
      if (header.chip) this.chip(header.chip.text, M + CW - pad - 56, this.y, 56, header.chip.color, header.chip.dashed);
      this.y += headH;
    }
    for (const r of prepared) {
      if (this.y + r.h > BOTTOM) {
        this.newPage();
      }
      drawSegBg(r.h + 0.6);
      if (r.label) this.lines(r.labelLines, M + pad + 2, this.y + 0.6, 7.6, true, C.muted);
      this.lines(r.body, M + pad + 2 + (r.label ? labelW : 0), this.y + 0.6, r.size, r.bold, r.color ?? C.ink);
      this.y += r.h + 0.6;
    }
    drawSegBg(pad - 1.5);
    this.y += pad - 1.5 + 3.5;
  }
  chip(text: string, x: number, y: number, w: number, color: RGB, dashed = false) {
    const ls = this.wrap(text, 7, w - 3, true);
    const h = ls.length * lh(7) + 1.6;
    this.fill(C.white);
    this.draw(color);
    this.pdf.setLineWidth(0.35);
    this.dash(dashed);
    if (this.pdf.roundedRect) this.pdf.roundedRect(x, y, w, h, 1, 1, "FD");
    else this.pdf.rect(x, y, w, h, "FD");
    this.dash(false);
    this.lines(ls, x + 1.5, y + 0.8, 7, true, color);
    return h;
  }
}

function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const raw = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Number(v.toFixed(10)));
  return out;
}
const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? String(Number(v.toFixed(1))) : String(Number(v.toFixed(2))));

function drawLineChart(L: Layout, c: ReportChart, x: number, y: number, w: number, h: number) {
  const pdf = L.pdf;
  L.rect(x, y, w, h, C.white, C.rule, 1.4);
  const title = L.wrap(c.name, 8.6, w - 6, true).slice(0, 2);
  L.lines(title, x + 3, y + 2, 8.6, true, C.navy);
  let ty = y + 2 + title.length * lh(8.6);
  L.lines([L.t(`${c.unit} · ${c.domainLabel}`)], x + 3, ty, 6.6, false, C.muted);
  ty += lh(6.6) + 1;
  if (c.flagged !== "none") L.chip(c.flagged === "priority_review" ? "Review flag" : "Data check", x + w - 22, y + 2, 19, C.review, true);
  const capLines = L.wrap(c.caption, 6.6, w - 6).slice(0, 4);
  const limLines = c.limitation ? L.wrap(c.limitation, 6.2, w - 6).slice(0, 2) : [];
  const capH = capLines.length * lh(6.6) + limLines.length * lh(6.2) + 2;
  const px = x + 13;
  const pw = w - 18;
  const py = ty + 2;
  const ph = h - (py - y) - capH - 7;
  const values = [...c.points.map((p) => p.value), ...c.referenceLines.map((r) => r.value)];
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const lo = ticks[0]!;
  const hi = ticks[ticks.length - 1]!;
  const Y = (v: number) => py + ph - ((v - lo) / (hi - lo || 1)) * ph;
  const X = (i: number) => (c.points.length === 1 ? px + pw / 2 : px + (i / (c.points.length - 1)) * pw);
  pdf.setLineWidth(0.15);
  L.draw(C.rule);
  L.font(6, false, C.muted);
  for (const t of ticks) {
    pdf.line(px, Y(t), px + pw, Y(t));
    pdf.text(L.t(fmt(t)), px - 1.5, Y(t) + 0.8, { align: "right" });
  }
  for (const r of c.referenceLines) {
    if (r.value < lo || r.value > hi) continue;
    L.draw(C.muted);
    pdf.setLineWidth(0.25);
    L.dash(true);
    pdf.line(px, Y(r.value), px + pw, Y(r.value));
    L.dash(false);
    L.font(5.4, false, C.muted);
    pdf.text(L.t(r.label), px + pw, Y(r.value) - 0.6, { align: "right" });
  }
  L.draw(C.teal);
  pdf.setLineWidth(0.55);
  for (let i = 1; i < c.points.length; i++) pdf.line(X(i - 1), Y(c.points[i - 1]!.value), X(i), Y(c.points[i]!.value));
  c.points.forEach((p, i) => {
    const col = p.severity === "neutral" ? C.teal : SEV[p.severity];
    L.fill(col);
    L.draw(C.white);
    pdf.setLineWidth(0.3);
    if (pdf.circle) pdf.circle(X(i), Y(p.value), p.severity === "neutral" ? 0.9 : 1.3, "FD");
    else pdf.rect(X(i) - 0.8, Y(p.value) - 0.8, 1.6, 1.6, "F");
    if (p.annotation) {
      L.draw(C.review);
      pdf.setLineWidth(0.35);
      L.dash(true);
      pdf.circle?.(X(i), Y(p.value), 2.2, "S");
      L.dash(false);
      L.font(5.8, true, C.review);
      const above = Y(p.value) - 3 > py;
      pdf.text(L.t(`${p.annotation} ${p.valueText}`), X(i), above ? Y(p.value) - 3 : Y(p.value) + 4.6, { align: "center" });
    }
    L.font(5.8, false, C.muted);
    const show = c.points.length <= 8 || i === 0 || i === c.points.length - 1 || i % Math.ceil(c.points.length / 6) === 0;
    if (show) pdf.text(L.t(p.label), X(i), py + ph + 3.2, { align: "center" });
  });
  L.font(6.2, true, SEV[c.points.at(-1)!.severity]);
  const last = c.points.at(-1)!;
  pdf.text(L.t(last.valueText), Math.min(X(c.points.length - 1) + 1.8, x + w - 2), Y(last.value) - 1.2, { align: c.points.length > 1 ? "left" : "center" });
  let cy = py + ph + 5;
  cy += L.lines(capLines, x + 3, cy, 6.6, false, C.ink);
  if (limLines.length) L.lines(limLines, x + 3, cy, 6.2, false, C.muted);
}

function drawSingle(L: Layout, c: ReportChart, x: number, y: number, w: number, h: number) {
  const p = c.points[0]!;
  const col = c.severity === "neutral" ? C.navy : SEV[c.severity];
  L.rect(x, y, w, h, c.severity === "neutral" ? C.paper : SEV_TINT[c.severity], C.rule, 1.4);
  L.fill(col);
  L.pdf.rect(x, y, 1.6, h, "F");
  const name = L.wrap(c.name, 8.2, w - 40, true).slice(0, 2);
  L.lines(name, x + 4, y + 2.4, 8.2, true, C.navy);
  L.lines([L.t(`${c.domainLabel} · ${p.day}`)], x + 4, y + 2.4 + name.length * lh(8.2), 6.4, false, C.muted);
  L.font(15, true, col);
  L.pdf.text(L.t(p.valueText), x + w - 4, y + 9.5, { align: "right" });
  L.font(6.6, false, C.muted);
  L.pdf.text(L.t(c.unit), x + w - 4, y + 13.2, { align: "right" });
  const note = L.wrap(`${c.caption}${c.limitation ? ` ${c.limitation}` : ""}`, 6.2, w - 8).slice(0, 3);
  L.lines(note, x + 4, y + h - note.length * lh(6.2) - 1.8, 6.2, false, C.muted);
}

export function renderProfessionalReport(r: ProfessionalReport, pdf: Writer, opts: { family: string; unicode: boolean }): { pages: number } {
  const L = new Layout(pdf, opts.family, opts.unicode);
  const a = r.assessment;
  const h = a.header;

  // ---------- Page 1: executive summary
  L.fill(C.navy);
  pdf.rect(0, 0, W, 44, "F");
  L.fill(C.teal);
  pdf.rect(0, 44, W, 1.4, "F");
  L.font(8, true, [170, 205, 210]);
  pdf.text(L.t("MITOCHONDRIA  ·  ASTRONAUT HEALTH INTELLIGENCE"), M, 11);
  L.font(7, false, [200, 210, 225]);
  pdf.text(L.t(`Evidence ID ${r.evidenceId}`), W - M, 11, { align: "right" });
  L.font(21, true, C.white);
  pdf.text(L.t("Astronaut Health Assessment"), M, 25);
  L.font(9, false, [214, 224, 236]);
  pdf.text(L.t("Integrated multi-domain medical report · preliminary assessment pending Ground Medical review"), M, 32.5);
  L.font(8, false, [214, 224, 236]);
  pdf.text(L.t(h.provenanceLabel), M, 38.5);
  L.y = 51;
  const cols: [string, string][] = [
    ["Astronaut", h.astronaut],
    ["Mission", h.mission],
    ["Reporting period", h.period],
    ["Examinations", h.examinationDates.length ? h.examinationDates.join(", ") : "None in this period"],
  ];
  const cw = CW / 4;
  let idH = 0;
  cols.forEach(([k, v], i) => {
    L.lines([L.t(k.toUpperCase())], M + i * cw, L.y, 6.6, true, C.muted);
    idH = Math.max(idH, lh(6.6) + L.lines(L.wrap(v, 9, cw - 3, true).slice(0, 4), M + i * cw, L.y + lh(6.6), 9, true, C.ink));
  });
  L.y += idH + 4;
  const kpi: { label: string; value: number; color: RGB; tint: RGB; note: string }[] = [
    { label: "Validated clinical alerts", value: r.kpis.validatedAlerts, color: r.kpis.validatedAlerts ? C.red : C.navy, tint: r.kpis.validatedAlerts ? C.redTint : C.navyTint, note: "approved criteria only" },
    { label: "Concerns for Ground Medical", value: r.kpis.concerns, color: C.navy, tint: C.navyTint, note: "pending review" },
    { label: "Review flags", value: r.kpis.reviewFlags + r.kpis.dataChecks, color: C.review, tint: C.reviewTint, note: `${r.kpis.reviewFlags} change · ${r.kpis.dataChecks} data check` },
    { label: "Measurements", value: r.kpis.measurements, color: C.teal, tint: C.tealTint, note: `${r.kpis.examinations} examination date${r.kpis.examinations === 1 ? "" : "s"}` },
  ];
  const kw = (CW - 9) / 4;
  kpi.forEach((k, i) => {
    const x = M + i * (kw + 3);
    L.rect(x, L.y, kw, 22, k.tint);
    L.fill(k.color);
    pdf.rect(x, L.y, kw, 1.1, "F");
    L.font(18, true, k.color);
    pdf.text(String(k.value), x + 3, L.y + 10.5);
    L.lines(L.wrap(k.label, 7.2, kw - 5, true).slice(0, 2), x + 3, L.y + 12, 7.2, true, C.ink);
    L.lines([L.t(k.note)], x + 3, L.y + 17.6, 6.2, false, C.muted);
  });
  L.y += 27;
  L.heading("Key conclusions");
  for (const p of a.overview) L.para(p, 9.3);
  for (const k of a.keyFindings) {
    const ls = L.wrap(k.text.replace(/^\[(?:REVIEW|DATA CHECK)\]\s*/, ""), 9, CW - 7);
    L.ensure(ls.length * lh(9) + 1);
    const col = k.severity !== "neutral" ? SEV[k.severity] : k.review !== "none" ? C.review : C.muted;
    L.fill(col);
    if (pdf.circle) pdf.circle(M + 1.6, L.y + 2, 1.1, "F");
    else pdf.rect(M + 0.8, L.y + 1.2, 1.6, 1.6, "F");
    L.y += L.lines(ls, M + 5, L.y, 9, false, k.severity !== "neutral" ? SEV[k.severity] : C.ink) + 1.2;
  }
  L.y += 2;
  L.card(
    [
      { label: "Follow-up priority", text: [`${a.followUp.label} — ${a.followUp.text}`], bold: false },
      { label: "Clinical severity", text: [a.followUp.clinicalSeverity] },
      { label: "Validated alerts", text: [a.warningsStatement, ...a.warnings.map((w) => `${w.marker} ${w.text}`)] },
      { label: "Ground Medical", text: [r.review.label] },
    ],
    C.navy,
    C.navyTint,
  );

  // ---------- Key findings
  L.newPage();
  L.heading("Key findings", "Related biomarkers are explained together. Colour appears only for results classified by an approved criterion; dashed blue marks review triage.");
  for (const f of a.findings) {
    const accent = f.severity !== "neutral" ? SEV[f.severity] : f.reviewPriority !== "none" ? C.review : C.teal;
    L.card(
      [
        { label: "What changed", text: [f.whatChanged] },
        ...(f.combined ? [{ label: "Together", text: [f.combined] }] : []),
        { label: "Interpretation", text: [f.interpretation] },
        { label: "Uncertainty", text: f.uncertainty.slice(0, 3), size: 7.8, color: C.muted },
      ],
      accent,
      C.paper,
      {
        title: f.title,
        chip:
          f.severity !== "neutral"
            ? { text: f.marker || f.severity.toUpperCase(), color: SEV[f.severity] }
            : f.reviewPriority !== "none"
              ? { text: f.reviewPriority === "priority_review" ? "Review flag" : "Data check", color: C.review, dashed: true }
              : undefined,
      },
    );
  }
  if (a.otherResults.statement) L.para(a.otherResults.statement, 7.8, C.muted);

  // ---------- Visual summary (mandatory when data allow)
  L.heading("Visual summary", r.charts.note);
  const line = r.charts.charts.filter((c) => c.kind === "line");
  const single = r.charts.charts.filter((c) => c.kind === "single");
  const gw = (CW - 4) / 2;
  const ch = 66;
  for (let i = 0; i < line.length; i += 2) {
    L.ensure(ch);
    drawLineChart(L, line[i]!, M, L.y, gw, ch);
    if (line[i + 1]) drawLineChart(L, line[i + 1]!, M + gw + 4, L.y, gw, ch);
    L.y += ch + 4;
  }
  const sh = 26;
  for (let i = 0; i < single.length; i += 2) {
    L.ensure(sh);
    drawSingle(L, single[i]!, M, L.y, gw, sh);
    if (single[i + 1]) drawSingle(L, single[i + 1]!, M + gw + 4, L.y, gw, sh);
    L.y += sh + 3;
  }
  if (r.charts.omitted.length) L.para(`Not charted: ${r.charts.omitted.map((o) => `${o.name} (${o.reason})`).join("; ")}.`, 7.4, C.muted);

  // ---------- Preliminary clinical assessment
  L.heading(r.clinical.title, r.clinical.diagnosisStatement);
  if (!r.clinical.concerns.length) L.para("No concern pattern is supported by the recorded evidence in this period.", 9, C.muted);
  for (const c of r.clinical.concerns) {
    const st = r.review.statuses[c.concernId];
    const accent = c.severity !== "neutral" ? SEV[c.severity] : c.priority === "prompt" || c.priority === "measurement_check" ? C.review : C.teal;
    L.card(
      [
        { label: "Ground Medical status", text: [`${st?.label ?? "Pending Ground Medical review"}${st?.text ? ` — ${st.text}` : ""}`], bold: true, color: C.navy },
        { label: "What happened", text: [c.narrative.whatHappened] },
        { label: "Why it matters", text: [c.narrative.whyItMatters] },
        { label: "Supporting evidence", text: c.supporting },
        { label: "Contradicting evidence", text: c.contradicting },
        { label: "Alternative explanations", text: c.alternatives },
        { label: "Missing tests and information", text: c.missing },
        { label: "Diagnostic criteria", text: c.criteria.length ? c.criteria.map((x) => `${CRITERION_STATUS_TEXT[x.status]} — ${x.title} (${x.source}): ${x.detail}`) : ["No standardized criterion is available for this concern in the registry."] },
        { label: "Confirmation steps", text: c.confirmation },
        { label: "Possible mechanisms", text: c.narrative.mechanisms, size: 8.2 },
        { label: "Ground Medical should verify", text: c.narrative.groundMedicalVerify, size: 8.2 },
        { label: "AI-assisted notes (validated)", text: c.aiNotes.map((n) => n.text), size: 8.2, color: C.muted },
      ],
      accent,
      C.paper,
      { title: c.title, chip: { text: c.priorityLabel, color: c.severity !== "neutral" ? SEV[c.severity] : C.review, dashed: c.severity === "neutral" } },
    );
  }
  for (const x of r.clinical.crossDomain) L.card([{ label: x.origin === "ai_assisted" ? "Cross-domain (AI-assisted, validated)" : "Cross-domain observation", text: [x.text] }], C.navy, C.navyTint);
  for (const d of r.review.added) L.card([{ label: "Clinician-added assessment", text: [`${d.text} (${d.reviewedAt})`] }], C.navy, C.navyTint);

  // ---------- Recommendations
  L.heading("Recommendations", "Each recommendation states its basis and whether it is general wellness guidance or requires Ground Medical authorization. No medication, supplement or dose advice is given.");
  for (const cat of RECOMMENDATION_CATEGORIES) {
    const items = r.recommendations.filter((x) => x.category === cat);
    if (!items.length) continue;
    L.ensure(lh(10) + 14);
    L.lines([L.t(RECOMMENDATION_CATEGORY_LABELS[cat])], M, L.y, 10, true, C.teal);
    L.y += lh(10) + 1;
    for (const x of items) {
      const body = L.wrap(`${x.id}.  ${x.text}`, 8.8, CW - 6);
      const meta = L.wrap(`${x.authorizationLabel} · Based on: ${x.basis.join("; ")}`, 7.2, CW - 6);
      const hh = body.length * lh(8.8) + meta.length * lh(7.2) + 2.5;
      L.ensure(hh);
      L.fill(x.authorization === "clinician_required" ? C.navy : C.teal);
      pdf.rect(M, L.y + 0.6, 0.9, hh - 2, "F");
      L.y += L.lines(body, M + 3.5, L.y, 8.8, false, C.ink);
      L.y += L.lines(meta, M + 3.5, L.y, 7.2, x.authorization === "clinician_required", x.authorization === "clinician_required" ? C.navy : C.muted) + 2.5;
    }
    L.y += 1.5;
  }
  if (!r.recommendations.length) L.para("No recommendations: no reviewed results in this period.", 9, C.muted);

  // ---------- Methodology, evidence and audit
  L.heading("Methodology and evidence");
  L.para(a.methodology, 8);
  L.para(a.completeness, 8, C.muted);
  L.para(`Concern library v${r.clinical.library.version} (${r.clinical.library.status === "PENDING_SCIENTIFIC_REVIEW" ? "pending scientific review" : r.clinical.library.status}). ${r.clinical.aiStatus}`, 8, C.muted);
  for (const g of r.clinical.evidenceGaps) L.para(`Evidence gap — ${g.label}. ${g.reason}`, 7.6, C.muted);
  L.ensure(20);
  L.lines([L.t("Audit trail (kept separate from AI output)")], M, L.y, 8.6, true, C.navy);
  L.y += lh(8.6) + 0.5;
  for (const x of r.audit) L.para(`${x.at} · ${x.kind === "ai_generation" ? "Assessment generation" : "Clinician decision"} · ${x.summary}`, 7.4, C.muted);
  L.para(`Evidence ID ${r.evidenceId}. ${r.disclosure}`, 7.6, C.ink);

  // ---------- Header / footer on every page
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    if (p > 1) {
      L.font(7.2, true, C.navy);
      pdf.text(L.t("MITOCHONDRIA · Astronaut Health Assessment"), M, 10);
      L.font(7, false, C.muted);
      pdf.text(L.t(`${h.astronaut} · ${h.mission}`), W - M, 10, { align: "right" });
      L.draw(C.rule);
      pdf.setLineWidth(0.25);
      pdf.line(M, 12, W - M, 12);
    }
    L.draw(C.rule);
    pdf.setLineWidth(0.25);
    pdf.line(M, H - 15, W - M, H - 15);
    L.font(6.6, false, C.muted);
    pdf.text(L.t(`Evidence ID ${r.evidenceId} · ${h.provenanceLabel}`), M, H - 11);
    pdf.text(L.t("Research use · preliminary assessment pending Ground Medical review · not a diagnosis"), M, H - 7.6);
    L.font(7, true, C.navy);
    pdf.text(L.t(`Page ${p} of ${pages}`), W - M, H - 11, { align: "right" });
  }
  return { pages };
}

export async function createProfessionalReportPdf(r: ProfessionalReport, deps?: PdfDeps, meta?: { fixedDate?: string }): Promise<TextPdfResult> {
  const { pdf, fonts } = await openTextPdf(deps);
  return renderProfessional(pdf as Writer, fonts, r, meta);
}

export function renderProfessional(pdf: Writer, fonts: ReportFonts | null, r: ProfessionalReport, meta?: { fixedDate?: string }): TextPdfResult {
  let family = "helvetica";
  if (fonts) {
    pdf.addFileToVFS("LiberationSans-Regular.ttf", fonts.regular);
    pdf.addFont("LiberationSans-Regular.ttf", "LiberationSans", "normal");
    pdf.addFileToVFS("LiberationSans-Bold.ttf", fonts.bold);
    pdf.addFont("LiberationSans-Bold.ttf", "LiberationSans", "bold");
    family = "LiberationSans";
  }
  pdf.setProperties({
    title: redactProhibitedNames(`Astronaut Health Assessment — ${r.assessment.header.astronaut}`),
    subject: `Evidence ID ${r.evidenceId}; preliminary assessment pending Ground Medical review`,
    creator: "MITOCHONDRIA - local export",
    keywords: "research use, preliminary, not a diagnosis",
  });
  if (meta?.fixedDate) {
    pdf.setCreationDate?.(new Date(meta.fixedDate));
    pdf.setFileId?.(`${r.evidenceId.replace(/[^0-9A-F]/g, "")}${"0".repeat(32)}`.slice(0, 32));
  }
  const { pages } = renderProfessionalReport(r, pdf, { family, unicode: Boolean(fonts) });
  const blob = pdf.output("blob");
  if (!(blob.size > 0)) throw new Error("The PDF file is empty.");
  return { blob, pages, fontMode: fonts ? "unicode" : "standard" };
}
