/** Calendar dates are not instants. Never pass a date-only value to JS Date. */
export type ObservationDatePrecision = "date" | "instant";
export interface ObservationDateFields {
  observedAt: string;
  datePrecision?: ObservationDatePrecision;
  collectionDate?: string;
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}

export function isExplicitInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return isCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

export function validObservationDate(fields: ObservationDateFields): boolean {
  return fields.datePrecision === "date"
    ? isCalendarDate(fields.observedAt)
    : (fields.datePrecision === undefined || fields.datePrecision === "instant") && isExplicitInstant(fields.observedAt);
}

export function observationDateKey(fields: ObservationDateFields): string {
  return fields.datePrecision === "date" ? `date:${fields.observedAt}` : `instant:${Date.parse(fields.observedAt)}`;
}

/** Calendar-day grouping only; a date-only day has no inferred time zone. */
export function observationDay(value: string): string {
  return isCalendarDate(value) ? value : isExplicitInstant(value) ? new Date(value).toISOString().slice(0, 10) : "";
}

/** Deterministic display order, not an assertion of order within a date-only day. */
export function compareObservationDates(a: ObservationDateFields, b: ObservationDateFields): number {
  if (a.datePrecision !== "date" && b.datePrecision !== "date") return Date.parse(a.observedAt) - Date.parse(b.observedAt);
  return observationDay(a.observedAt).localeCompare(observationDay(b.observedAt)) || a.observedAt.localeCompare(b.observedAt);
}

/** Mixed precision and unordered same-day dates never imply a physiological difference. */
export function comparableObservationDates(rows: readonly ObservationDateFields[]): boolean {
  const dates = rows.filter((r) => r.datePrecision === "date");
  if (!dates.length) return new Set(rows.map(observationDateKey)).size >= 2;
  return dates.length === rows.length && new Set(dates.map((r) => r.observedAt)).size === dates.length && dates.length >= 2;
}

export function observationDateLabel(fields: ObservationDateFields): string {
  return fields.datePrecision === "date" ? `${fields.observedAt} (date only; time/timezone not supplied)` : fields.observedAt;
}