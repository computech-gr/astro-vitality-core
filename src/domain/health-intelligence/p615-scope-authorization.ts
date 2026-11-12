/**
 * P61.5 Researcher SYNTHETIC DEMO scope authorization and identity review (pure,
 * browser-safe). Mirrors — never replaces — the database checks staged in
 * supabase/pending/20261112000000_p615_researcher_demo_scope.sql, which re-run
 * on every write: Researcher capability, mission, synthetic provenance,
 * submission membership, review acceptance, exact unambiguous unit, no
 * duplicate scope entry.
 *
 * Identity review: a submitted term whose label shares its significant words
 * with an ACTIVE demo entry is surfaced as a POSSIBLE existing biomarker. This
 * is a prompt for human review only: names are never equated by text, nothing
 * is merged, and units are never converted. With the identical exact unit the
 * Researcher may record an alias decision (Ground Medical activates it) or
 * confirm a distinct measurement for this session; until then the term cannot
 * receive an independent demo decision.
 */
import type { ActionFit } from "./p55-bulk-selection-engine";
import { ambiguousUnitReason, type PreflightRow } from "./p38-bulk-demo-preflight";

export const P615_RULES_VERSION = "mitochondria.p615-researcher-demo-scope.v1" as const;

const ok: ActionFit = { kind: "actionable" };
const already = (reason: string): ActionFit => ({ kind: "already", reason });
const blocked = (reason: string): ActionFit => ({ kind: "blocked", reason });

/** Researcher authorization of one submitted term for the mission's synthetic demo scope. */
export function scopeAuthorizationFit(
  r: Pick<PreflightRow, "inScope" | "triageAction" | "unit" | "category"> & {
    sourceProvenance?: string;
  },
  ctx: { canAuthorize: boolean; submittedByCaller: boolean; installed: boolean },
): ActionFit {
  if (r.inScope) return already("Already in the synthetic demo scope.");
  if (r.sourceProvenance && r.sourceProvenance !== "synthetic")
    return blocked("Only synthetic submissions may enter the synthetic demo scope.");
  if (r.triageAction !== "ACCEPT_FOR_REVIEW")
    return blocked("Accept it for scientific review first.");
  const unitProblem = ambiguousUnitReason(r.unit);
  if (unitProblem) return blocked(unitProblem);
  if (r.category === "duplicate")
    return blocked("Duplicate of another submitted term with the same label and unit.");
  if (ctx.submittedByCaller)
    return blocked("You submitted this term; an independent Researcher must authorize it.");
  if (!ctx.installed)
    return blocked("Researcher authorization is not installed yet (owner-approved database change pending).");
  if (!ctx.canAuthorize) return blocked("This account has no Researcher (scientific approver) grant.");
  return ok;
}

// --- Possible existing biomarker identities -------------------------------------------------

/** Specimen/presentation words that never distinguish the analyte in this comparison. */
const STOP = new Set([
  "serum", "plasma", "blood", "whole", "total", "level", "levels", "concentration", "the", "of",
  "and", "intact", "test", "value", "s", "α", "β", "γ", "δ",
]);
export function significantTokens(label: string): Set<string> {
  const t = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w));
  return new Set(t);
}
const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface DemoIdentity {
  demoId: string;
  termId: string;
  displayName: string;
  aliases: readonly string[];
  unit: string;
}
export interface PossibleMatch {
  demoId: string;
  displayName: string;
  unit: string;
  /** Identical exact unit: an alias decision is possible. Otherwise review only. */
  sameUnit: boolean;
}

/**
 * Active demo entries whose display name or alias shares all significant words
 * with a submitted label (either direction). Exact same label is excluded: the
 * existing preflight already treats it as already active / duplicate.
 */
export function possibleExistingMatches(
  t: { termId: string; labels: readonly string[]; unit: string },
  active: readonly DemoIdentity[],
): PossibleMatch[] {
  const out = new Map<string, PossibleMatch>();
  const labelTokens = t.labels.map(significantTokens).filter((s) => s.size);
  for (const e of active) {
    if (e.termId === t.termId) continue;
    const names = [e.displayName, ...e.aliases];
    if (names.some((n) => t.labels.some((l) => norm(l) === norm(n)))) continue;
    const hit = names
      .map(significantTokens)
      .filter((s) => s.size)
      .some((n) => labelTokens.some((l) => subset(l, n) || subset(n, l)));
    if (hit)
      out.set(e.demoId, {
        demoId: e.demoId,
        displayName: e.displayName,
        unit: e.unit,
        sameUnit: e.unit.trim() === t.unit.trim(),
      });
  }
  return [...out.values()].sort((a, b) => Number(b.sameUnit) - Number(a.sameUnit) || a.demoId.localeCompare(b.demoId));
}

/**
 * Identity gate before an independent synthetic demo decision: null when the
 * term may be decided, otherwise the reason it stays pending identity review.
 */
export function identityReviewBlock(ctx: {
  matches: readonly PossibleMatch[];
  aliasDecided: boolean;
  confirmedDistinct: boolean;
}): string | null {
  if (ctx.aliasDecided)
    return "An alias decision to an existing demo biomarker was recorded; no independent decision is needed.";
  const same = ctx.matches.filter((m) => m.sameUnit);
  if (same.length && !ctx.confirmedDistinct)
    return `Possible existing demo biomarker ${same.map((m) => `"${m.displayName}" (${m.unit})`).join(", ")} with the same exact unit: review the identity first (record an alias or confirm a distinct measurement).`;
  return null;
}

/** Alias decision prerequisites mirrored from the database (which re-checks all of them). */
export function aliasDecisionFit(
  r: Pick<PreflightRow, "inScope" | "triageAction" | "unit" | "category">,
  ctx: {
    target: PossibleMatch | null;
    canAuthorize: boolean;
    submittedByCaller: boolean;
    aliasDecided: boolean;
    installed: boolean;
  },
): ActionFit {
  if (ctx.aliasDecided) return already("An alias decision already exists for this term.");
  if (r.category === "already_active" || r.category === "already_decided")
    return blocked("This term already has an independent synthetic demo decision.");
  if (!r.inScope) return blocked("Authorize it for the synthetic demo scope first.");
  if (r.triageAction !== "ACCEPT_FOR_REVIEW") return blocked("Accept it for scientific review first.");
  const unitProblem = ambiguousUnitReason(r.unit);
  if (unitProblem) return blocked(unitProblem);
  if (!ctx.target) return blocked("Choose one active demo biomarker as the alias target.");
  if (!ctx.target.sameUnit)
    return blocked("The target uses a different unit; units are never converted, so no alias is possible.");
  if (ctx.submittedByCaller)
    return blocked("You submitted this term; an independent Researcher must decide it.");
  if (!ctx.installed)
    return blocked("Alias decisions are not installed yet (owner-approved database change pending).");
  if (!ctx.canAuthorize) return blocked("This account has no Researcher (scientific approver) grant.");
  return ok;
}
