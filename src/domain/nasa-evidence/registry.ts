import index from "../../../data/scientific/p30-nasa-evidence-index.v1.json";

export type NasaEvidenceSource = (typeof index.sources)[number];
export type EvidenceReadiness = "metadata_only" | "screened_not_appraised" | "independently_reviewed";

/** A public reference index; never mission data, a clinical rule, or a live NASA API. */
export const NASA_EVIDENCE_INDEX = index;
export function evidenceReadiness(source: NasaEvidenceSource): EvidenceReadiness {
  if (source.independentlyReviewed && source.reviewedFullText) return "independently_reviewed";
  if (source.verifiedAt) return "screened_not_appraised";
  return "metadata_only";
}
export function validateEvidenceIndex(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const source of index.sources) {
    if (!source.id || ids.has(source.id)) errors.push(`Duplicate or missing source id: ${source.id}`);
    ids.add(source.id);
    if (!source.url.startsWith("https://www.nasa.gov/") && !source.url.startsWith("https://nasa.gov/") && !source.url.startsWith("https://ntrs.nasa.gov/") && !source.url.startsWith("https://standards.nasa.gov/")) errors.push(`Unexpected source host: ${source.id}`);
    if (source.independentlyReviewed && !source.reviewedFullText) errors.push(`Review state inconsistent: ${source.id}`);
    if (!source.sourceFile) errors.push(`Missing repository provenance: ${source.id}`);
  }
  if (index.operationalActivation || index.liveNasaData) errors.push("Reference-only index must remain inactive");
  return errors;
}
export function evidenceSummary() {
  return {total: index.sources.length, reviewed: index.sources.filter(s => evidenceReadiness(s) === "independently_reviewed").length, screened: index.sources.filter(s => evidenceReadiness(s) === "screened_not_appraised").length};
}
