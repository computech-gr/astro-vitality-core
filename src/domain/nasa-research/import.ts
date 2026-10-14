export const OSDR_BASE = "https://visualization.osdr.nasa.gov/biodata/api/v2";
export const ACCESSION = /^OSD-[1-9][0-9]{0,5}$/;
export type ResearchRecord = {accession: string; organism: string | null; assay: string | null; sample: string | null; source: "NASA_OSDR_BDAPI"; classification: "research_only"; raw: Record<string, unknown>};
export function normalizeAccession(value: string): string {
  const accession = value.trim().toUpperCase();
  if (!ACCESSION.test(accession)) throw new Error("Use a valid NASA OSDR accession, e.g. OSD-48");
  return accession;
}
export function researchEndpoint(accession: string, mode: "dataset" | "samples") {
  const id = normalizeAccession(accession);
  if (mode === "dataset") return `${OSDR_BASE}/dataset/${id}/`;
  const params = new URLSearchParams({"id.accession": id, "study.characteristics.organism": "", "format": "json.records"});
  return `${OSDR_BASE}/query/metadata/?${params.toString()}`;
}
function stringOrNull(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.slice(0, 300) : null; }
export function parseResearchSamples(payload: unknown, accession: string): ResearchRecord[] {
  const id = normalizeAccession(accession);
  const data = Array.isArray(payload) ? payload : (payload && typeof payload === "object" && Array.isArray((payload as {data?:unknown}).data) ? (payload as {data:unknown[]}).data : null);
  if (!data) throw new Error("Unexpected NASA sample response; import stopped");
  if (data.length > 500) throw new Error("Dataset exceeds safe preview limit (500 rows)");
  return data.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid NASA sample row");
    const raw = value as Record<string, unknown>;
    const rowId = stringOrNull(raw["id.accession"]);
    if (rowId !== id) throw new Error("NASA accession mismatch; import stopped");
    return {accession: id, organism: stringOrNull(raw["study.characteristics.organism"]), assay: stringOrNull(raw["id.assay name"]), sample: stringOrNull(raw["id.sample name"]), source:"NASA_OSDR_BDAPI", classification:"research_only", raw};
  });
}
export function createResearchExport(accession: string, records: ResearchRecord[], retrievedAt: string) {
  const id = normalizeAccession(accession);
  if (records.some(r => r.accession !== id || r.classification !== "research_only")) throw new Error("Research-only boundary violated");
  return {schema:"mitochondria.nasa-research-import.v1", accession:id, retrievedAt, source:"NASA OSDR Biological Data API v2", sourceUrl:researchEndpoint(id,"samples"), intendedUse:"research_only", subjectBinding:"none", clinicalActivation:false, records};
}
