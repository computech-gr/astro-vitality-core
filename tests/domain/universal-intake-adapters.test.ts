import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
  MITOCHONDRIA_CATALOG_SYSTEM,
  batchDuplicateKeys,
  detectIntakeFormat,
  explicitTimestamp,
  extractFhirCandidates,
  extractJsonCandidates,
  extractXlsxCandidates,
} from "../../src/domain/health-intelligence/universal-intake-adapters";
import { extractCsvCandidates } from "../../src/domain/health-intelligence/universal-intake-parser";
import { classifyIntakeObservation } from "../../src/domain/health-domains/unified-intake-classification";

function workbook(rows: Array<Array<string | number>>, { shared = true } = {}): Uint8Array {
  const strings: string[] = [];
  const cellXml = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
          if (typeof value === "number") return `<c r="${ref}"><v>${value}</v></c>`;
          if (!shared) return `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
          strings.push(value);
          return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return zipSync({
    "xl/workbook.xml": strToU8(
      '<workbook xmlns:r="r"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    "xl/sharedStrings.xml": strToU8(
      `<sst>${strings.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${cellXml}</sheetData></worksheet>`),
  });
}

describe("format detection", () => {
  test("supported and explicitly unsupported formats", () => {
    expect(detectIntakeFormat("a.CSV")).toBe("csv");
    expect(detectIntakeFormat("a.xlsx")).toBe("xlsx");
    expect(detectIntakeFormat("bundle.json")).toBe("json");
    expect(detectIntakeFormat("scan.jpeg")).toBe("document");
    for (const name of ["old.xls", "msg.hl7", "report.docx", "data.xml"])
      expect(detectIntakeFormat(name)).toBe("unsupported");
  });
});

describe("timestamps are never invented", () => {
  test("only full zoned timestamps are accepted", () => {
    expect(explicitTimestamp("2026-10-20T08:00:00Z")).toBe("2026-10-20T08:00:00Z");
    expect(explicitTimestamp("2026-10-20T08:00:00+03:00")).toBe("2026-10-20T08:00:00+03:00");
    for (const bad of [
      "2026-10-20",
      "2026-10-20T08:00:00",
      "20/10/2026 08:00",
      "2026-13-40T99:00:00Z",
      46000,
    ])
      expect(explicitTimestamp(bad)).toBeNull();
  });
});

describe("XLSX adapter", () => {
  test("shared-string sheet produces the same candidates as CSV", () => {
    const rows = [
      ["variable", "value", "unit", "observed_at"],
      ["cv-001", 62, "bpm", "2026-10-02T08:00:00Z"],
      ["cv-027", 48, "ms", "2026-10-02T08:00:00Z"],
    ];
    const xlsx = extractXlsxCandidates(workbook(rows));
    const csv = extractCsvCandidates(rows.map((r) => r.join(",")).join("\n"));
    expect(xlsx.rows.map(({ excerpt: _e, ...rest }) => rest)).toEqual(
      csv.rows.map(({ excerpt: _e, ...rest }) => rest),
    );
    expect(xlsx.rows.map((r) => classifyIntakeObservation(r).status)).toEqual([
      "matched",
      "matched",
    ]);
  });
  test("inline strings with commas and entities survive", () => {
    const r = extractXlsxCandidates(
      workbook(
        [
          ["label", "value", "unit", "observed_at"],
          ["Heart rate", 64, "bpm", "2026-10-20T08:00:00Z"],
        ],
        {
          shared: false,
        },
      ),
    );
    expect(r.rows[0]?.label).toBe("Heart rate");
  });
  test("Excel date serials are skipped, never converted", () => {
    const r = extractXlsxCandidates(
      workbook([
        ["variable", "value", "unit", "observed_at"],
        ["cv-001", 62, "bpm", 46297.33],
      ]),
    );
    expect(r.rows).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });
  test("non-workbook bytes are rejected", () => {
    expect(() => extractXlsxCandidates(strToU8("not a zip"))).toThrow("Not a readable .xlsx");
  });
});

describe("JSON adapter", () => {
  test("array and observations wrapper", () => {
    const a = extractJsonCandidates(
      '[{"variable":"cv-001","value":62,"unit":"bpm","observed_at":"2026-10-02T08:00:00Z"}]',
    );
    const b = extractJsonCandidates(
      '{"observations":[{"label":"Heart rate","value":"64","unit":"bpm"}]}',
    );
    expect(a.rows[0]).toMatchObject({
      label: "cv-001",
      value: "62",
      unit: "bpm",
      observedAt: "2026-10-02T08:00:00Z",
    });
    expect(b.rows[0]?.observedAt).toBe("");
  });
  test("malformed input and invalid rows", () => {
    expect(() => extractJsonCandidates("{oops")).toThrow("Invalid JSON");
    expect(extractJsonCandidates('{"a":1}').rows).toHaveLength(0);
    const r = extractJsonCandidates(
      '[{"label":"HR","value":"high","unit":"bpm"},{"label":"HR","value":60},{"label":"HR","value":60,"unit":"bpm","observed_at":"yesterday"}]',
    );
    expect(r.rows).toHaveLength(0);
    expect(r.skipped).toBe(3);
  });
});

describe("FHIR R4 Observation adapter", () => {
  const observation = (overrides: Record<string, unknown> = {}) => ({
    resourceType: "Observation",
    id: "obs-1",
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }] },
    valueQuantity: { value: 62, unit: "bpm", code: "/min" },
    effectiveDateTime: "2026-10-02T08:00:00Z",
    issued: "2026-10-03T12:00:00Z",
    ...overrides,
  });
  test("LOINC display maps only through the reviewed alias; time is effectiveDateTime, never issued", () => {
    const r = extractFhirCandidates(observation());
    expect(r.rows[0]).toMatchObject({
      label: "Heart rate",
      value: "62",
      unit: "bpm",
      observedAt: "2026-10-02T08:00:00Z",
    });
    expect(r.rows[0]?.excerpt).toContain("http://loinc.org|8867-4");
    expect(classifyIntakeObservation(r.rows[0]!).status).toBe("matched");
  });
  test("Mitochondria catalog coding is used verbatim", () => {
    const r = extractFhirCandidates(
      observation({
        code: { coding: [{ system: MITOCHONDRIA_CATALOG_SYSTEM, code: "cv-027" }] },
        valueQuantity: { value: 48, unit: "ms" },
      }),
    );
    expect(classifyIntakeObservation(r.rows[0]!)).toMatchObject({
      status: "matched",
      metricId: "cv-027",
    });
  });
  test("unmapped LOINC code stays review-only", () => {
    const r = extractFhirCandidates(
      observation({
        code: { coding: [{ system: "http://loinc.org", code: "6690-2" }] },
        valueQuantity: { value: 6.1, unit: "10*9/L" },
      }),
    );
    expect(classifyIntakeObservation(r.rows[0]!).status).not.toBe("matched");
  });
  test("missing effective time is kept empty, issued is not promoted", () => {
    const { effectiveDateTime: _drop, ...noTime } = observation();
    expect(extractFhirCandidates(noTime).rows[0]?.observedAt).toBe("");
  });
  test("bundle skips unusable entries with reasons", () => {
    const r = extractFhirCandidates({
      resourceType: "Bundle",
      entry: [
        { resource: observation() },
        { resource: observation({ status: "entered-in-error" }) },
        { resource: observation({ valueQuantity: { value: "62", unit: "bpm" } }) },
        { resource: observation({ valueQuantity: { value: 62 } }) },
        { resource: observation({ effectiveDateTime: "2026-10-02" }) },
        { resource: observation({ dataAbsentReason: { text: "error" } }) },
        { resource: { resourceType: "Patient" } },
      ],
    });
    expect(r.rows).toHaveLength(1);
    expect(r.skipped).toBe(6);
    expect(r.notes).toHaveLength(6);
  });
  test("JSON adapter routes FHIR resources", () => {
    expect(extractJsonCandidates(JSON.stringify(observation())).rows[0]?.excerpt).toStartWith(
      "FHIR Observation",
    );
  });
});

describe("duplicate records", () => {
  test("same metric, instant and value repeated in a batch is flagged once per repeat", () => {
    const keys = batchDuplicateKeys([
      { key: "a", metricId: "cv-001", observedAt: "2026-10-02T08:00:00Z", value: "62" },
      { key: "b", metricId: "cv-001", observedAt: "2026-10-02T11:00:00+03:00", value: "62 " },
      { key: "c", metricId: "cv-001", observedAt: "2026-10-02T08:00:00Z", value: "63" },
      { key: "d", metricId: "", observedAt: "2026-10-02T08:00:00Z", value: "62" },
    ]);
    expect(keys).toEqual(["b"]);
  });
});

describe("unit gate stays strict across adapters", () => {
  test("wrong or differently written units require review", () => {
    const r = extractJsonCandidates(
      '[{"variable":"cv-001","value":62,"unit":"/min","observed_at":"2026-10-02T08:00:00Z"},{"variable":"cv-001","value":62,"unit":"BPM","observed_at":"2026-10-02T08:00:00Z"}]',
    );
    expect(r.rows.map((row) => classifyIntakeObservation(row).status)).toEqual([
      "unit_review_required",
      "unit_review_required",
    ]);
  });
});
