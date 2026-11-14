/**
 * P71 demo presentation helpers (pure, browser-safe).
 *
 * Examination dates are calendar dates (Postgres `date`), shown exactly as
 * stored: never parsed through Date, so no time zone can shift them. The seed
 * examination carries the fixed date of the owner-approved P63 synthetic
 * sample (2026-11-15), which is fixture metadata rather than the submission
 * time, so it is labelled as such.
 */
import type { DemoRecord } from "./workflow";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const SEED_DATE_NOTE = "fixed date of the approved P63 synthetic sample, not the time it was added";

export function formatDemoExaminationDate(record: Pick<DemoRecord, "observedOn" | "submittedRole">): string {
  const day = DATE.test(record.observedOn) ? record.observedOn : record.observedOn.slice(0, 10);
  return record.submittedRole === "seed" ? `${day} (${SEED_DATE_NOTE})` : day;
}
