import { buildScientificEvidenceReport, type ScientificObservation } from "@/domain/health-intelligence/live-evidence";
import { loadRecordedMissionData, type RecordedMissionRow } from "@/infrastructure/mission-records";

/** Refuse operator, ground and researcher sessions: no unapproved identifiable analytics. */
export async function loadCrewScientificEvidence(missionId: string, crewMemberId: string) {
  const dataset = await loadRecordedMissionData(500);
  const authorized = dataset.cloudContext.signedIn && !dataset.cloudContext.error && dataset.cloudContext.memberships.some(
    (m) => m.missionId === missionId && m.crewMemberId === crewMemberId && m.role === "crew_self",
  );
  if (!authorized) return { report: null, reason: "Sign in as the assigned Crew Self member to inspect private scientific evidence." };
  const convert = (row: RecordedMissionRow): ScientificObservation | null => {
    if (row.missionId !== missionId || row.crewMemberId !== crewMemberId || !row.metricCode || !row.unit || !row.value) return null;
    const value = Number(row.value);
    if (!Number.isFinite(value) || !["good", "degraded", "poor", "unknown"].includes(row.quality ?? "unknown")) return null;
    return {
      id: row.id, missionId: row.missionId, crewMemberId: row.crewMemberId,
      metricCode: row.metricCode, value, unit: row.unit, observedAt: row.eventTimestamp,
      quality: (row.quality ?? "unknown") as ScientificObservation["quality"],
      sourceId: row.sourceId, location: row.location, classification: row.classification,
    };
  };
  const observations = [...dataset.local, ...dataset.cloud].map(convert).filter((item): item is ScientificObservation => item !== null);
  return { report: buildScientificEvidenceReport({ mission: { missionId, crewMemberId }, observations, generatedAt: new Date().toISOString() }), reason: dataset.cloudContext.error };
}
