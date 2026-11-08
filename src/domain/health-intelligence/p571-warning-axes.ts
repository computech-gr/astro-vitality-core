/**
 * P57.1 — three independent warning axes for one recorded series (pure, offline, deterministic).
 *
 *   1. Clinical classification  RED | AMBER | NORMAL | NEUTRAL
 *      Taken ONLY from the P57 classification (Researcher-approved, server-attested,
 *      applicable criteria) — never from review flags, data quality, AI or change size.
 *   2. Review priority          HIGH | ROUTINE | NO_FLAG
 *      Triage for Ground Medical / scientific review. Never a clinical result.
 *   3. Data quality             VERIFIED | DATA_QUALITY_WARNING | UNKNOWN
 *      Provenance/measurement checks. VERIFIED is not clinical validation.
 *
 * Rules come from data/scientific/p571-clinical-warning-rules.v1.json. Rules with status
 * PENDING_SCIENTIFIC_APPROVAL are applied only when the caller passes
 * { preview: "proposed-rules" }, and the output then says so. Live callers must not pass it.
 */
import rulesJson from "../../../data/scientific/p571-clinical-warning-rules.v1.json";
import type { CriteriaClassification } from "./p57-reference-criteria";
import type { ReviewFlag } from "./p56-longitudinal-profile";

export type ClinicalClass = "RED" | "AMBER" | "NORMAL" | "NEUTRAL";
export type ReviewPriorityLevel = "HIGH" | "ROUTINE" | "NO_FLAG";
export type DataQualityStatus = "VERIFIED" | "DATA_QUALITY_WARNING" | "UNKNOWN";
export type RuleStatus = "EXISTING_BEHAVIOUR" | "PENDING_SCIENTIFIC_APPROVAL";

export const WARNING_RULES_SCHEMA = "mitochondria.p571-clinical-warning-rules.v1" as const;

interface RuleDef { id: string; status: RuleStatus }
interface RulesFile {
  schema: string;
  axes: Record<"clinicalClassification" | "reviewPriority" | "dataQuality", { rules: RuleDef[] }>;
}

/** Fail-closed: an unreadable rules file leaves only the clinical axis (which needs no rules file). */
export function ruleStatuses(raw: unknown = rulesJson): Map<string, RuleStatus> | null {
  const r = raw as Partial<RulesFile> | null;
  if (!r || r.schema !== WARNING_RULES_SCHEMA || !r.axes) return null;
  const out = new Map<string, RuleStatus>();
  for (const axis of Object.values(r.axes)) {
    for (const x of axis?.rules ?? []) {
      if (typeof x?.id !== "string") return null;
      if (x.status !== "EXISTING_BEHAVIOUR" && x.status !== "PENDING_SCIENTIFIC_APPROVAL") return null;
      out.set(x.id, x.status);
    }
  }
  return out;
}

export interface WarningAxesInput {
  metricId: string;
  /** Unit exactly as recorded on the observation. */
  unit: string;
  /** Unit of the catalog identity (null when the catalog defines none). */
  catalogUnit: string | null;
  valueText: string | null;
  /** P57 classification for this series (null when not evaluated). */
  classification: CriteriaClassification | null;
  /** P56.1 review flags for this series. */
  reviewFlags: readonly ReviewFlag[];
  /** Whether the observation records these facts. Absent = not recorded. Never inferred. */
  recorded?: { specimen?: boolean; method?: boolean };
  differingRepeats?: boolean;
}

export interface AxisResult<T> { value: T; reasons: string[]; ruleIds: string[] }
export interface WarningAxes {
  clinical: AxisResult<ClinicalClass> & { bandLabel: string | null; approvalRefs: string[] };
  review: AxisResult<ReviewPriorityLevel>;
  dataQuality: AxisResult<DataQualityStatus>;
  mode: "live" | "proposed-rules-preview";
  /** Pending rules that WOULD have fired but were not applied (live mode only). */
  pendingNotApplied: string[];
}

const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

export function deriveWarningAxes(input: WarningAxesInput, opts: { preview?: "proposed-rules"; rules?: unknown } = {}): WarningAxes {
  const statuses = ruleStatuses(opts.rules ?? rulesJson);
  const mode = opts.preview === "proposed-rules" ? "proposed-rules-preview" : "live";
  const pendingNotApplied: string[] = [];
  /** A rule may fire if the rules file is valid and it is existing behaviour, or pending in preview mode. */
  const may = (id: string) => {
    const s = statuses?.get(id);
    if (!s) return false;
    if (s === "EXISTING_BEHAVIOUR" || mode === "proposed-rules-preview") return true;
    pendingNotApplied.push(id);
    return false;
  };

  // ---------- axis 1: clinical (P57 classification only)
  const c = input.classification;
  let clinical: WarningAxes["clinical"];
  if (c && c.outcome === "classified" && c.used.length > 0 && c.severity !== "neutral") {
    const value: ClinicalClass = c.severity === "red" ? "RED" : c.severity === "amber" ? "AMBER" : "NORMAL";
    clinical = { value, reasons: [c.explanation], ruleIds: ["CC-1", "CC-6"], bandLabel: c.bandLabel, approvalRefs: c.used.map((u) => u.approvalRef) };
  } else {
    const why = !c ? "Not evaluated against reference criteria." : c.explanation;
    const rule = !c ? "CC-5" : c.outcome === "conflict" ? "CC-2" : c.outcome === "held" ? "CC-3" : "CC-5";
    clinical = { value: "NEUTRAL", reasons: [why], ruleIds: [rule], bandLabel: null, approvalRefs: [] };
  }
  if (input.metricId.startsWith("demo:")) {
    // CC-4: synthetic demonstration identities never carry a clinical colour, whatever was passed in.
    clinical = { value: "NEUTRAL", reasons: ["Synthetic demonstration catalog identity: never clinically classified."], ruleIds: ["CC-4"], bandLabel: null, approvalRefs: [] };
  }

  // ---------- axis 2: review priority (never touches axis 1)
  const rank: Record<ReviewPriorityLevel, number> = { HIGH: 2, ROUTINE: 1, NO_FLAG: 0 };
  let review: AxisResult<ReviewPriorityLevel> = { value: "NO_FLAG", reasons: [], ruleIds: [] };
  const raise = (to: ReviewPriorityLevel, id: string, why: string) => {
    if (!may(id)) return;
    review.ruleIds.push(id);
    review.reasons.push(why);
    if (rank[to] > rank[review.value]) review = { ...review, value: to };
  };
  for (const f of input.reviewFlags.filter((x) => x.kind === "priority_review")) raise("HIGH", "RP-1", `${f.ruleId}: ${f.text}`);
  for (const f of input.reviewFlags.filter((x) => x.kind === "data_quality")) raise("ROUTINE", "RP-2", `${f.ruleId}: ${f.text}`);
  if (clinical.value === "RED") raise("HIGH", "RP-3", "Clinical RED from an approved criterion.");
  if (clinical.value === "AMBER") raise("ROUTINE", "RP-4", "Clinical AMBER from an approved criterion.");
  if (!review.ruleIds.length && may("RP-0")) review = { value: "NO_FLAG", reasons: ["No review rule applies."], ruleIds: ["RP-0"] };

  // ---------- axis 3: data quality (never touches axis 1)
  const warn: string[] = [];
  const warnIds: string[] = [];
  const unknown: string[] = [];
  const unknownIds: string[] = [];
  const add = (list: string[], ids: string[], id: string, why: string) => { if (may(id)) { list.push(why); ids.push(id); } };
  for (const f of input.reviewFlags.filter((x) => x.kind === "data_quality")) add(warn, warnIds, "DQ-1", `${f.ruleId}: ${f.text}`);
  if (input.valueText !== null && !NUMERIC.test(input.valueText.trim())) add(warn, warnIds, "DQ-2", `Recorded value "${input.valueText}" is not a plain number.`);
  if (input.differingRepeats) add(warn, warnIds, "DQ-3", "Repeated readings at one examination differ.");
  if (input.metricId.startsWith("demo:")) add(unknown, unknownIds, "DQ-4", "Synthetic demonstration catalog identity.");
  if (input.catalogUnit === null || input.catalogUnit !== input.unit)
    add(unknown, unknownIds, "DQ-5", input.catalogUnit === null ? "The catalog defines no unit for this identity." : `Recorded unit ${input.unit} differs from catalog unit ${input.catalogUnit}.`);
  if (!input.recorded?.specimen) add(unknown, unknownIds, "DQ-6", "Specimen not recorded.");
  if (!input.recorded?.method) add(unknown, unknownIds, "DQ-6", "Method not recorded.");
  let dataQuality: AxisResult<DataQualityStatus>;
  if (warn.length) dataQuality = { value: "DATA_QUALITY_WARNING", reasons: warn, ruleIds: [...new Set(warnIds)] };
  else if (unknown.length) dataQuality = { value: "UNKNOWN", reasons: unknown, ruleIds: [...new Set(unknownIds)] };
  else if (may("DQ-7")) dataQuality = { value: "VERIFIED", reasons: ["Provenance checks passed (not clinical validation)."], ruleIds: ["DQ-7"] };
  else dataQuality = { value: "UNKNOWN", reasons: ["Data-quality rules not approved; status not assessed."], ruleIds: [] };

  return { clinical, review: { ...review, ruleIds: [...new Set(review.ruleIds)] }, dataQuality, mode, pendingNotApplied: [...new Set(pendingNotApplied)] };
}
