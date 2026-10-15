import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { suggestBoneDocumentMatches } from "@/domain/bone-health/document-extraction";

// P36.6.1: pdfjs-dist v6 regression on a SYNTHETIC report (no real person, no health record).
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

async function extractText(path: string): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(readFileSync(path)),
    isEvalSupported: false,
    useWorkerFetch: false,
  });
  const doc = await task.promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      parts.push(
        content.items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join(""),
      );
    }
    return { text: parts.join("\n"), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

describe("P36.6.1 pdfjs-dist v6 security upgrade", () => {
  it("uses a patched pdfjs-dist (>= 6.2.108) and keeps eval disabled with a same-origin worker", () => {
    const [major, minor] = String(pkg.dependencies["pdfjs-dist"]).replace(/^\^/, "").split(".").map(Number);
    expect(major).toBe(6);
    expect(minor).toBeGreaterThanOrEqual(2);
    const src = readFileSync("src/domain/bone-health/document-extraction.ts", "utf8");
    expect(src).toContain("isEvalSupported: false");
    expect(src).toContain('pdfjs-dist/build/pdf.worker.min.mjs?url');
    expect(src).toContain("loadingTask.destroy()");
    expect(src).not.toContain("document.destroy()");
  });

  it("extracts selectable text and yields only exact catalog matches", async () => {
    const { text, pages } = await extractText("tests/fixtures/p3661-synthetic-lab-report.pdf");
    expect(pages).toBe(1);
    expect(text).toContain("SYNTHETIC TEST REPORT");
    const matches = suggestBoneDocumentMatches(text, "synthetic.pdf");
    expect(matches.map((m) => [m.variableId, m.value, m.unit])).toEqual([
      ["bone-002", 42.5, "nmol"],
      ["bone-003", 3.1, "nmol"],
    ]);
    expect(matches.every((m) => m.reviewRequired && !m.selected)).toBe(true);
  });
});
