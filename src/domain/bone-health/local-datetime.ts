/** Convert a persisted UTC instant to the device-local datetime-local wall clock.
 * Never slice the UTC ISO string into a local input.
 */
export function utcIsoToLocalDatetimeInput(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
