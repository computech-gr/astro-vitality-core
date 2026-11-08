/**
 * TEST-ONLY jsPDF-compatible writer that records drawing operations and emits one SVG per page.
 * Text is measured with the real Liberation Sans advance widths (extracted with fontTools from the
 * same font family the app embeds), so wrapping, page breaks and bounds behave like the jsPDF build.
 * It is NOT jsPDF: final PDF bytes must still be verified with jspdf + pdfjs in CI.
 */
import metrics from "./liberation-sans-metrics.json";

type M = { upem: number; w: Record<string, number>; default: number };
const MET = metrics as unknown as Record<"normal" | "bold", M>;
const PT = 25.4 / 72;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export interface TextItem { page: number; text: string; x: number; y: number; w: number; size: number; bold: boolean; color: string }
export interface RectItem { page: number; x: number; y: number; w: number; h: number; fill: string | null; stroke: string | null }

export class SvgPdfWriter {
  pages: string[][] = [[]];
  texts: TextItem[] = [];
  rects: RectItem[] = [];
  props: Record<string, string> = {};
  private cur = 0;
  private style: "normal" | "bold" = "normal";
  private size = 10;
  private textColor = [0, 0, 0];
  private fillColor = [0, 0, 0];
  private drawColor = [0, 0, 0];
  private lw = 0.2;
  private dash: number[] = [];

  addPage() { this.pages.push([]); this.cur = this.pages.length - 1; return this; }
  setPage(p: number) { this.cur = p - 1; return this; }
  getNumberOfPages() { return this.pages.length; }
  setFont(_f: string, s: string) { this.style = s === "bold" ? "bold" : "normal"; return this; }
  setFontSize(n: number) { this.size = n; return this; }
  setTextColor(r: number, g: number, b: number) { this.textColor = [r, g, b]; return this; }
  setFillColor(r: number, g: number, b: number) { this.fillColor = [r, g, b]; return this; }
  setDrawColor(r: number, g: number, b: number) { this.drawColor = [r, g, b]; return this; }
  setLineWidth(w: number) { this.lw = w; return this; }
  setLineDashPattern(p: number[]) { this.dash = p; return this; }
  setProperties(p: Record<string, string>) { this.props = p; return this; }
  textWithLink(t: string, x: number, y: number) { return this.text(t, x, y); }
  getTextWidth(t: string): number {
    const m = MET[this.style];
    let u = 0;
    for (const ch of t) u += m.w[String(ch.codePointAt(0))] ?? m.default;
    return (u / m.upem) * this.size * PT;
  }
  splitTextToSize(text: string, width: number): string[] {
    const out: string[] = [];
    for (const para of String(text).split("\n")) {
      const words = para.split(/ +/);
      let line = "";
      for (const w of words) {
        const cand = line ? `${line} ${w}` : w;
        if (this.getTextWidth(cand) <= width || !line) {
          if (!line && this.getTextWidth(w) > width) {
            let chunk = "";
            for (const ch of w) { if (this.getTextWidth(chunk + ch) > width && chunk) { out.push(chunk); chunk = ch; } else chunk += ch; }
            line = chunk;
          } else line = cand;
        } else { out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  }
  text(t: string, x: number, y: number, opts?: Record<string, unknown>) {
    const w = this.getTextWidth(t);
    const align = (opts?.align as string) ?? "left";
    const x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    this.texts.push({ page: this.cur + 1, text: t, x: x0, y, w, size: this.size, bold: this.style === "bold", color: rgb(this.textColor) });
    const anchor = align === "right" ? "end" : align === "center" ? "middle" : "start";
    this.pages[this.cur]!.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${(this.size * PT).toFixed(3)}" font-family="Liberation Sans" font-weight="${this.style === "bold" ? 700 : 400}" text-anchor="${anchor}" fill="${rgb(this.textColor)}" xml:space="preserve">${esc(t)}</text>`);
    return this;
  }
  private paint(style?: string) {
    const f = !style || style.includes("F") ? rgb(this.fillColor) : "none";
    const s = style && (style.includes("D") || style === "S") ? rgb(this.drawColor) : "none";
    return { f: style === "S" ? "none" : f, s, attr: `fill="${style === "S" ? "none" : f}" stroke="${s}" stroke-width="${this.lw}"${this.dash.length && s !== "none" ? ` stroke-dasharray="${this.dash.join(" ")}"` : ""}` };
  }
  rect(x: number, y: number, w: number, h: number, style?: string) {
    const p = this.paint(style);
    this.rects.push({ page: this.cur + 1, x, y, w, h, fill: p.f === "none" ? null : p.f, stroke: p.s === "none" ? null : p.s });
    this.pages[this.cur]!.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" ${p.attr}/>`);
    return this;
  }
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) {
    const p = this.paint(style);
    this.rects.push({ page: this.cur + 1, x, y, w, h, fill: p.f === "none" ? null : p.f, stroke: p.s === "none" ? null : p.s });
    this.pages[this.cur]!.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${rx}" ry="${ry}" ${p.attr}/>`);
    return this;
  }
  circle(x: number, y: number, r: number, style?: string) {
    this.pages[this.cur]!.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" ${this.paint(style).attr}/>`);
    return this;
  }
  triangle(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, style?: string) {
    this.pages[this.cur]!.push(`<polygon points="${x1},${y1} ${x2},${y2} ${x3},${y3}" ${this.paint(style).attr}/>`);
    return this;
  }
  line(x1: number, y1: number, x2: number, y2: number) {
    this.pages[this.cur]!.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${rgb(this.drawColor)}" stroke-width="${this.lw}"${this.dash.length ? ` stroke-dasharray="${this.dash.join(" ")}"` : ""}/>`);
    return this;
  }
  output(_k: "blob") { return new Blob([this.svgPages().join("\n")]); }
  svgPages(): string[] {
    return this.pages.map((els) => `<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297"><rect width="210" height="297" fill="white"/>${els.join("")}</svg>`);
  }
}
