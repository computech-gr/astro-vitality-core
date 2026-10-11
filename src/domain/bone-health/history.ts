import { getOfflineMissionStore, persistOfflineMissionEvent } from "@/infrastructure/offline";
import { BONE_HEALTH_VARIABLES } from "./catalog";

export interface BoneHealthEntry {
  id: string;
  missionId: string;
  crewMemberId: string;
  variableId: string;
  value: number;
  unit: string;
  observedAt: string;
  sourceLabel: string;
  specimen: string;
  assayMethod: string;
  notes: string;
  dataOrigin: "synthetic" | "real";
}
const SOURCE = "p22.1-bone-health-manual";
export function validateBoneEntry(entry: BoneHealthEntry): string | null {
  if (!BONE_HEALTH_VARIABLES.some((item) => item.id === entry.variableId)) return "Choose a catalog variable.";
  if (!entry.missionId.trim() || !entry.crewMemberId.trim()) return "Mission and crew identifiers are required.";
  if (!Number.isFinite(entry.value)) return "Enter a finite numeric result.";
  if (!entry.unit.trim() || !entry.sourceLabel.trim()) return "Unit and source are required.";
  if (!entry.observedAt || !Number.isFinite(Date.parse(entry.observedAt))) return "Valid observation date is required.";
  if (entry.dataOrigin !== "synthetic" && entry.dataOrigin !== "real") return "Data origin must be explicit.";
  return null;
}
export async function saveBoneEntry(entry: BoneHealthEntry): Promise<void> {
  const issue = validateBoneEntry(entry);
  if (issue) throw new Error(issue);
  await persistOfflineMissionEvent({
    id: `bone-health:${entry.id}`,
    kind: "observation",
    mission: { missionId: entry.missionId, crewMemberId: entry.crewMemberId },
    eventTimestamp: entry.observedAt,
    sourceId: SOURCE,
    sourceVersion: "22.1",
    classification: "medical_sensitive",
    payload: { schemaVersion: "22.1", entry },
  });
}
export async function listBoneEntries(missionId: string, crewMemberId: string): Promise<BoneHealthEntry[]> {
  const records = await getOfflineMissionStore().list(1000);
  return records.filter((record) => record.sourceId === SOURCE && record.mission.missionId === missionId && record.mission.crewMemberId === crewMemberId)
    .map((record) => {
      const payload = record.payload as { entry?: BoneHealthEntry } | null;
      return payload?.entry;
    })
    .filter((entry): entry is BoneHealthEntry => Boolean(entry && !validateBoneEntry(entry)))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}
