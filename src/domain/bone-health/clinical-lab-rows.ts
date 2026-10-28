/** Bounded exact-alias clinical recognition. No inferred dates or unit conversion. */
import type { MeasurementProfile } from "@/domain/health-measurements/profiles";
import type { HeldRow } from "./universal-document-rows";

export type ClinicalLabRow = { variableId: string; value: number; unit: string; rawLine: string; page?: number };
const norm = (s: string) => s.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const ALIASES: Record<string, readonly string[]> = {
  "IMM-001": ["leukocytes (wbc)", "white blood cells", "wbc", "leukocytes"],
  "IMM-002": ["absolute neutrophils", "neutrophils absolute"],
  "IMM-003": ["absolute lymphocytes", "lymphocytes absolute"],
  "IMM-006": ["neutrophil / lymphocyte ratio", "neutrophil-to-lymphocyte ratio", "nlr"],
  "IMM-007": ["c-reactive protein (crp)", "c reactive protein", "crp"],
};
const numberPattern = /^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const unitPattern = /^(?=.*[\p{L}%µμ])[\p{L}\p{N}%µμ/^.*+-]+$/u;
const referenceTail = /^(?:[\d.,]+\s*[-–—]\s*[\d.,]+|[-–—]|(?:<|>|≤|≥)\s*[\d.,]+)\s*$/u;

export function recognizeClinicalLabRows(text: string, profile: MeasurementProfile, linePages?: number[]): { rows: ClinicalLabRow[]; held: HeldRow[]; touched: Set<string> } {
  const rows: ClinicalLabRow[] = [], held: HeldRow[] = [], touched = new Set<string>();
  if (profile.domainId !== "immune") return { rows, held, touched };
  const labels = profile.variables.flatMap(v => [v.name, ...(ALIASES[v.id.toUpperCase()] ?? [])]
    .map(label => ({ variableId: v.id, label: norm(label) })).filter(x => x.label.length >= 3));
  for (const [index, rawLine] of text.split(/\r?\n/).slice(0, 1000).entries()) {
    const cells = rawLine.split(/[|\t]/).map(c => c.trim());
    const tokens = rawLine.trim().split(/\s+/);
    const prefixes = cells.length > 1
      ? [{ name: cells[0] ?? "", remainder: cells.slice(1).join(" ") }]
      : Array.from({ length: Math.min(tokens.length, 16) }, (_, i) => ({ name: tokens.slice(0, i + 1).join(" "), remainder: tokens.slice(i + 1).join(" ") }));
    const candidates = prefixes.flatMap(prefix => labels.filter(l => l.label === norm(prefix.name)).map(l => ({ ...l, remainder: prefix.remainder })));
    if (!candidates.length) continue;
    touched.add(rawLine);
    const hold = (reason: string) => held.push({ line: index + 1, reason, snippet: rawLine, page: linePages?.[index] });
    if (new Set(candidates.map(c => c.variableId)).size !== 1) { hold("Ambiguous analyte alias; manual review required."); continue; }
    const chosen = candidates[0];
    if (!chosen) continue;
    const parts = chosen.remainder.trim().split(/\s+/);
    const valueText = parts[0] ?? "", unit = parts[1] ?? "", tail = parts.slice(2).join(" ");
    if (!numberPattern.test(valueText) || !Number.isFinite(Number(valueText.replace(",", ".")))) { hold("Single finite result required; ranges and comparisons are not measurements."); continue; }
    if (!unitPattern.test(unit)) { hold("Missing or invalid reported unit; reference ranges cannot supply units."); continue; }
    if (tail && !referenceTail.test(tail)) { hold("Ambiguous extra columns; manual review required."); continue; }
    const bound = profile.catalogUnit?.(chosen.variableId);
    if (bound && unit !== bound) { hold("Reported unit differs from catalog-defined unit; no conversion permitted."); continue; }
    rows.push({ variableId: chosen.variableId, value: Number(valueText.replace(",", ".")), unit, rawLine, page: linePages?.[index] });
  }
  return { rows, held, touched };
}

export function extractClinicalLabRows(text: string, profile: MeasurementProfile, linePages?: number[]): ClinicalLabRow[] {
  return recognizeClinicalLabRows(text, profile, linePages).rows;
}