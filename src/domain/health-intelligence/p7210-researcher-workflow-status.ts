/**
 * P72.10 Researcher workflow status (pure, browser-safe, display-only).
 *
 * Splits every submitted synthetic demo term into exactly one workflow bucket
 * so the Researcher decision table can default to records that still need a
 * Researcher decision. It reads existing preflight categories, triage and
 * recorded decisions only; it never writes, approves, activates or hides
 * anything from the record itself — the "All records" view always lists every
 * submitted term, and server checks are unchanged.
 */
export const RESEARCHER_WORKFLOW_FILTERS = [
  "pending",
  "awaiting_medical",
  "activated",
  "rejected",
  "all",
] as const;
export type ResearcherWorkflowFilter = (typeof RESEARCHER_WORKFLOW_FILTERS)[number];
export type ResearcherWorkflowStatus = Exclude<ResearcherWorkflowFilter, "all">;

export const RESEARCHER_WORKFLOW_LABEL: Record<ResearcherWorkflowFilter, string> = {
  pending: "Pending Researcher decision",
  awaiting_medical: "Approved · awaiting Medical activation",
  activated: "Already activated",
  rejected: "Rejected, declined or revoked",
  all: "All records",
};

export interface WorkflowRowLike {
  key: string;
  category: string;
  triageAction: string | null;
}
export interface WorkflowContext {
  /** Recorded P72.8 Researcher decision per term key, when installed. */
  researcher?: ReadonlyMap<string, "APPROVE" | "REJECT">;
  /** Recorded P72.8 Ground Medical decision per term key, when installed. */
  medical?: ReadonlyMap<string, "ACTIVATE" | "DECLINE">;
  /** Term keys whose demo entry was revoked. */
  revoked?: ReadonlySet<string>;
}

export function researcherWorkflowStatus(r: WorkflowRowLike, ctx: WorkflowContext = {}): ResearcherWorkflowStatus {
  if (ctx.revoked?.has(r.key)) return "rejected";
  if (r.category === "already_active" || ctx.medical?.get(r.key) === "ACTIVATE") return "activated";
  if (ctx.medical?.get(r.key) === "DECLINE") return "rejected";
  if (ctx.researcher?.get(r.key) === "REJECT") return "rejected";
  if (r.triageAction === "REJECT_REVIEW_REQUEST") return "rejected";
  if (r.category === "already_decided" || ctx.researcher?.get(r.key) === "APPROVE") return "awaiting_medical";
  return "pending";
}

export const matchesWorkflowFilter = (status: ResearcherWorkflowStatus, f: ResearcherWorkflowFilter) =>
  f === "all" || status === f;

export type WorkflowCounts = Record<ResearcherWorkflowFilter, number>;

/** Counts over the given rows; `all` is the original number of submitted terms. */
export function workflowCounts(rows: readonly WorkflowRowLike[], ctx: WorkflowContext = {}): WorkflowCounts {
  const c: WorkflowCounts = { pending: 0, awaiting_medical: 0, activated: 0, rejected: 0, all: rows.length };
  for (const r of rows) c[researcherWorkflowStatus(r, ctx)]++;
  return c;
}

/** Select All Filtered: exactly the records matching the current filters (replaces any hidden selection). */
export const selectOnlyFiltered = (filteredIds: readonly string[]) => new Set(filteredIds);

/**
 * When the request or workflow-status filter changes, keep only selections that
 * still match; returns the same set when nothing was dropped.
 */
export function reconcileSelection(
  current: ReadonlySet<string>,
  filteredIds: readonly string[],
): { selected: ReadonlySet<string>; dropped: number } {
  const live = new Set(filteredIds);
  const kept = [...current].filter((k) => live.has(k));
  return kept.length === current.size ? { selected: current, dropped: 0 } : { selected: new Set(kept), dropped: current.size - kept.length };
}
