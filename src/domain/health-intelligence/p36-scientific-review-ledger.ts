/**
 * Local persistence for P36 scientific review worksheet entries.
 *
 * Entries are catalog-level (not tied to an astronaut), contain no observation
 * values, and are stored encrypted and append-only in the local review ledger
 * under a fixed catalog-review scope. This ledger kind is never read by any
 * sync path, so nothing is uploaded.
 */
import { getReviewLedgerStore, type ReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import { REQUIRED_SCIENTIFIC_GATE } from "./unknown-biomarker-review";
import {
  SCIENTIFIC_REVIEW_ENTRY_SCHEMA,
  verifyScientificReviewChain,
  type ScientificReviewEntry,
} from "./p36-scientific-review";

/** Fixed catalog-level scope: no mission, crew member or measurement data is involved. */
export const CATALOG_REVIEW_SCOPE = {
  missionId: "catalog:p36-reconciliation",
  crewMemberId: "catalog-review",
  provenance: "synthetic" as const,
};

const LEDGER = "catalog-scientific-review" as const;

const isEntry = (x: unknown): x is ScientificReviewEntry => {
  const e = x as Partial<ScientificReviewEntry> | null;
  return (
    !!e && e.schema === SCIENTIFIC_REVIEW_ENTRY_SCHEMA && Number.isInteger(e.sequence) && typeof e.hash === "string" &&
    typeof e.prevHash === "string" && typeof e.termId === "string" && e.scientificStatus === REQUIRED_SCIENTIFIC_GATE &&
    e.documentaryOnly === true && e.activationApplied === false
  );
};

export async function listScientificReviewEntries(store: ReviewLedgerStore = getReviewLedgerStore()) {
  const rows = await store.list({ ledger: LEDGER, ...CATALOG_REVIEW_SCOPE });
  const entries = rows.map((r) => r.payload).filter(isEntry).sort((a, b) => a.sequence - b.sequence);
  const integrity = await verifyScientificReviewChain(entries);
  return { entries, integrity };
}

/**
 * Append one already-built entry. The ID is the sequence number, so two tabs
 * racing for the same position cannot both succeed; the loser must reload.
 */
export async function appendScientificReviewEntry(entry: ScientificReviewEntry, store: ReviewLedgerStore = getReviewLedgerStore()) {
  if (!isEntry(entry)) throw new Error("Only documentary, pending worksheet entries can be stored.");
  const { entries } = await listScientificReviewEntries(store);
  const integrity = await verifyScientificReviewChain([...entries, entry]);
  if (!integrity.ok) throw new Error("The review history changed or failed its integrity check. Reload before recording.");
  const result = await store.append({
    id: `catalog-scientific-review:${entry.sequence}`,
    ledger: LEDGER,
    ...CATALOG_REVIEW_SCOPE,
    actorUserId: entry.recordedByUserId,
    createdAt: entry.recordedAt,
    payload: entry,
  });
  if (result === "duplicate") throw new Error("Another entry was recorded at the same position. Reload and try again; nothing was overwritten.");
  return result;
}
