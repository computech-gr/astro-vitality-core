/**
 * P28 — Read-only loader for the unified report. Reads the encrypted local
 * offline store for exactly one mission + crew scope. Never writes, syncs or
 * uploads; results live in component memory only.
 */
import { getOfflineMissionStore } from "@/infrastructure/offline";
import { listBoneEntries } from "@/domain/bone-health/history";
import { MEASUREMENT_PROFILES } from "@/domain/health-measurements/profiles";
import { listUnifiedObservations } from "./observation-store";
import type { RawOfflineRecord, UnifiedReportInputs } from "./unified-health-report";

export async function loadUnifiedReportInputs(
  missionId: string,
  crewMemberId: string,
): Promise<UnifiedReportInputs> {
  const [bone, immune, cardiovascular, behavioral, unifiedObservations, records] = await Promise.all([
    listBoneEntries(missionId, crewMemberId, MEASUREMENT_PROFILES.bone),
    listBoneEntries(missionId, crewMemberId, MEASUREMENT_PROFILES.immune),
    listBoneEntries(missionId, crewMemberId, MEASUREMENT_PROFILES.cardiovascular),
    listBoneEntries(missionId, crewMemberId, MEASUREMENT_PROFILES.behavioral),
    listUnifiedObservations(missionId, crewMemberId),
    getOfflineMissionStore().list(1000),
  ]);
  const deviceRecords: RawOfflineRecord[] = records.filter(
    (r) => r.mission.missionId === missionId && r.mission.crewMemberId === crewMemberId,
  );
  return {
    domainEntries: { bone, immune, cardiovascular, behavioral },
    unifiedObservations,
    deviceRecords,
  };
}
