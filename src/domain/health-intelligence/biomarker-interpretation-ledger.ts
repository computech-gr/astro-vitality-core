/**
 * P40 — device-local persistence of biomarker interpretation review events and
 * the verified interpretation snapshot used by reports (online and offline).
 *
 * Events are catalog-level (no astronaut, observation or value), stored
 * encrypted and append-only in the local review ledger under a fixed
 * catalog scope, and never read by any sync path. The snapshot combines the
 * bundled shared registry with the chain-verified local events; a broken chain
 * is ignored entirely so only the shared registry is used.
 */
import { getReviewLedgerStore, type ReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import registryJson from "../../../data/scientific/biomarker-interpretation-registry.v1.json";
import {
  INTERPRETATION_EVENT_SCHEMA,
  buildVerifiedSnapshot,
  resolveInterpretations,
  sealInterpretationEvent,
  validateRegistry,
  verifyInterpretationChain,
  type InterpretationEvent,
  type InterpretationEventBody,
  type InterpretationSnapshot,
} from "./biomarker-interpretation";

/** Fixed catalog-level partition of the review ledger (not mission or crew data). */
export const INTERPRETATION_LEDGER_SCOPE = {
  missionId: "catalog:biomarker-interpretation",
  crewMemberId: "catalog-review",
  provenance: "synthetic" as const,
};
const LEDGER = "biomarker-interpretation" as const;

export const bundledInterpretationRegistry = (): unknown => registryJson;

let registryOnly: InterpretationSnapshot | null = null;
/** Synchronous registry-only snapshot (no device events), e.g. before the ledger is read. */
export function registryInterpretationSnapshot(): InterpretationSnapshot {
  if (registryOnly) return registryOnly;
  const { registry, excluded } = validateRegistry(registryJson);
  registryOnly = resolveInterpretations(registry, [], undefined, excluded);
  return registryOnly;
}

const isEvent = (x: unknown): x is InterpretationEvent => {
  const e = x as Partial<InterpretationEvent> | null;
  return !!e && e.schema === INTERPRETATION_EVENT_SCHEMA && Number.isInteger(e.seq) && typeof e.hash === "string" && typeof e.key === "string";
};

export async function listInterpretationEvents(store: ReviewLedgerStore = getReviewLedgerStore()): Promise<InterpretationEvent[]> {
  const rows = await store.list({ ledger: LEDGER, ...INTERPRETATION_LEDGER_SCOPE });
  return rows.map((r) => r.payload).filter(isEvent).sort((a, b) => a.seq - b.seq);
}

/** Last verified local interpretation snapshot: bundled registry + chain-verified device events. */
export async function loadVerifiedInterpretationSnapshot(store: ReviewLedgerStore = getReviewLedgerStore()): Promise<InterpretationSnapshot> {
  return buildVerifiedSnapshot(registryJson, await listInterpretationEvents(store));
}

/**
 * Append one planned event. Its ID is the sequence number, so two tabs racing
 * for the same position cannot both succeed; the loser must reload.
 */
export async function appendInterpretationEvent(
  body: InterpretationEventBody,
  store: ReviewLedgerStore = getReviewLedgerStore(),
): Promise<InterpretationEvent> {
  const existing = await listInterpretationEvents(store);
  const event = await sealInterpretationEvent(body);
  const check = await verifyInterpretationChain([...existing, event]);
  if (!check.ok) throw new Error(`The interpretation review history changed or failed its integrity check (${check.reason}). Reload before recording.`);
  const result = await store.append({
    id: `biomarker-interpretation:${event.seq}`,
    ledger: LEDGER,
    ...INTERPRETATION_LEDGER_SCOPE,
    actorUserId: event.actorUserId,
    createdAt: event.recordedAt,
    payload: event,
  });
  if (result === "duplicate") throw new Error("Another review event was recorded at the same position. Reload and try again; nothing was overwritten.");
  return event;
}
