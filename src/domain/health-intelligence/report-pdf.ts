/** Local browser rendering only. No report payload leaves the browser. */
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

export function reportPageCuts(height: number, pageHeight: number, blocks: Array<{ top: number; bottom: number }>): number[] {
  const cuts = [0];
  while (cuts[cuts.length - 1] < height) {
    const start = cuts[cuts.length - 1];
    let end = Math.min(height, start + pageHeight);
    const crossing = blocks.filter(b => b.top >= start && b.top < end && b.bottom > end);
    if (crossing.length) end = Math.min(...crossing.map(b => b.top));
    if (end <= start) throw new Error("A report item exceeds one A4 page.");
    cuts.push(end);
  }
  return cuts;
}

export async function createReportPdf(element: HTMLElement, title: string): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas-pro"), import("jspdf"),
  ]);
  await document.fonts.ready;
  // A4 printable area: 210−24 mm wide, 297−34 mm high; matches existing @page.
  const width = 703;
  const pageHeight = width * 263 / 186;
  let blocks: Array<{ top: number; bottom: number }> = [];
  const canvas = await html2canvas(element, {
    scale: 1.5, windowWidth: width, windowHeight: 1123,
    backgroundColor: null, logging: false, useCORS: false,
    onclone: (doc, cloned) => {
      // Apply the exact existing print rules to the isolated capture, not the live UI.
      for (const sheet of [...doc.styleSheets]) {
        let rules: CSSRule[];
        try { rules = [...sheet.cssRules]; } catch { continue; }
        const style = doc.createElement("style");
        style.textContent = rules.map(r => r.cssText
          .replace(/@media print\b/g, "@media all")
          .replace(/@media screen\b/g, "@media not all")).join("\n");
        sheet.disabled = true;
        doc.head.appendChild(style);
      }
      doc.documentElement.style.width = `${width}px`;
      doc.body.style.width = `${width}px`;
      const root = doc.createElement("main");
      root.className = "report-root";
      root.appendChild(cloned);
      doc.body.replaceChildren(root);
      const base = cloned.getBoundingClientRect().top;
      blocks = [...cloned.querySelectorAll("tr, .report-avoid-break, .report-cover, h3")]
        .filter(e => e.getBoundingClientRect().height > 0)
        .map(e => { const r = e.getBoundingClientRect(); return { top: r.top - base, bottom: r.bottom - base }; });
      if (cloned.scrollHeight > 40_000) throw new Error("Report too large for local PDF capture; use Print.");
    },
  });
  try {
    const ratio = canvas.width / width;
    const cuts = reportPageCuts(canvas.height / ratio, pageHeight, blocks);
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    pdf.setProperties({ title, subject: "Research-only unified health report", creator: "MITOCHONDRIA — local export" });
    for (let i = 0; i < cuts.length - 1; i++) {
      if (i) pdf.addPage("a4", "portrait");
      const start = Math.round(cuts[i] * ratio);
      const end = Math.round(cuts[i + 1] * ratio);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = end - start;
      const ctx = slice.getContext("2d");
      if (!ctx) throw new Error("PDF rendering is unavailable.");
      ctx.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, slice.width, slice.height);
      pdf.addImage(slice.toDataURL("image/png"), "PNG", 12, 18, 186, slice.height / ratio * 186 / width);
      slice.width = 0; slice.height = 0;
    }
    return pdf.output("blob");
  } finally { canvas.width = 0; canvas.height = 0; }
}