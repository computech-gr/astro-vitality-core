/**
 * P59 — PROVISIONAL literature interpretation for SYNTHETIC demonstration reports (pure).
 *
 * Separate from, and never merged with, approved P54/P57 classification:
 *  - runs only when mode === "synthetic-demonstration" AND provenance === "synthetic";
 *  - output status is always "PROVISIONAL" (or INTERPRETATION_ONLY / NOT_APPLICABLE / DISABLED), never "classified";
 *  - binds exact catalog ID + exact unit (or a Researcher-curated demo alias); never converts units;
 *  - lists every unrecorded applicability condition instead of assuming it;
 *  - criteria in excluded concepts or below the allowed verification tiers never colour a result.
 */
import provisionalJson from "../../../data/scientific/p59-provisional-literature-criteria.v1.json";
import { bundledCriteriaRegistry, inBand, validateCriteriaRegistry, bandRangeText, type CriteriaRegistry, type ReferenceCriterion } from "./p57-reference-criteria";

export const PROVISIONAL_LABEL = "Provisional literature interpretation — synthetic demonstration only; not an approved clinical classification";
export const ALLOWED_TIERS = ["PRIMARY", "ARCHIVED_PRIMARY", "FULL_TEXT_MIRROR", "PEER_REVIEWED_REFERENCE"] as const;

export interface ProvisionalContext {
  metricId: string;
  unit: string;
  value: string | null;
  provenance: "synthetic" | "real";
  mode: "off" | "synthetic-demonstration";
  observationConditions?: readonly string[];
  missionConditions?: readonly string[];
  /** Mission of the observation; required for an alias to apply. */
  missionId?: string;
  /** A hold (e.g. measurement-consistency check) suppresses any provisional colour. */
  holds?: readonly string[];
}
export interface ProvisionalResult {
  status: "DISABLED" | "NO_CRITERION" | "INTERPRETATION_ONLY" | "HELD" | "OUTSIDE_BANDS" | "CONFLICT" | "PROVISIONAL";
  severity: "red" | "amber" | "normal" | "neutral";
  label: string;
  bandLabel: string | null;
  rangeText: string | null;
  unmetConditions: string[];
  criterionIds: string[];
  sourceIds: string[];
}

/**
 * Researcher-approved alias. Target is an exact catalog ID ("cv-070") or a criterion-scoped
 * identity ("criterion:p59-nihods-25ohd") for criteria whose concept has no catalog unit.
 * An alias applies only to the named synthetic mission and the exact unit. Legacy string values
 * are accepted only in tests; the shipped registry contains no aliases.
 */
export interface DemoAlias { target: string; unit: string; missionId: string; approvedBy: string; approvedAt: string; registerRef: string }
interface ProvisionalFile { includeLiveCandidates?: string[]; demoAliases?: { map: Record<string, string | DemoAlias> } }
let cache: { reg: CriteriaRegistry; extra: ProvisionalFile; tiers: Map<string, string> } | null = null;
export function provisionalRegistry(raw: unknown = provisionalJson) {
  if (raw === provisionalJson && cache) return cache;
  const reg = validateCriteriaRegistry(raw);
  const live = bundledCriteriaRegistry();
  const extra = raw as ProvisionalFile;
  const liveIncluded = live.criteria.filter((c) => (extra.includeLiveCandidates ?? []).includes(c.id));
  const tiers = new Map<string, string>();
  for (const c of (raw as { criteria?: { id: string; verificationTier?: string }[] }).criteria ?? []) tiers.set(c.id, c.verificationTier ?? "UNKNOWN");
  for (const c of liveIncluded) tiers.set(c.id, "PRIMARY");
  const out = { reg: { ...reg, criteria: [...reg.criteria, ...liveIncluded], sources: [...reg.sources, ...live.sources] }, extra, tiers };
  if (raw === provisionalJson) cache = out;
  return out;
}

/** Resolve an observation identity to provisional candidates (exact ID, or an applicable Researcher-approved alias). */
function candidatesFor(metricId: string, unit: string, missionId: string | undefined, reg: CriteriaRegistry, extra: ProvisionalFile): ReferenceCriterion[] {
  const a = extra.demoAliases?.map?.[metricId];
  let target = metricId;
  if (typeof a === "string") target = a;
  else if (a) {
    const ok = a.unit === unit && Boolean(missionId) && a.missionId === missionId && a.approvedBy.trim().length > 0 && a.approvedAt.trim().length > 0;
    if (!ok) return [];
    target = a.target;
  }
  if (target.startsWith("criterion:")) {
    const c = reg.criteria.find((x) => x.id === target.slice("criterion:".length));
    return c && c.identity.unit === unit ? [c] : [];
  }
  return reg.criteria.filter((c) => c.identity.catalogId === target && c.identity.unit === unit);
}

/** Provisional reference bands for charts (same gate and identity rules as the interpretation). */
export function provisionalBandsFor(ctx: Pick<ProvisionalContext, "metricId" | "unit" | "provenance" | "mode" | "missionId">, raw: unknown = provisionalJson): { criterionId: string; lower: number | null; upper: number | null; severity: string; label: string }[] {
  if (ctx.mode !== "synthetic-demonstration" || ctx.provenance !== "synthetic") return [];
  const { reg, extra, tiers } = provisionalRegistry(raw);
  return candidatesFor(ctx.metricId, ctx.unit, ctx.missionId, reg, extra)
    .filter((c) => (ALLOWED_TIERS as readonly string[]).includes(tiers.get(c.id) ?? ""))
    .flatMap((c) => c.bands.map((b) => ({ criterionId: c.id, lower: b.lower, upper: b.upper, severity: b.severity, label: `${b.label}: ${bandRangeText(b, c.identity.unit)}` })));
}

const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const off = (status: ProvisionalResult["status"], label: string): ProvisionalResult => ({ status, severity: "neutral", label, bandLabel: null, rangeText: null, unmetConditions: [], criterionIds: [], sourceIds: [] });

export function provisionalInterpretation(ctx: ProvisionalContext, raw: unknown = provisionalJson): ProvisionalResult {
  if (ctx.mode !== "synthetic-demonstration" || ctx.provenance !== "synthetic") return off("DISABLED", "Provisional interpretation is available only for synthetic demonstration reports.");
  const { reg, extra, tiers } = provisionalRegistry(raw);
  const cands = candidatesFor(ctx.metricId, ctx.unit, ctx.missionId, reg, extra);
  if (!cands.length) return off("NO_CRITERION", "No provisional literature criterion for this exact identity and unit.");
  const usable = cands.filter((c) => (ALLOWED_TIERS as readonly string[]).includes(tiers.get(c.id) ?? ""));
  if (!usable.length) return off("INTERPRETATION_ONLY", "Only lower-tier sources exist; shown without colour.");
  if (ctx.holds?.length) return { ...off("HELD", `Held: ${ctx.holds.join("; ")}`), criterionIds: usable.map((c) => c.id) };
  const t = ctx.value?.trim() ?? "";
  if (!NUMERIC.test(t)) return off("INTERPRETATION_ONLY", "Value is not a plain number.");
  const v = Number(t);
  const hits = usable.flatMap((c) => c.bands.filter((b) => inBand(b, v)).map((b) => ({ c, b })));
  const unmet = (c: ReferenceCriterion) => [
    ...c.applicability.missionLevel.filter((x) => !(ctx.missionConditions ?? []).includes(x.id)).map((x) => x.text),
    ...c.applicability.perObservation.filter((x) => !(ctx.observationConditions ?? []).includes(x.id)).map((x) => x.text),
  ];
  if (!hits.length) return { ...off("OUTSIDE_BANDS", "Outside the bands of the provisional criteria; no category."), criterionIds: usable.map((c) => c.id) };
  const sev = new Set(hits.map((h) => (h.b.severity === "none" ? "neutral" : h.b.severity)));
  if (sev.size > 1) return { ...off("CONFLICT", "Provisional criteria disagree; not reconciled."), criterionIds: hits.map((h) => h.c.id) };
  const h = hits[0]!;
  return {
    status: "PROVISIONAL",
    severity: [...sev][0] as ProvisionalResult["severity"],
    label: PROVISIONAL_LABEL,
    bandLabel: h.b.label,
    rangeText: bandRangeText(h.b, h.c.identity.unit),
    unmetConditions: [...new Set(hits.flatMap((x) => unmet(x.c)))],
    criterionIds: [...new Set(hits.map((x) => x.c.id))],
    sourceIds: [...new Set(hits.map((x) => x.c.source.sourceId))],
  };
}
