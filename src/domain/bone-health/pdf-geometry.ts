/** P33: PDF.js text-item geometry reconstruction.
 * Pure functions shared by the browser extractor and the Node/bun regression
 * tests. Items carry user-space coordinates (transform[4]/transform[5]) plus
 * width/height from PDF.js; rows and column gaps are rebuilt from geometry
 * instead of trusting concatenated strings, so wrapped cells, varying column
 * order and irregular spacing keep their structure. No network, no storage.
 */

export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
};

export type GeometryCell = { x: number; text: string };
export type GeometryLine = { page: number; y: number; cells: GeometryCell[] };

const ID_LIKE = /^[a-z]{1,6}-\d{1,4}\b/i;

type WorkingCell = { x: number; end: number; text: string };

function median(values: number[], fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? fallback;
}

/** Group text items into visual lines and split each line into gap-separated cells. */
export function reconstructGeometryLines(items: PdfTextItem[]): GeometryLine[] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!item.str.trim()) continue;
    const list = byPage.get(item.page) ?? [];
    list.push(item);
    byPage.set(item.page, list);
  }
  const lines: GeometryLine[] = [];
  for (const [page, pageItems] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
    const typicalHeight = median(pageItems.map((item) => item.height), 10);
    const lineTolerance = Math.max(2, typicalHeight * 0.6);
    const sorted = [...pageItems].sort((a, b) => b.y - a.y || a.x - b.x);
    const rawLines: Array<{ y: number; items: PdfTextItem[] }> = [];
    for (const item of sorted) {
      const last = rawLines[rawLines.length - 1];
      if (last && Math.abs(last.y - item.y) <= lineTolerance) last.items.push(item);
      else rawLines.push({ y: item.y, items: [item] });
    }
    const pageLines: Array<{ page: number; y: number; cells: WorkingCell[] }> = rawLines.map(({ y, items: lineItems }) => {
      const cells: WorkingCell[] = [];
      for (const item of [...lineItems].sort((a, b) => a.x - b.x)) {
        const cell = cells[cells.length - 1];
        const width = item.width > 0 ? item.width : item.str.length * typicalHeight * 0.5;
        if (!cell) {
          cells.push({ x: item.x, end: item.x + width, text: item.str.trim() });
          continue;
        }
        const gap = item.x - cell.end;
        const cellGap = Math.max(6, typicalHeight * 1.1);
        if (gap > cellGap) {
          cells.push({ x: item.x, end: item.x + width, text: item.str.trim() });
        } else {
          cell.text += (gap > typicalHeight * 0.2 && !cell.text.endsWith(" ") ? " " : "") + item.str.trim();
          cell.end = Math.max(cell.end, item.x + width);
        }
      }
      return { page, y, cells };
    });
    // Wrapped-cell merge: a single-cell continuation line with no digits and no
    // catalog ID, directly below a row, belongs to the cell above it (e.g. a
    // multi-line analyte name). Never merge numbers, IDs or new columns.
    const merged: Array<{ page: number; y: number; cells: WorkingCell[] }> = [];
    for (const line of pageLines) {
      const previous = merged[merged.length - 1];
      const only = line.cells.length === 1 ? line.cells[0] : undefined;
      const isContinuation =
        previous !== undefined &&
        only !== undefined &&
        !/\d/.test(only.text) &&
        !ID_LIKE.test(only.text) &&
        previous.y - line.y > 0 &&
        previous.y - line.y <= typicalHeight * 2.6;
      if (isContinuation && only) {
        const target =
          previous.cells.find((cell) => only.x >= cell.x - typicalHeight && only.x <= cell.end + typicalHeight) ??
          [...previous.cells].sort((a, b) => Math.abs(a.x - only.x) - Math.abs(b.x - only.x))[0];
        if (target) {
          target.text = `${target.text} ${only.text}`;
          target.end = Math.max(target.end, only.end);
          continue;
        }
      }
      merged.push(line);
    }
    for (const line of merged) {
      lines.push({ page: line.page, y: line.y, cells: line.cells.map(({ x, text }) => ({ x, text })) });
    }
  }
  return lines;
}

/** Serialize reconstructed lines for the text parsers: cells separated by pipes. */
export function geometryLinesToText(lines: GeometryLine[]): string {
  return lines.map((line) => line.cells.map((cell) => cell.text).join(" | ")).join("\n");
}
