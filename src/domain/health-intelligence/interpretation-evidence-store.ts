/**
 * P41 — device-local, encrypted, append-only storage of literature evidence
 * bundles and backlog attempts (catalog concepts and public literature only:
 * no astronaut, observation or value). Stored in the local review ledger under
 * a fixed catalog scope and never read by any sync path.
 */
import { getReviewLedgerStore, type ReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import { EVIDENCE_ATTEMPT_SCHEMA, type EvidenceAttempt } from "./interpretation-backlog";
import { INTERPRETATION_LEDGER_SCOPE } from "./biomarker-interpretation-ledger";

const LEDGER = "interpretation-evidence" as const;

const isAttempt = (x: unknown): x is EvidenceAttempt => {
  const a = x as Partial<EvidenceAttempt> | null;
  return !!a && a.schema === EVIDENCE_ATTEMPT_SCHEMA && typeof a.key === "string" && Number.isInteger(a.attempt);
};

export async function listEvidenceAttempts(store: ReviewLedgerStore = getReviewLedgerStore()): Promise<EvidenceAttempt[]> {
  const rows = await store.list({ ledger: LEDGER, ...INTERPRETATION_LEDGER_SCOPE });
  return rows.map((r) => r.payload).filter(isAttempt);
}

/** Append one attempt; an existing key+attempt position is never overwritten. */
export async function appendEvidenceAttempt(a: EvidenceAttempt, store: ReviewLedgerStore = getReviewLedgerStore()): Promise<"stored" | "duplicate"> {
  const result = await store.append({
    id: `interpretation-evidence:${a.key}#${a.attempt}`,
    ledger: LEDGER,
    ...INTERPRETATION_LEDGER_SCOPE,
    actorUserId: a.actorUserId,
    createdAt: a.at,
    payload: a,
  });
  return result === "duplicate" ? "duplicate" : "stored";
}
