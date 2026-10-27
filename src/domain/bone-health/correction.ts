import type { BoneHealthEntry } from "./history";

/** Failed correction persistence must never invalidate the original record. */
export async function persistBoneCorrection(
  entry: BoneHealthEntry,
  original: BoneHealthEntry | undefined,
  save: (entry: BoneHealthEntry) => Promise<void>,
  mark: (entry: BoneHealthEntry, reason: string) => Promise<void>,
): Promise<void> {
  await save(entry);
  if (original && original.status !== "erroneous")
    await mark(original, "Superseded by a corrected record.");
}

export function scopedBoneSources(
  history: readonly BoneHealthEntry[],
  missionId: string,
  crewMemberId: string,
  dataOrigin: string,
): string[] {
  return history
    .filter(row => row.missionId === missionId && row.crewMemberId === crewMemberId && row.dataOrigin === dataOrigin)
    .map(row => row.sourceLabel);
}