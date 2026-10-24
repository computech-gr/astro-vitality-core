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
  /** Append-only correction state. Absent means the record stands as entered. */
  status?: "active" | "erroneous";
  /** Set on a correction entry that supersedes an earlier erroneous record. */
  supersedesId?: string;
  /** Human reason recorded when an entry is marked erroneous. */
  statusReason?: string;
}
const SOURCE = "p22.1-bone-health-manual";
export function validateBoneEntry(entry: BoneHealthEntry): string | null {
  if (!BONE_HEALTH_VARIABLES.some((item) => item.id === entry.variableId)) return "Choose a catalog variable.";
  if (!entry.missionId.trim() || !entry.crewMemberId.trim()) return "Mission and crew identifiers are required.";
  if (!Number.isFinite(entry.value)) return "Enter a finite numeric result.";
  if (!entry.unit.trim() || !entry.sourceLabel.trim()) return "Unit and source are required.";
  if (!entry.observedAt || !Number.isFinite(Date.parse(entry.observedAt))) return "Valid observation date is required.";
  if (entry.dataOrigin !== "synthetic" && entry.dataOrigin !== "real") return "Data origin must be explicit.";
  if (entry.status !== undefined && entry.status !== "active" && entry.status !== "erroneous") return "Unknown entry status.";
  return null;
}

/**
 * Duplicate warning candidates: same variable, same observation instant and same
 * numeric value. Repeat measurements are legitimate, so this never blocks a
 * save — it only names the records the reviewer should compare against.
 */
export function findPotentialDuplicates(
  history: BoneHealthEntry[],
  draft: Pick<BoneHealthEntry, "variableId" | "observedAt" | "value">,
): BoneHealthEntry[] {
  return history.filter(
    (entry) =>
      entry.status !== "erroneous" &&
      entry.variableId === draft.variableId &&
      entry.observedAt === draft.observedAt &&
      entry.value === draft.value,
  );
}

/**
 * Append-only version collapse: several stored events may carry the same entry
 * id (an entry plus a later status correction). The newest stored version wins;
 * earlier versions are never rewritten or deleted.
 */
export function collapseBoneEntryVersions(
  versions: Array<{ entry: BoneHealthEntry; storedAt: string }>,
): BoneHealthEntry[] {
  const latest = new Map<string, { entry: BoneHealthEntry; storedAt: string }>();
  for (const version of versions) {
    const previous = latest.get(version.entry.id);
    if (!previous || previous.storedAt <= version.storedAt) latest.set(version.entry.id, version);
  }
  return [...latest.values()].map((version) => version.entry);
}

export async function saveBoneEntry(entry: BoneHealthEntry): Promise<void> {
  const issue = validateBoneEntry(entry);
  if (issue) throw new Error(issue);
  await persistOfflineMissionEvent({
    id: `bone-health:${entry.id}:${entry.status === "erroneous" ? "status" : "entry"}`,
    kind: "observation",
    mission: { missionId: entry.missionId, crewMemberId: entry.crewMemberId },
    eventTimestamp: entry.observedAt,
    sourceId: SOURCE,
    sourceVersion: "22.1",
    classification: "medical_sensitive",
    payload: { schemaVersion: "22.1", metricCode: entry.variableId, entry },
  });
}

/**
 * Append-only correction: stores a new event marking the existing entry as
 * erroneous. The original event is never rewritten or deleted.
 */
export async function markBoneEntryErroneous(entry: BoneHealthEntry, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error("A short reason is required to mark a record as erroneous.");
  await saveBoneEntry({ ...entry, status: "erroneous", statusReason: reason.trim().slice(0, 500) });
}

export async function listBoneEntries(missionId: string, crewMemberId: string): Promise<BoneHealthEntry[]> {
  const records = await getOfflineMissionStore().list(1000);
  const versions = records.filter((record) => record.sourceId === SOURCE && record.mission.missionId === missionId && record.mission.crewMemberId === crewMemberId)
    .map((record) => {
      const payload = record.payload as { entry?: BoneHealthEntry } | null;
      return payload?.entry ? { entry: payload.entry, storedAt: record.eventTimestamp + ":" + record.id } : null;
    })
    .filter((version): version is { entry: BoneHealthEntry; storedAt: string } => Boolean(version && !validateBoneEntry(version.entry)));
  return collapseBoneEntryVersions(versions)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}
