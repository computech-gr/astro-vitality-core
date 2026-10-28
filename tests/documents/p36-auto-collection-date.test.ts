import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { explicitSharedCollectionTimestamp } from "@/domain/medical-document/hybrid-extraction";

describe("P36.2 shared collection timestamp", () => {
  it("reads the actual Challenge 02 PDF header as a single explicit UTC collection instant", async () => {
    const bytes = readFileSync("fixtures/synthetic/p36/P36_CHALLENGE_02_ORIGINAL.pdf");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
    const doc = await task.promise;
    try {
      const content = await (await doc.getPage(1)).getTextContent();
      const text = content.items.filter((item): item is typeof item & {str:string} => "str" in item).map(item => item.str).join(" ");
      expect(explicitSharedCollectionTimestamp(text)).toBe("2026-10-14T07:35:00Z");
    } finally { await task.destroy(); }
  });
  it("refuses missing, multiple or invalid collection dates", () => {
    expect(explicitSharedCollectionTimestamp("REPORT ISSUED 15 October 2026 COLLECTION TIME 07:35 UTC")).toBeNull();
    expect(explicitSharedCollectionTimestamp("COLLECTION DATE 31 February 2026 COLLECTION TIME 07:35 UTC")).toBeNull();
    expect(explicitSharedCollectionTimestamp("COLLECTION DATE 14 October 2026 COLLECTION TIME 07:35 UTC COLLECTION TIME 08:00 UTC")).toBeNull();
    expect(explicitSharedCollectionTimestamp("COLLECTION DATE 14 October 2026 COLLECTION TIME 07:35 UTC")).toBe("2026-10-14T07:35:00Z");
  });
});
