/**
 * Local browser rendering only. No report payload leaves the browser.
 *
 * Root cause of the v7 direct-PDF failure: the whole report was rasterized
 * into ONE canvas. Long reports exceed browser canvas limits (Chrome/Edge
 * 32,767 px per side; iOS Safari ~16.7 M px area) and the old 40,000 px guard
 * rejected anything larger. The report is now captured in bounded bands that
 * always end at page boundaries, each band is sliced into A4 pages and freed
 * before the next one is rendered, so canvas size and memory stay bounded
 * regardless of report length.
 */
export function downloadReportBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export interface PdfBlock {
  top: number;
  bottom: number;
}

/**
 * Page cuts at report-item boundaries. An item that crosses the page end
 * moves to the next page. An item taller than a whole page (or one that
 * already starts the page) cannot move, so the page is cut at its full
 * height instead of failing the export.
 */
export function reportPageCuts(height: number, pageHeight: number, blocks: readonly PdfBlock[]): number[] {
  if (!(height > 0) || !(pageHeight > 0)) throw new Error("Report has no printable content.");
  const cuts = [0];
  let start = 0;
  // Tiny tolerance absorbs sub-pixel rounding from getBoundingClientRect.
  const epsilon = 0.5;
  while (start < height - epsilon) {
    let end = Math.min(height, start + pageHeight);
    if (end < height) {
      const movable = blocks.filter((b) => b.top > start + epsilon && b.top < end && b.bottom > end + epsilon);
      if (movable.length) end = Math.min(...movable.map((b) => b.top));
    }
    if (end <= start + epsilon) end = Math.min(height, start + pageHeight);
    cuts.push(end);
    start = end;
  }
  return cuts;
}

/** Group consecutive pages into bands whose height never exceeds maxBandHeight. */
export function planRenderBands(cuts: readonly number[], maxBandHeight: number): Array<{ start: number; end: number; pages: number[] }> {
  const bands: Array<{ start: number; end: number; pages: number[] }> = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const top = cuts[i]!;
    const bottom = cuts[i + 1]!;
    const band = bands.at(-1);
    if (band && bottom - band.start <= maxBandHeight) {
      band.end = bottom;
      band.pages.push(i);
    } else bands.push({ start: top, end: bottom, pages: [i] });
  }
  return bands;
}

export const PDF_LAYOUT = {
  /** CSS px width of the A4 printable area (210−24 mm) at 96 dpi. */
  width: 703,
  /** 263 mm printable height at the same scale. */
  pageHeight: (703 * 263) / 186,
  scale: 1.5,
  /** Band height in CSS px; × scale stays far below every browser canvas limit. */
  maxBandHeight: 6000,
  maxPages: 300,
} as const;

interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d"): { drawImage(...args: unknown[]): void; fillStyle: unknown; fillRect(...args: number[]): void } | null;
  toDataURL(type: string, quality?: number): string;
}
interface PdfLike {
  setProperties(p: Record<string, string>): unknown;
  addPage(format: string, orientation: string): unknown;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): unknown;
  output(kind: "blob"): Blob;
}
export interface ReportPdfDeps {
  render(element: HTMLElement, options: Record<string, unknown>): Promise<CanvasLike>;
  createPdf(): PdfLike;
  createCanvas(): CanvasLike;
  fontsReady?: Promise<unknown>;
}

async function browserDeps(): Promise<ReportPdfDeps> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  return {
    render: (element, options) => html2canvas(element, options) as unknown as Promise<CanvasLike>,
    createPdf: () => new jsPDF({ unit: "mm", format: "a4", compress: true }) as unknown as PdfLike,
    createCanvas: () => document.createElement("canvas") as unknown as CanvasLike,
    fontsReady: document.fonts?.ready,
  };
}

/** Apply the existing print rules to the isolated capture clone, never the live UI. */
function prepareClone(doc: Document, cloned: HTMLElement, width: number) {
  for (const sheet of [...doc.styleSheets]) {
    let rules: CSSRule[];
    try {
      rules = [...sheet.cssRules];
    } catch {
      continue;
    }
    const style = doc.createElement("style");
    style.textContent = rules
      .map((r) => r.cssText.replace(/@media print\b/g, "@media all").replace(/@media screen\b/g, "@media not all"))
      .join("\n");
    sheet.disabled = true;
    doc.head.appendChild(style);
  }
  doc.documentElement.style.width = `${width}px`;
  doc.body.style.width = `${width}px`;
  const root = doc.createElement("main");
  root.className = "report-root";
  root.appendChild(cloned);
  doc.body.replaceChildren(root);
}

function measureClone(cloned: HTMLElement): { height: number; blocks: PdfBlock[] } {
  const base = cloned.getBoundingClientRect().top;
  const blocks = [...cloned.querySelectorAll("tr, li, .report-avoid-break, .report-cover, h3, h4")]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .map((r) => ({ top: r.top - base, bottom: r.bottom - base }));
  return { height: Math.max(cloned.scrollHeight, cloned.getBoundingClientRect().height), blocks };
}

export async function createReportPdf(element: HTMLElement, title: string, injected?: ReportPdfDeps): Promise<Blob> {
  const deps = injected ?? (await browserDeps());
  await deps.fontsReady;
  const { width, pageHeight, scale, maxBandHeight, maxPages } = PDF_LAYOUT;
  let measured: { height: number; blocks: PdfBlock[] } | null = null;
  const capture = (y: number, height: number, measure: boolean) =>
    deps.render(element, {
      scale,
      windowWidth: width,
      windowHeight: 1123,
      width,
      y,
      height: Math.max(1, Math.ceil(height)),
      backgroundColor: "#ffffff",
      logging: false,
      useCORS: false,
      onclone: (doc: Document, cloned: HTMLElement) => {
        prepareClone(doc, cloned, width);
        if (measure) measured = measureClone(cloned);
      },
    });

  const pdf = deps.createPdf();
  pdf.setProperties({ title, subject: "Research-only unified health report", creator: "MITOCHONDRIA — local export" });
  const slice = deps.createCanvas();
  let pageCount = 0;
  const addBandPages = (band: CanvasLike, bandStart: number, pages: Array<[number, number]>) => {
    const ratio = band.width / width;
    for (const [top, bottom] of pages) {
      const sy = Math.round((top - bandStart) * ratio);
      const sh = Math.max(1, Math.min(band.height - sy, Math.round((bottom - top) * ratio)));
      slice.width = band.width;
      slice.height = sh;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D rendering is unavailable in this browser.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(band, 0, sy, band.width, sh, 0, 0, slice.width, sh);
      const data = slice.toDataURL("image/jpeg", 0.92);
      if (!data.startsWith("data:image/jpeg")) throw new Error("This browser could not encode a PDF page image.");
      if (pageCount) pdf.addPage("a4", "portrait");
      pdf.addImage(data, "JPEG", 12, 18, 186, (sh / ratio) * (186 / width));
      pageCount++;
    }
  };

  // First band also measures layout in the isolated clone.
  const first = await capture(0, maxBandHeight, true);
  try {
    const layout = measured as { height: number; blocks: PdfBlock[] } | null;
    if (!layout || !(layout.height > 0)) throw new Error("Report layout could not be measured in the capture clone.");
    if (!(first.width > 0 && first.height > 0)) throw new Error("The browser returned an empty page capture (canvas limit or memory).");
    const cuts = reportPageCuts(layout.height, pageHeight, layout.blocks);
    if (cuts.length - 1 > maxPages) throw new Error(`Report has ${cuts.length - 1} pages (limit ${maxPages}). Narrow the date range or sources, or use Print.`);
    const bands = planRenderBands(cuts, maxBandHeight);
    const pagesOf = (b: { pages: number[] }) => b.pages.map((i) => [cuts[i]!, cuts[i + 1]!] as [number, number]);
    // Pages fully inside the measuring capture are taken from it.
    const firstCovered = bands.filter((b) => b.end <= maxBandHeight + 0.5);
    addBandPages(first, 0, firstCovered.flatMap(pagesOf));
    for (const band of bands.slice(firstCovered.length)) {
      const canvas = await capture(band.start, band.end - band.start, false);
      try {
        if (!(canvas.width > 0 && canvas.height > 0)) throw new Error("The browser returned an empty page capture (canvas limit or memory).");
        addBandPages(canvas, band.start, pagesOf(band));
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } finally {
    first.width = 0;
    first.height = 0;
    slice.width = 0;
    slice.height = 0;
  }
  if (!pageCount) throw new Error("No PDF pages were produced.");
  const blob = pdf.output("blob");
  if (!(blob.size > 0)) throw new Error("The PDF file is empty.");
  return blob;
}

/** Actionable failure text: states the real cause and that no file was created. Print stays a separate action. */
export function pdfExportErrorMessage(error: unknown): string {
  const raw = error instanceof Error && error.message.trim() ? error.message.trim() : "PDF renderer unavailable";
  const cause = raw.replace(/[.\s]+$/, "");
  return `Direct PDF export failed: ${cause}. No PDF was downloaded. Use the separate Print button for browser Save as PDF.`;
}
