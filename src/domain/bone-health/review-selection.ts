import { validateBoneEntry } from "./history";
import type { ReviewRow } from "./file-queue";

/** Use the existing save prerequisites; selection is never persistence or scientific approval. */
export function boneReviewIssue(row: ReviewRow): string | null {
  return validateBoneEntry({ ...row, missionId: "review", crewMemberId: "review", dataOrigin: "synthetic" });
}

export function selectBoneReviewRows(rows: ReviewRow[], selected: boolean): ReviewRow[] {
  return rows.map(row => row.saved ? row : { ...row, selected: selected && boneReviewIssue(row) === null });
}