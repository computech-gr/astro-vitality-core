import { describe, expect, it } from "bun:test";
import { geometryLinesToText, reconstructGeometryLines } from "@/domain/bone-health/pdf-geometry";
import { extractFiveColumnLabCandidates } from "@/domain/health-intelligence/universal-intake-parser";
import { classifyIntakeObservation } from "@/domain/health-domains/unified-intake-classification";

describe("P36.7 geometry/source fidelity", () => {
  it("reads the five existing geometry columns without changing the shared serializer", () => {
    const columns = ["Heart rate", "81", "bpm", "2026-11-05", "Review input"];
    const geometry = reconstructGeometryLines(columns.map((str, index) => ({
      str, x: 10 + index * 150, y: 100, width: str.length * 4,
      height: 10, page: 1,
    })));
    expect(geometry[0]?.cells.map(cell => cell.text)).toEqual(columns);
    const text = geometryLinesToText(geometry);
    expect(extractFiveColumnLabCandidates(text)).toEqual([{
      label: "Heart rate", value: "81", unit: "bpm", observedAt: "", datePrecision: "date", collectionDate: "2026-11-05", excerpt: text,
    }]);
  });
  it("preserves decimal commas, Unicode ambiguity and original evidence", () => {
    const text = "25(OH) Vitamin D | 9,31 | ng/mL ή nmol/L | 2026-11-05 | Unvalidated";
    expect(extractFiveColumnLabCandidates(text)[0]).toEqual({
      label: "25(OH) Vitamin D", value: "9,31", unit: "ng/mL ή nmol/L",
      observedAt: "", datePrecision: "date", collectionDate: "2026-11-05", excerpt: text,
    });
  });
  it("does not scientifically equate or convert a mismatched unit", () => {
    const row = extractFiveColumnLabCandidates("Heart rate | 81 | bps | 2026-11-05 | Review input")[0];
    expect(row).toBeDefined();
    expect(classifyIntakeObservation({label: row?.label ?? "", unit: row?.unit ?? ""}).status).toBe("unit_review_required");
  });
  it("rejects unsupported prose, ranges and non-numeric results", () => {
    expect(extractFiveColumnLabCandidates([
      "Heart rate 81 bpm 2026-11-05 Review input",
      "Heart rate | <81 | bpm | 2026-11-05 | Review input",
      "Heart rate | 80-90 | bpm | 2026-11-05 | Review input",
      "PTH | — | pg/mL | 2026-11-05 | Unvalidated",
    ].join("\n"))).toEqual([]);
  });
  it("honors the bounded candidate limit", () => {
    const text = Array(201).fill("Heart rate | 81 | bpm | 2026-11-05 | Review input").join("\n");
    expect(extractFiveColumnLabCandidates(text)).toHaveLength(200);
  });
});