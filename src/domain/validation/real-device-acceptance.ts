import ledger from "../../../data/validation/p34-real-device-acceptance.v1.json";
export const P34_ACCEPTANCE_LEDGER = ledger;
export type AcceptanceStatus = "not_executed" | "observed_pass" | "observed_fail" | "blocked";
export type AcceptanceObservation = { id: string; status: AcceptanceStatus; notes: string };
const ALLOWED: readonly AcceptanceStatus[] = ["not_executed", "observed_pass", "observed_fail", "blocked"];
/** Browser entries are self-reported session notes, NOT independently verified acceptance. */
export function acceptanceSummary(entries: readonly AcceptanceObservation[]) {
  const ids = new Set(P34_ACCEPTANCE_LEDGER.cases.map(item => item.id));
  const valid = entries.length === ids.size && new Set(entries.map(e => e.id)).size === ids.size && entries.every(e => ids.has(e.id) && ALLOWED.includes(e.status) && typeof e.notes === "string" && e.notes.length <= 2000 && (e.status !== "observed_pass" || e.notes.trim().length >= 20));
  const count = (s: AcceptanceStatus) => entries.filter(e => e.status === s).length;
  return { valid, total: ids.size, passed: valid ? count("observed_pass") : 0, failed: valid ? count("observed_fail") : 0, blocked: valid ? count("blocked") : 0, pending: valid ? count("not_executed") : ids.size, independentlyVerified: false, readyForClaim: false };
}
export function initialAcceptanceObservations(): AcceptanceObservation[] { return P34_ACCEPTANCE_LEDGER.cases.map(c => ({ id: c.id, status: "not_executed", notes: "" })); }
export function buildAcceptanceHandoff(entries: readonly AcceptanceObservation[]) {
  const summary = acceptanceSummary(entries);
  if (!summary.valid) throw new Error("Invalid acceptance notes; observed pass requires at least 20 characters of evidence notes");
  return { schemaVersion: "p34-human-observation-handoff-v1", verification: "SELF_REPORTED_UNVERIFIED", realDeviceAcceptanceApproved: false, independentScientificApproval: false, entries: entries.map(e => ({ id: e.id, status: e.status, notes: e.notes })) };
}
