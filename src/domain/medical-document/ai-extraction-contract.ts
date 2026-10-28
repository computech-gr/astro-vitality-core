/** P36 shared AI extraction contract. This is an untrusted suggestion layer, never a persistence API. */
import type { MeasurementProfile } from "@/domain/health-measurements/profiles";

export type ExtractionProvenance = "synthetic" | "real" | "unclassified";
export type ExtractionSuggestion = {
  catalogId: string;
  reportedAnalyte: string;
  value: number;
  reportedUnit: string;
  observedAt: string | null;
  dateKind: "observation" | "collection" | "unknown";
  sourcePage: number;
  evidenceSnippet: string;
  uncertainty: string[];
};
export type ExtractionEnvelope = {
  schemaVersion: "p36.1";
  provider: string;
  model: string;
  suggestions: ExtractionSuggestion[];
  warnings: string[];
};
export type CheckedSuggestion = ExtractionSuggestion & { status: "review" | "held"; reasons: string[] };

/** Treat all provider output as untrusted, even if returned by an approved service. */
export function validateExtractionEnvelope(input: unknown, profile: MeasurementProfile, pageCount: number): { rows: CheckedSuggestion[]; errors: string[] } {
  if (!input || typeof input !== "object") return { rows: [], errors: ["AI response is not an object"] };
  const envelope = input as Record<string, unknown>;
  if (envelope.schemaVersion !== "p36.1" || !Array.isArray(envelope.suggestions) || envelope.suggestions.length > 150)
    return { rows: [], errors: ["Invalid extraction schema or row limit"] };
  const known = new Set(profile.variables.map(variable => variable.id));
  const rows: CheckedSuggestion[] = [];
  const errors: string[] = [];
  for (const [index, raw] of envelope.suggestions.entries()) {
    if (!raw || typeof raw !== "object") { errors.push(`Row ${index + 1}: invalid object`); continue; }
    const row = raw as Record<string, unknown>;
    if (typeof row.catalogId !== "string" || typeof row.reportedAnalyte !== "string" ||
        typeof row.value !== "number" || !Number.isFinite(row.value) ||
        typeof row.reportedUnit !== "string" || typeof row.evidenceSnippet !== "string" ||
        typeof row.sourcePage !== "number" || !Number.isInteger(row.sourcePage) ||
        row.sourcePage < 1 || row.sourcePage > pageCount ||
        row.evidenceSnippet.length < 3 || row.evidenceSnippet.length > 700 ||
        !Array.isArray(row.uncertainty) || row.uncertainty.some(v => typeof v !== "string") ||
        (row.observedAt !== null && typeof row.observedAt !== "string") ||
        !["observation", "collection", "unknown"].includes(String(row.dateKind))) {
      errors.push(`Row ${index + 1}: invalid fields`); continue;
    }
    const reasons: string[] = [];
    if (!known.has(row.catalogId)) reasons.push("Catalog ID is not in selected domain");
    if (!row.reportedUnit.trim()) reasons.push("Reported unit missing");
    const expectedUnit = profile.catalogUnit?.(row.catalogId);
    if (expectedUnit && expectedUnit !== row.reportedUnit.trim()) reasons.push(`Catalog unit mismatch: expected ${expectedUnit}`);
    if (row.observedAt && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(row.observedAt) || !Number.isFinite(Date.parse(row.observedAt))))
      reasons.push("Invalid UTC observation timestamp");
    if (row.dateKind !== "observation" || !row.observedAt) reasons.push("Observation date requires manual confirmation");
    if (row.uncertainty.length) reasons.push("AI uncertainty requires review");
    rows.push({ catalogId: row.catalogId, reportedAnalyte: row.reportedAnalyte, value: row.value,
      reportedUnit: row.reportedUnit, observedAt: row.observedAt, dateKind: row.dateKind as ExtractionSuggestion["dateKind"],
      sourcePage: row.sourcePage, evidenceSnippet: row.evidenceSnippet,
      uncertainty: row.uncertainty as string[], status: reasons.length ? "held" : "review", reasons });
  }
  return { rows, errors };
}
