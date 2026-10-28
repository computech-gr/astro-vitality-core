/** Authorized report display identity. Never derive a name from untrusted document text. */
export interface ReportExportIdentity {
  missionName?: string | null;
  missionId: string;
  crewDisplayName?: string | null;
  crewMemberId: string;
  generatedAt?: string;
  provenance: "synthetic" | "real";
}
function filenameToken(value: string, max = 52): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, max);
}
export function reportExportBasename(identity: ReportExportIdentity): string {
  const mission = filenameToken(identity.missionName?.trim() || identity.missionId) || "Mission";
  // Never infer a person's name from a crew UUID. Fallback to neutral crew identifier.
  const crew = filenameToken(identity.crewDisplayName?.trim() || identity.crewMemberId) || "Crew";
  const date = /^\d{4}-\d{2}-\d{2}/.exec(identity.generatedAt ?? "")?.[0] ?? new Date().toISOString().slice(0, 10);
  return `MITOCHONDRIA_${mission}_${crew}_Unified_Health_Report_${identity.provenance.toUpperCase()}_${date}`;
}