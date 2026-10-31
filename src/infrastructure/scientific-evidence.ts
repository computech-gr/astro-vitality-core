import { buildScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";
import { projectCanonicalObservations } from "@/domain/health-intelligence/canonical-projection";
import { loadRecordedMissionData } from "@/infrastructure/mission-records";

/** Refuse operator, ground and researcher sessions: no unapproved identifiable analytics. */
export async function loadCrewScientificEvidence(missionId: string, crewMemberId: string) {
  const dataset = await loadRecordedMissionData(500);
  const authorized = dataset.cloudContext.signedIn && !dataset.cloudContext.error && dataset.cloudContext.memberships.some(
    (m) => m.missionId === missionId && m.crewMemberId === crewMemberId && m.role === "crew_self",
  );
  if (!authorized) return { report: null, reason: "Sign in as the assigned Crew Self member to inspect private scientific evidence." };
  // P49: read-only canonical projection of every supported stored format; stored records are never modified.
  const projection = projectCanonicalObservations([...dataset.local, ...dataset.cloud], { missionId, crewMemberId });
  const report = buildScientificEvidenceReport({
    mission: { missionId, crewMemberId },
    observations: projection.observations,
    generatedAt: new Date().toISOString(),
  });
  return { report: { ...report, nonChartable: projection.nonChartable }, reason: dataset.cloudContext.error };
}
