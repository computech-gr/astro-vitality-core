import type { LabImportResult, LabResultInput } from "./contracts";

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  row.push(field.trim());
  if (row.some((value) => value.length)) rows.push(row);
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  return rows;
}

const requiredHeaders = ["metric_code", "value", "unit", "observed_at"] as const;

export function parseLabCsv(text: string, sourceSystem: string): LabImportResult<LabResultInput[]> {
  let rows: string[][];
  try {
    rows = parseCsvRows(text);
  } catch (error) {
    return {
      ok: false,
      issues: [{ path: "csv", message: error instanceof Error ? error.message : "Invalid CSV" }],
    };
  }
  if (rows.length < 2)
    return {
      ok: false,
      issues: [{ path: "csv", message: "CSV must contain a header and at least one data row" }],
    };
  const headers = rows[0]!.map((value) => value.toLowerCase());
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length)
    return {
      ok: false,
      issues: [{ path: "csv.header", message: `Missing required headers: ${missing.join(", ")}` }],
    };
  const at = (row: string[], name: string) => row[headers.indexOf(name)] ?? "";
  const results: LabResultInput[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index]!;
    const numeric = Number(at(row, "value"));
    if (!Number.isFinite(numeric))
      return {
        ok: false,
        issues: [{ path: `csv.row.${index + 1}.value`, message: "Value must be numeric" }],
      };
    results.push({
      resultId: at(row, "result_id") || `row-${index}`,
      metricCode: at(row, "metric_code"),
      value: numeric,
      unit: at(row, "unit"),
      observedAt: at(row, "observed_at"),
      sourceSystem,
      importFormat: "csv",
      ...(at(row, "assay_method") ? { assayMethod: at(row, "assay_method") } : {}),
      ...(at(row, "specimen_id") || at(row, "specimen_type") || at(row, "collected_at")
        ? {
            specimen: {
              ...(at(row, "specimen_id") ? { specimenId: at(row, "specimen_id") } : {}),
              ...(at(row, "specimen_type") ? { specimenType: at(row, "specimen_type") } : {}),
              ...(at(row, "collected_at") ? { collectedAt: at(row, "collected_at") } : {}),
            },
          }
        : {}),
    });
  }
  return { ok: true, value: results };
}
