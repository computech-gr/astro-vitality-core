/**
 * P57 — device-local persistence of reference-criteria review events.
 *
 * Catalog-level events (no astronaut, observation or value) in the encrypted,
 * append-only local review ledger under a fixed catalog partition; never read
 * by any sync path. The approved set used by reports is the chain-verified,
 * server-attested resolution of these events (p57-criteria-review.ts).
 */
import { getReviewLedgerStore, type ReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import { bundledCriteriaRegistry, type CriteriaRegistry } from "./p57-reference-criteria";
import {
  CRITERIA_EVENT_SCHEMA,
  resolveCriteriaReview,
  verifyCriteriaChain,
  type CriteriaEvent,
  type CriteriaReviewResolution,
} from "./p57-criteria-review";
import { BUNDLED_CRITERIA_KEYS, type CriteriaTrustedKey } from "./p57-criteria-attestation";

export const CRITERIA_LEDGER_SCOPE = { missionId: "catalog:reference-criteria", crewMemberId: "catalog-review", provenance: "synthetic" as const };
const LEDGER = "reference-criteria-review" as const;

const isEvent = (x: unknown): x is CriteriaEvent => {
  const e = x as Partial<CriteriaEvent> | null;
  return !!e && e.schema === CRITERIA_EVENT_SCHEMA && Number.isInteger(e.seq) && typeof e.hash === "string";
};

export async function listCriteriaEvents(store: ReviewLedgerStore = getReviewLedgerStore()): Promise<CriteriaEvent[]> {
  const rows = await store.list({ ledger: LEDGER, ...CRITERIA_LEDGER_SCOPE });
  return rows.map((r) => r.payload).filter(isEvent).sort((a, b) => a.seq - b.seq);
}

export async function loadCriteriaResolution(
  store: ReviewLedgerStore = getReviewLedgerStore(),
  registry: CriteriaRegistry = bundledCriteriaRegistry(),
  trustedKeys: readonly CriteriaTrustedKey[] = BUNDLED_CRITERIA_KEYS,
): Promise<CriteriaReviewResolution> {
  return resolveCriteriaReview(registry, await listCriteriaEvents(store), trustedKeys);
}

/** Append planned events in order; IDs are sequence numbers, so a racing tab cannot overwrite. */
export async function appendCriteriaEvents(events: readonly CriteriaEvent[], store: ReviewLedgerStore = getReviewLedgerStore()): Promise<number> {
  const existing = await listCriteriaEvents(store);
  const check = await verifyCriteriaChain([...existing, ...events]);
  if (!check.ok) throw new Error(`The criteria decision history changed or failed its integrity check (${check.reason}). Reload before recording.`);
  let n = 0;
  for (const e of events) {
    const r = await store.append({ id: `reference-criteria:${e.seq}`, ledger: LEDGER, ...CRITERIA_LEDGER_SCOPE, actorUserId: e.actorUserId, createdAt: e.recordedAt, payload: e });
    if (r === "duplicate") throw new Error(`Another decision was recorded at position ${e.seq}. Reload and try again; nothing was overwritten.`);
    n++;
  }
  return n;
}
