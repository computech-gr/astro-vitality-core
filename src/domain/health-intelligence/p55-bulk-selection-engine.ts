/**
 * P55 universal bulk selection engine (pure, browser-safe), shared by the
 * Researcher (Global Scientific Review, P38 bulk decisions) and Ground Medical
 * (P38 bulk activation) screens.
 *
 * Selection is a set of stable record IDs (submission:term keys or decision
 * event IDs), never array positions or display names, so it spans every page of
 * the filtered dataset and survives re-sorting. Selecting never changes any
 * approval, triage or activation state. Before any write the preflight
 * classifies every selected record — including records hidden by the current
 * filters — as actionable, already processed or blocked (with its reason), so
 * an action is never silently applied to records the user cannot see. Results
 * map server item statuses onto five user-facing outcomes; only failed records
 * are offered for retry, so successful writes are never repeated.
 */
import {
  runBulkBatches,
  type BatchResponse,
  type BulkItemResult,
  type BulkItemStatus,
  type BulkProgress,
} from "./p38-bulk-demo-batches";

export type SelectionSet = ReadonlySet<string>;

export const selectAllFiltered = (current: SelectionSet, filteredIds: readonly string[]) =>
  new Set([...current, ...filteredIds]);
export const selectIds = (current: SelectionSet, ids: readonly string[]) =>
  new Set([...current, ...ids]);
export const deselectIds = (current: SelectionSet, ids: readonly string[]) => {
  const drop = new Set(ids);
  return new Set([...current].filter((id) => !drop.has(id)));
};
export const deselectAll = (): Set<string> => new Set();
export function toggleId(current: SelectionSet, id: string, on: boolean): Set<string> {
  const n = new Set(current);
  if (on) n.add(id);
  else n.delete(id);
  return n;
}

/** Drops IDs that no longer exist (after a reload), never adds any. */
export function pruneSelection(current: SelectionSet, existingIds: readonly string[]) {
  const live = new Set(existingIds);
  return new Set([...current].filter((id) => live.has(id)));
}

export interface SelectionScope {
  /** Records matching the current filters (all pages). */
  totalMatching: number;
  selected: number;
  selectedVisible: number;
  /** Selected records the current filters hide; always shown before confirmation. */
  selectedHidden: number;
  allFilteredSelected: boolean;
}

export function selectionScope(selected: SelectionSet, filteredIds: readonly string[]): SelectionScope {
  const filtered = new Set(filteredIds);
  let visible = 0;
  for (const id of selected) if (filtered.has(id)) visible++;
  return {
    totalMatching: filtered.size,
    selected: selected.size,
    selectedVisible: visible,
    selectedHidden: selected.size - visible,
    allFilteredSelected: filtered.size > 0 && visible === filtered.size,
  };
}

/** How one record relates to one requested action. */
export type ActionFit =
  | { kind: "actionable" }
  | { kind: "already"; reason: string }
  | { kind: "blocked"; reason: string };

export interface BulkPreflight<R> {
  missionLabel: string;
  roleLabel: string;
  actionLabel: string;
  selected: number;
  selectedHidden: number;
  actionable: R[];
  already: { record: R; reason: string }[];
  blocked: { record: R; reason: string }[];
  /** Blocking reasons with how many selected records each one blocks (largest first). */
  blockingReasons: { reason: string; count: number }[];
  /** Number of state changes the confirmed action can cause at most. */
  expectedChanges: number;
}

/**
 * Classifies every selected record for one action. Records are taken from the
 * complete dataset, never only the visible page; unknown IDs are ignored.
 */
export function buildBulkPreflight<R>(input: {
  records: readonly R[];
  idOf: (r: R) => string;
  selected: SelectionSet;
  filteredIds?: readonly string[];
  fit: (r: R) => ActionFit;
  missionLabel: string;
  roleLabel: string;
  actionLabel: string;
}): BulkPreflight<R> {
  const actionable: R[] = [];
  const already: { record: R; reason: string }[] = [];
  const blocked: { record: R; reason: string }[] = [];
  for (const r of input.records) {
    if (!input.selected.has(input.idOf(r))) continue;
    const f = input.fit(r);
    if (f.kind === "actionable") actionable.push(r);
    else if (f.kind === "already") already.push({ record: r, reason: f.reason });
    else blocked.push({ record: r, reason: f.reason });
  }
  const tally = new Map<string, number>();
  for (const b of blocked) tally.set(b.reason, (tally.get(b.reason) ?? 0) + 1);
  const scope = input.filteredIds ? selectionScope(input.selected, input.filteredIds) : null;
  return {
    missionLabel: input.missionLabel,
    roleLabel: input.roleLabel,
    actionLabel: input.actionLabel,
    selected: actionable.length + already.length + blocked.length,
    selectedHidden: scope?.selectedHidden ?? 0,
    actionable,
    already,
    blocked,
    blockingReasons: [...tally]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    expectedChanges: actionable.length,
  };
}

/** Selection counts for the toolbar: selected / matching / actionable / blocked / already processed. */
export function selectionCounts<R>(input: {
  records: readonly R[];
  idOf: (r: R) => string;
  selected: SelectionSet;
  filteredIds: readonly string[];
  fit: (r: R) => ActionFit;
}) {
  const p = buildBulkPreflight({ ...input, missionLabel: "", roleLabel: "", actionLabel: "" });
  const scope = selectionScope(input.selected, input.filteredIds);
  return {
    ...scope,
    actionable: p.actionable.length,
    blocked: p.blocked.length,
    alreadyProcessed: p.already.length,
  };
}

// --- Results --------------------------------------------------------------------
export type BulkOutcome = "success" | "already_completed" | "blocked" | "failed";
export const BULK_OUTCOME_LABEL: Record<BulkOutcome, string> = {
  success: "Success",
  already_completed: "Already completed",
  blocked: "Blocked",
  failed: "Failed · retry available",
};

/** Server item status → user outcome. Only a server "recorded" counts as success. */
export function outcomeOfStatus(status: BulkItemStatus): BulkOutcome {
  if (status === "recorded") return "success";
  if (status === "duplicate" || status === "skipped") return "already_completed";
  if (status === "stale") return "failed";
  return "blocked";
}

export interface RecordOutcome {
  id: string;
  label: string;
  outcome: BulkOutcome;
  detail: string | null;
  retryAvailable: boolean;
}

/**
 * Per-record outcome list for one run: server-confirmed results, records the
 * preflight blocked or found already processed (never sent), and records whose
 * batch was not confirmed (failed, retry available). Nothing is reported as a
 * success unless the server confirmed it.
 */
export function runOutcomes(input: {
  results: readonly BulkItemResult[];
  /** IDs sent but not confirmed (the failed batch and everything after it). */
  unconfirmedIds: readonly string[];
  preflightBlocked?: readonly { id: string; reason: string }[];
  preflightAlready?: readonly { id: string; reason: string }[];
  labelOf: (id: string) => string;
  failureMessage?: string | null;
}): RecordOutcome[] {
  const out: RecordOutcome[] = [];
  for (const r of input.results) {
    const outcome = outcomeOfStatus(r.status);
    out.push({
      id: r.ref,
      label: input.labelOf(r.ref),
      outcome,
      detail: r.detail ?? (r.status === "stale" ? "Changed meanwhile; reload and retry." : null),
      retryAvailable: outcome === "failed",
    });
  }
  for (const id of input.unconfirmedIds)
    out.push({
      id,
      label: input.labelOf(id),
      outcome: "failed",
      detail: input.failureMessage ?? "Not confirmed by the server; nothing is assumed.",
      retryAvailable: true,
    });
  for (const b of input.preflightAlready ?? [])
    out.push({ id: b.id, label: input.labelOf(b.id), outcome: "already_completed", detail: b.reason, retryAvailable: false });
  for (const b of input.preflightBlocked ?? [])
    out.push({ id: b.id, label: input.labelOf(b.id), outcome: "blocked", detail: b.reason, retryAvailable: false });
  return out;
}

export function outcomeCounts(outcomes: readonly RecordOutcome[]): Record<BulkOutcome, number> {
  const c: Record<BulkOutcome, number> = { success: 0, already_completed: 0, blocked: 0, failed: 0 };
  for (const o of outcomes) c[o.outcome]++;
  return c;
}

/** Retry Failed Selection: only failed records; successful or already-completed writes are never resent. */
export const retryFailedIds = (outcomes: readonly RecordOutcome[]) =>
  outcomes.filter((o) => o.retryAvailable).map((o) => o.id);

/**
 * Runs the actionable records of a confirmed preflight through bounded batches
 * (existing P38 batch runner) and returns per-record outcomes, including the
 * records the preflight never sent.
 */
export async function executeBulk<R>(input: {
  preflight: BulkPreflight<R>;
  idOf: (r: R) => string;
  labelOf: (id: string) => string;
  send: (batch: R[]) => Promise<BatchResponse>;
  onProgress?: (p: BulkProgress) => void;
}) {
  const res = await runBulkBatches(input.preflight.actionable, input.send, input.onProgress);
  const outcomes = runOutcomes({
    results: res.results,
    unconfirmedIds: res.remaining.map(input.idOf),
    preflightAlready: input.preflight.already.map((x) => ({ id: input.idOf(x.record), reason: x.reason })),
    preflightBlocked: input.preflight.blocked.map((x) => ({ id: input.idOf(x.record), reason: x.reason })),
    labelOf: input.labelOf,
    failureMessage: res.failure,
  });
  return { outcomes, progress: res.progress, failure: res.failure };
}
