/**
 * Local, deterministic intake adapters for structured files (XLSX, JSON and
 * FHIR R4 Observation/Bundle). Adapters only produce review candidates: they
 * never classify, convert units, infer or default dates, call AI or upload
 * anything. Every candidate still goes through strict P36 catalog matching
 * and per-row human confirmation in the Unified Intake workspace.
 */
import { unzipSync } from "fflate";
import { extractCsvCandidates, type Candidate } from "./universal-intake-parser";

export type IntakeFileFormat = "csv" | "xlsx" | "json" | "document" | "unsupported";

export const SUPPORTED_INTAKE_EXTENSIONS = [
  ".csv",
  ".xlsx",
  ".json",
  ".txt",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
] as const;

/** Format is chosen by extension only; content must then pass the adapter's own validation. */
export function detectIntakeFormat(fileName: string): IntakeFileFormat {
  const name = fileName.toLowerCase();
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".json")) return "json";
  if (/\.(txt|pdf|png|jpe?g)$/.test(name)) return "document";
  return "unsupported";
}

export type AdapterResult = { rows: Candidate[]; skipped: number; notes: string[] };

const NUMERIC = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const ISO_WITH_ZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Only full timestamps with an explicit time zone are accepted; never a date-only value. */
export function explicitTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ISO_WITH_ZONE.test(trimmed) || Number.isNaN(Date.parse(trimmed))) return null;
  return trimmed;
}

function numericText(value: unknown): string | null {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string" && NUMERIC.test(value.trim())) return value.trim();
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------- FHIR R4

type FhirCoding = { system?: unknown; code?: unknown; display?: unknown };
type FhirObservation = {
  resourceType?: unknown;
  id?: unknown;
  status?: unknown;
  code?: { text?: unknown; coding?: unknown };
  valueQuantity?: { value?: unknown; unit?: unknown; code?: unknown };
  effectiveDateTime?: unknown;
  effectiveInstant?: unknown;
  dataAbsentReason?: unknown;
  component?: unknown;
};

/** Coding system that carries Mitochondria canonical catalog IDs verbatim. */
export const MITOCHONDRIA_CATALOG_SYSTEM = "urn:mitochondria:catalog";
const EXCLUDED_STATUSES = new Set(["entered-in-error", "cancelled", "registered"]);

function fhirLabel(observation: FhirObservation): { label: string; trace: string } {
  const codings = Array.isArray(observation.code?.coding)
    ? (observation.code!.coding as FhirCoding[])
    : [];
  const trace = codings
    .map((coding) => [text(coding.system), text(coding.code)].filter(Boolean).join("|"))
    .filter(Boolean)
    .join(";");
  const canonical = codings.find(
    (coding) => text(coding.system) === MITOCHONDRIA_CATALOG_SYSTEM && text(coding.code),
  );
  if (canonical) return { label: text(canonical.code), trace };
  const label =
    text(observation.code?.text) ||
    codings.map((coding) => text(coding.display)).find(Boolean) ||
    codings.map((coding) => text(coding.code)).find(Boolean) ||
    "";
  return { label, trace };
}

/**
 * FHIR R4 Observation or Bundle of Observations. Requires numeric valueQuantity,
 * a unit and effectiveDateTime/effectiveInstant with explicit zone. `issued`
 * (report time) is never used as observation time; components, ranges,
 * interpretations and non-Observation resources are not extracted.
 */
export function extractFhirCandidates(input: unknown, max = 200): AdapterResult {
  const notes: string[] = [];
  const resource = input as { resourceType?: unknown; entry?: unknown };
  let observations: FhirObservation[];
  if (resource?.resourceType === "Observation") observations = [resource as FhirObservation];
  else if (resource?.resourceType === "Bundle" && Array.isArray(resource.entry))
    observations = (resource.entry as Array<{ resource?: FhirObservation }>).map(
      (entry) => entry?.resource ?? {},
    );
  else return { rows: [], skipped: 0, notes: ["Not a FHIR Observation or Bundle resource."] };

  const rows: Candidate[] = [];
  let skipped = 0;
  observations.forEach((observation, index) => {
    const skip = (reason: string) => {
      skipped += 1;
      notes.push(`Entry ${index + 1}: ${reason}`);
    };
    if (observation?.resourceType !== "Observation") return skip("not an Observation resource.");
    if (EXCLUDED_STATUSES.has(text(observation.status)))
      return skip(`status "${text(observation.status)}" is not a usable result.`);
    if (observation.dataAbsentReason) return skip("dataAbsentReason present; no value.");
    if (Array.isArray(observation.component) && observation.component.length && !observation.valueQuantity)
      return skip("component-only Observation is not supported.");
    const value = numericText(observation.valueQuantity?.value);
    if (value === null || typeof observation.valueQuantity?.value !== "number")
      return skip("numeric valueQuantity.value is required.");
    const unit = text(observation.valueQuantity?.unit) || text(observation.valueQuantity?.code);
    if (!unit) return skip("valueQuantity unit is required.");
    const rawTime = observation.effectiveDateTime ?? observation.effectiveInstant;
    const observedAt = rawTime === undefined ? "" : explicitTimestamp(rawTime);
    if (observedAt === null)
      return skip("effectiveDateTime must be a full timestamp with time zone.");
    const { label, trace } = fhirLabel(observation);
    if (!label) return skip("Observation code has no usable text, display or code.");
    if (rows.length >= max) return skip("row limit reached.");
    const id = text(observation.id);
    rows.push({
      label,
      value,
      unit,
      observedAt,
      excerpt: `FHIR Observation${id ? ` ${id}` : ""}${trace ? ` [${trace}]` : ""}: ${value} ${unit}${observedAt ? ` @ ${observedAt}` : ""}`.slice(0, 350),
    });
  });
  return { rows, skipped, notes };
}

// ---------------------------------------------------------------- Plain JSON

const LABEL_KEYS = ["label", "variable", "metric", "metric_id", "metricId", "name"] as const;

/**
 * Plain JSON: an array of measurement objects, or { observations: [...] }.
 * Each needs a label/variable, numeric value and unit; observed_at is optional
 * but, when present, must be a full timestamp with zone. FHIR resources are
 * routed to the FHIR adapter.
 */
export function extractJsonCandidates(textValue: string, max = 200): AdapterResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textValue);
  } catch {
    throw new Error("Invalid JSON file.");
  }
  if (parsed && typeof parsed === "object" && "resourceType" in (parsed as object))
    return extractFhirCandidates(parsed, max);
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { observations?: unknown })?.observations)
      ? ((parsed as { observations: unknown[] }).observations)
      : null;
  if (!list) return { rows: [], skipped: 0, notes: ["JSON must be an array or { observations: [...] }."] };
  const rows: Candidate[] = [];
  const notes: string[] = [];
  let skipped = 0;
  list.forEach((item, index) => {
    const record = (item ?? {}) as Record<string, unknown>;
    const label = LABEL_KEYS.map((key) => text(record[key])).find(Boolean) ?? "";
    const value = numericText(record.value);
    const unit = text(record.unit);
    const rawTime = record.observed_at ?? record.observedAt;
    const observedAt = rawTime === undefined || rawTime === "" ? "" : explicitTimestamp(rawTime);
    if (!label || value === null || !unit || observedAt === null || rows.length >= max) {
      skipped += 1;
      notes.push(`Item ${index + 1}: needs label, numeric value, unit and a valid zoned timestamp.`);
      return;
    }
    rows.push({ label, value, unit, observedAt, excerpt: JSON.stringify(record).slice(0, 350) });
  });
  return { rows, skipped, notes };
}

// ---------------------------------------------------------------- XLSX

const MAX_XLSX_PART_BYTES = 20 * 1024 * 1024;

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : "";
  });
}

function runText(xml: string): string {
  return Array.from(xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g), (m) => decodeXml(m[1]!)).join("");
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "";
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function firstSheetPath(files: Record<string, Uint8Array>): string | null {
  const decoder = new TextDecoder();
  const workbook = files["xl/workbook.xml"];
  const rels = files["xl/_rels/workbook.xml.rels"];
  if (workbook && rels) {
    const relId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(decoder.decode(workbook))?.[1];
    if (relId) {
      const relationship = Array.from(
        decoder.decode(rels).matchAll(/<Relationship\b[^>]*>/g),
        (m) => m[0],
      ).find((tag) => tag.includes(`Id="${relId}"`));
      const target = relationship && /Target="([^"]+)"/.exec(relationship)?.[1];
      if (target) {
        const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
        if (files[path]) return path;
      }
    }
  }
  return files["xl/worksheets/sheet1.xml"] ? "xl/worksheets/sheet1.xml" : null;
}

/** Reads the first worksheet's cell text exactly as stored (no number formatting). */
export function xlsxCells(bytes: Uint8Array): string[][] {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        if (file.originalSize > MAX_XLSX_PART_BYTES)
          throw new Error("Workbook part exceeds the 20 MB safety limit.");
        return file.name.startsWith("xl/") && /\.(xml|rels)$/.test(file.name);
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("safety limit")) throw error;
    throw new Error("Not a readable .xlsx workbook.");
  }
  const sheetPath = firstSheetPath(files);
  if (!sheetPath) throw new Error("Workbook has no worksheet.");
  const decoder = new TextDecoder();
  const sharedXml = files["xl/sharedStrings.xml"] ? decoder.decode(files["xl/sharedStrings.xml"]) : "";
  const shared = Array.from(sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g), (m) => runText(m[1]!));
  const sheet = decoder.decode(files[sheetPath]!);
  const grid: string[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of rowMatch[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = raw !== undefined ? (shared[Number(raw)] ?? "") : "";
      else if (type === "inlineStr") value = runText(body);
      else if (raw !== undefined) value = decodeXml(raw);
      const index = ref ? columnIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value.trim();
    }
    grid.push(row);
  }
  return grid;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * First worksheet only, same header rules as CSV. Excel date serials and
 * locale-formatted dates are not converted: such rows are skipped so an
 * observation time is never guessed. Store timestamps as ISO text cells.
 */
export function extractXlsxCandidates(bytes: Uint8Array, max = 200): AdapterResult {
  const grid = xlsxCells(bytes).filter((row) => row.some(Boolean));
  const csv = grid.map((row) => row.map(csvField).join(",")).join("\n");
  const parsed = extractCsvCandidates(csv, max);
  return {
    rows: parsed.rows,
    skipped: parsed.skipped,
    notes: parsed.skipped
      ? ["Rows without a numeric value, unit or ISO text timestamp were skipped (date serials are not converted)."]
      : [],
  };
}
