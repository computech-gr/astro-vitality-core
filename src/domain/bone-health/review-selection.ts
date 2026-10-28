import { validateBoneEntry } from "./history";
import type { ReviewRow } from "./file-queue";

/** Use the existing save prerequisites; selection is never persistence or scientific approval. */
export function boneReviewIssue(row: ReviewRow): string | null {
  return validateBoneEntry({ ...row, missionId: "review", crewMemberId: "review", dataOrigin: "synthetic" });
}

export function selectBoneReviewRows(rows: ReviewRow[], selected: boolean): ReviewRow[] {
  return rows.map(row => row.saved ? row : { ...row, selected: selected && boneReviewIssue(row) === null });
}

/** Strict calendar date and explicit timezone; never rely on Date.parse rollover. */
export function isBoneSharedObservationTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0)
    && Number(match[4]) < 24 && Number(match[5]) < 60 && Number(match[6] ?? 0) < 60
    && Number(match[8] ?? 0) < 24 && Number(match[9] ?? 0) < 60
    && Number.isFinite(Date.parse(value));
}

/** Confirmation authorizes only a fill, never measurement verification or persistence. */
export function applyBoneSharedObservationTimestamp(rows: ReviewRow[], timestamp: string, confirmed: boolean): ReviewRow[] {
  if (!confirmed || !isBoneSharedObservationTimestamp(timestamp)) return rows;
  return rows.map(row => !row.saved && !row.observedAt.trim()
    ? { ...row, observedAt: timestamp, selected: false } : row);
}
/** Strict native `datetime-local` value (device local time) to UTC ISO; rejects rollover. */
export function boneLocalInputToIso(local: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local);
  if (!match) return "";
  const [y, mo, d, h, mi, s] = match.slice(1).map(part => Number(part ?? 0));
  const date = new Date(y!, mo! - 1, d!, h!, mi!, s ?? 0);
  if (date.getFullYear() !== y || date.getMonth() !== mo! - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== mi) return "";
  return date.toISOString();
}

/** UTC/offset ISO to native `datetime-local` display in device local time; invalid values display empty. */
export function boneIsoToLocalInput(iso: string): string {
  if (!isBoneSharedObservationTimestamp(iso)) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const seconds = date.getSeconds() ? `:${pad(date.getSeconds())}` : "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}${seconds}`;
}
