/**
 * P28 — Read-only loader for the unified report. Reads the encrypted local
 * offline store for exactly one mission + crew scope. Never writes, syncs or
 * uploads; results live in component memory only.
 *
 * P60: the report source is THIS DEVICE's encrypted IndexedDB store only. Server copies reach it
 * solely through the explicit, default-off v9.4 cross-device import. Every stored record is read
 * (count-based, not a bounded newest-first page), and the loader reports coverage so the report can
 * state whether all stored records were read.
 */
import { getOfflineMissionStore } from "@/infrastructure/offline";
import { listBoneEntries } from "@/domain/bone-health/history";
import { MEASUREMENT_PROFILES } from "@/domain/health-measurements/profiles";
import { listUnifiedObservations } from "./observation-store";
import type { RawOfflineRecord, UnifiedReportInputs } from "./unified-health-report";
import type { ReportSourceCoverage } from "./p60-observation-census";

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
    readAllOfflineRecords(),
  ]);
  const deviceRecords: RawOfflineRecord[] = records.records.filter(
    (r) => r.mission.missionId === missionId && r.mission.crewMemberId === crewMemberId,
  );
  return {
    domainEntries: { bone, immune, cardiovascular, behavioral },
    unifiedObservations,
    deviceRecords,
    coverage: records.coverage,
  };
}

/** Reads every stored record when the store can count them; falls back to the historical 1000-record page otherwise. */
export async function readAllOfflineRecords(store = getOfflineMissionStore()): Promise<{ records: RawOfflineRecord[]; coverage: ReportSourceCoverage }> {
  const counted = typeof store.countRecords === "function";
  const total = counted ? await store.countRecords() : 0;
  const records: RawOfflineRecord[] = await store.list(Math.max(1000, total));
  return {
    records,
    coverage: { source: "device-local-encrypted-store", storedRecords: counted ? total : null, readRecords: records.length, complete: counted ? records.length >= total : null },
  };
}
