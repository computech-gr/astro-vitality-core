/**
 * P55 bulk action rules (pure, browser-safe). Each rule says, for one record and
 * one requested action, whether the action may run, was already done, or is
 * blocked and why. They mirror — never replace — the server checks, which
 * re-validate every write. Actions stay distinct: accepting for review is
 * triage only, a synthetic demo decision is not a scientific approval, and
 * nothing here activates; Ground Medical activation is a separate role.
 */
import type { ActionFit } from "./p55-bulk-selection-engine";
import type { ActivationRow } from "./p38-bulk-demo-batches";
import type { PreflightCategory } from "./p38-bulk-demo-preflight";

const ok: ActionFit = { kind: "actionable" };
const already = (reason: string): ActionFit => ({ kind: "already", reason });
const blocked = (reason: string): ActionFit => ({ kind: "blocked", reason });

// --- Researcher -----------------------------------------------------------------
export type ResearcherBulkAction = "accept_review" | "request_clarification" | "demo_decide" | "acknowledge_match";
export const RESEARCHER_ACTION_LABEL: Record<ResearcherBulkAction, string> = {
  accept_review: "Accept Selected for Scientific Review",
  request_clarification: "Request Evidence / Unit Clarification",
  demo_decide: "Record Selected Synthetic Demo Decisions",
  acknowledge_match: "Acknowledge Existing Catalog Matches",
};

export const NO_TRIAGE_GRANT = "This account has no triage grant (separately provisioned by the owner).";

/** Bulk triage acceptance: only terms still awaiting triage. */
export function acceptReviewFit(r: { triageAction: string | null }, canTriage: boolean): ActionFit {
  if (r.triageAction === "ACCEPT_FOR_REVIEW") return already("Already accepted for scientific review.");
  if (r.triageAction === "REJECT_REVIEW_REQUEST")
    return blocked("The review request was rejected; a new submission is required.");
  if (r.triageAction === "REQUEST_MORE_EVIDENCE")
    return blocked("More evidence was requested; accept it individually once the evidence is supplied.");
  if (!canTriage) return blocked(NO_TRIAGE_GRANT);
  return ok;
}

/** Categories already resolved in the demo catalog or the existing catalog: nothing to clarify. */
const RESOLVED: readonly PreflightCategory[] = ["already_active", "already_decided", "existing_catalog_match"];

/** Bulk REQUEST_MORE_EVIDENCE: unresolved terms whose request was not rejected and not already pending evidence. */
export function requestClarificationFit(
  r: { triageAction: string | null; category?: PreflightCategory },
  canTriage: boolean,
): ActionFit {
  if (r.triageAction === "REQUEST_MORE_EVIDENCE") return already("More evidence was already requested.");
  if (r.triageAction === "REJECT_REVIEW_REQUEST")
    return blocked("The review request was rejected; a new submission is required.");
  if (r.category && RESOLVED.includes(r.category))
    return blocked(
      r.category === "existing_catalog_match"
        ? "Already recognized by an existing catalog identity; acknowledge the match instead."
        : "Already has a synthetic demo decision; nothing to clarify.",
    );
  if (!canTriage) return blocked(NO_TRIAGE_GRANT);
  return ok;
}

/** Suggested evidence requirements for a clarification request (the Researcher confirms them). */
export function suggestedRequirements(categories: readonly (PreflightCategory | undefined)[]) {
  const s = new Set<"unit" | "identity">();
  for (const c of categories) {
    if (c === "ambiguous_unit") s.add("unit");
    if (c === "conflicting_identity" || c === "duplicate") s.add("identity");
  }
  return [...s].sort();
}

/**
 * Synthetic demo decision: the existing P38 prerequisites (eligible preflight,
 * owner demo scope, not the caller's own submission) plus prior review acceptance.
 */
export function demoDecideFit(
  r: { category: PreflightCategory; inScope: boolean; triageAction: string | null; reasons: readonly string[] },
  ctx: { submittedByCaller: boolean; canDecide: boolean },
): ActionFit {
  if (r.category === "already_active") return already("Already active as a synthetic demo entry.");
  if (r.category === "already_decided") return already("A synthetic demo decision already exists; Ground Medical activates it.");
  if (r.category !== "eligible") return blocked(r.reasons[0] ?? "Not eligible for a synthetic demo decision.");
  if (!r.inScope) return blocked("Outside the owner-authorized synthetic demo scope.");
  if (ctx.submittedByCaller) return blocked("You submitted this term; an independent Researcher must decide it.");
  if (r.triageAction !== "ACCEPT_FOR_REVIEW") return blocked("Accept it for scientific review first.");
  if (!ctx.canDecide) return blocked("This account has no scientific approver grant.");
  return ok;
}

/** Session-only acknowledgement that a term maps to an existing catalog identity (no write, no new entry). */
export function acknowledgeMatchFit(r: { category: PreflightCategory }, acknowledged: boolean): ActionFit {
  if (r.category !== "existing_catalog_match")
    return blocked("Only terms already recognized by an existing catalog identity can be acknowledged.");
  if (acknowledged) return already("Existing catalog match already acknowledged in this session.");
  return ok;
}

// --- Ground Medical -------------------------------------------------------------
export type GroundStatus =
  | "awaiting_activation"
  | "already_active"
  | "existing_catalog_match"
  | "requires_clarification"
  | "blocked";
export const GROUND_STATUS_LABEL: Record<GroundStatus, string> = {
  awaiting_activation: "Awaiting Ground Medical activation · eligible",
  already_active: "Already active",
  existing_catalog_match: "Existing catalog match",
  requires_clarification: "Requires clarification",
  blocked: "Blocked",
};

export interface GroundRecord {
  row: ActivationRow;
  status: GroundStatus;
  reason: string;
  /** Existing catalog identity with the same label and exact unit, if any. */
  existingMatch: string | null;
}

/**
 * Ground Medical status of one demo proposal: the existing activation preview
 * category, plus a conservative block when an existing catalog identity already
 * recognizes the same label and exact unit (the mapping is shown, never duplicated).
 */
export function groundRecord(row: ActivationRow, existingMatch: (label: string, unit: string) => string | null): GroundRecord {
  const e = row.proposal.entry;
  const match = [e.displayName, ...e.aliases].map((l) => existingMatch(l, e.unit)).find((m) => m) ?? null;
  if (row.category === "already_active") return { row, status: "already_active", reason: row.reason, existingMatch: match };
  if (row.category === "eligible" && match)
    return {
      row,
      status: "existing_catalog_match",
      reason: `Already recognized by ${match} with this exact unit; a demo entry would never apply, so it is not activated.`,
      existingMatch: match,
    };
  if (row.category === "eligible") return { row, status: "awaiting_activation", reason: row.reason, existingMatch: null };
  if (row.category === "conflict") return { row, status: "requires_clarification", reason: row.reason, existingMatch: match };
  return { row, status: "blocked", reason: row.reason, existingMatch: match };
}

export type GroundBulkAction = "activate" | "clarify";
export const GROUND_ACTION_LABEL: Record<GroundBulkAction, string> = {
  activate: "Activate Selected Eligible Synthetic Demo Entries",
  clarify: "Request Clarification for Selected Records",
};

export function activateFit(g: GroundRecord, canActivate: boolean): ActionFit {
  if (g.status === "already_active") return already("Already active; never activated twice.");
  if (g.status !== "awaiting_activation") return blocked(g.reason);
  if (!canActivate) return blocked("Activation needs an active Ground Medical member of this mission.");
  return ok;
}

export function clarifyFit(g: GroundRecord): ActionFit {
  if (g.status === "already_active") return blocked("Already active; nothing to clarify.");
  return ok;
}
