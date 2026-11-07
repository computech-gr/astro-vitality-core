/**
 * P38 bulk SYNTHETIC DEMO preflight (pure, deterministic, browser-safe).
 *
 * Classifies every submitted term of one synthetic mission before any write:
 * already active / already decided, eligible, duplicate, existing handbook or
 * catalog match, ambiguous or missing unit, conflicting canonical identity, or
 * another blocked condition. Display names and domains are only *proposed*
 * from existing repository references (P35.5 draft catalog, P36 source
 * registry, Bone and Cardiovascular handbooks, Nikolas immune/behavioral
 * intakes, P36 review crosswalk) by exact catalog ID or exact normalized name;
 * nothing is fuzzy-matched, converted, merged or invented. Specimen, method,
 * reference intervals and source validation are never proposed.
 */
import p36Registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import p355Catalog from "../../../data/scientific/p355-proposed-domain-catalog.v1.json";
import boneCatalog from "../../../data/scientific/bone-health-handbook-v7.catalog.json";
import cvCatalog from "../../../data/scientific/cardiovascular-handbook.catalog.v1.json";
import nikolasImmune from "../../../data/scientific/nikolas-immune-intake.v1.json";
import nikolasBehavioral from "../../../data/scientific/nikolas-behavioral-intake.v1.json";
import crosswalk from "../../../data/scientific/p36-scientific-review-crosswalk.v1.json";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import { normalizeCatalogText } from "./catalog-lifecycle";
import { classifyWithGovernedExtensions } from "./unknown-biomarker-review";
import type { EvaluatedDemoCatalog } from "./synthetic-demo-catalog";

export const PREFLIGHT_CATEGORIES = [
  "already_active",
  "already_decided",
  "eligible",
  "duplicate",
  "existing_catalog_match",
  "ambiguous_unit",
  "conflicting_identity",
  "blocked",
] as const;
export type PreflightCategory = (typeof PREFLIGHT_CATEGORIES)[number];
export const PREFLIGHT_CATEGORY_LABEL: Record<PreflightCategory, string> = {
  already_active: "Already active",
  already_decided: "Decided · awaiting Ground Medical",
  eligible: "Eligible for synthetic demo decision",
  duplicate: "Duplicate of another submitted term",
  existing_catalog_match: "Existing handbook/catalog match",
  ambiguous_unit: "Ambiguous or missing unit",
  conflicting_identity: "Conflicting canonical identity",
  blocked: "Other blocked condition",
};

export interface PreflightTermInput {
  submissionId: string;
  termId: string;
  receivedSeq: number;
  originalLabels: readonly string[];
  exactUnit: string;
  classification: string;
  candidateMetricIds: readonly string[];
}
export interface PreflightDemoEvent {
  submissionId: string;
  termId: string;
  demoId: string;
  entry: { displayName: string; aliases: readonly string[]; unit: string };
  activationEventId: string | null;
  revocationEventId: string | null;
}
export interface PreflightOverride {
  displayName?: string;
  domain?: HealthDomainId;
}
export interface PreflightOptions {
  /** Latest triage action per `${submissionId}:${termId}`. */
  triage: ReadonlyMap<string, string>;
  /** Owner-authorized demo scope keys `${submissionId}:${termId}` (unknown → empty). */
  scope: ReadonlySet<string>;
  events: readonly PreflightDemoEvent[];
  overrides?: ReadonlyMap<string, PreflightOverride>;
  /** True when the label + exact unit already matches the handbook / governed / production catalog. */
  existingMatch: (label: string, unit: string) => string | null;
}
export interface CatalogReference {
  source: string;
  id: string;
  name: string;
  domain: HealthDomainId;
}
export interface PreflightRow {
  key: string;
  submissionId: string;
  termId: string;
  labels: string[];
  unit: string;
  sourceClassification: string;
  category: PreflightCategory;
  reasons: string[];
  warnings: string[];
  references: CatalogReference[];
  proposedDisplayName: string;
  proposedDomain: HealthDomainId | null;
  displayName: string;
  domain: HealthDomainId | null;
  /** Labels the server will store as aliases (the submitted original labels, never invented). */
  aliases: string[];
  duplicateOf: string | null;
  triageAction: string | null;
  inScope: boolean;
}

export const termKey = (submissionId: string, termId: string) => `${submissionId}:${termId}`;
const n = normalizeCatalogText;

// --- Reference index (exact IDs and exact normalized names only) -------------------
const REGISTRY_DOMAIN: Record<string, HealthDomainId> = {
  bone_health: "bone",
  bone: "bone",
  cardiovascular: "cardiovascular",
  immune: "immune",
  behavioral: "behavioral",
};
type RefList = CatalogReference[];
const byId = new Map<string, CatalogReference>();
const byName = new Map<string, RefList>();
function addRef(r: CatalogReference, name = true) {
  byId.set(n(r.id), r);
  if (!name || !r.name.trim()) return;
  const list = byName.get(n(r.name)) ?? [];
  if (!list.some((x) => x.source === r.source && x.id === r.id)) list.push(r);
  byName.set(n(r.name), list);
}
for (const m of p36Registry.metrics as { id: string; name: string; domain: string }[]) {
  const d = REGISTRY_DOMAIN[m.domain];
  if (d) addRef({ source: "P36 source registry", id: m.id, name: m.name, domain: d });
}
for (const v of boneCatalog.variables as { id: string; name: string }[])
  addRef({ source: "Bone Health Handbook v7", id: v.id, name: v.name, domain: "bone" });
for (const m of cvCatalog.metrics as { id: string; name: string }[])
  addRef({ source: "Cardiovascular Handbook", id: m.id, name: m.name, domain: "cardiovascular" });
for (const e of p355Catalog.entries as { id: string; name: string; domain: string }[]) {
  const d = REGISTRY_DOMAIN[e.domain];
  if (d) addRef({ source: "P35.5 draft catalog", id: e.id, name: e.name, domain: d });
}
for (const e of nikolasImmune.entries as { source_id: string; name: string }[])
  addRef({ source: "Nikolas immune intake", id: e.source_id, name: e.name, domain: "immune" });
for (const e of nikolasBehavioral.entries as { source_id: string; name: string }[])
  addRef({ source: "Nikolas behavioral intake", id: e.source_id, name: e.name, domain: "behavioral" });
const crosswalkByTerm = new Map(
  (
    crosswalk.terms as {
      termId: string;
      p36Ids?: string[];
      p355Ids?: string[];
      boneHandbookIds?: string[];
      nikolasSourceIds?: string[];
    }[]
  ).map((t) => [
    t.termId,
    [
      ...(t.p36Ids ?? []),
      ...(t.p355Ids ?? []),
      ...(t.boneHandbookIds ?? []),
      ...(t.nikolasSourceIds ?? []),
    ],
  ]),
);

/** Existing references for one submitted term: candidate IDs, label-as-ID, exact name, crosswalk. */
export function referencesFor(t: PreflightTermInput): CatalogReference[] {
  const out: CatalogReference[] = [];
  const push = (r: CatalogReference | undefined) => {
    if (r && !out.some((x) => x.source === r.source && x.id === r.id)) out.push(r);
  };
  for (const id of t.candidateMetricIds) push(byId.get(n(id)));
  for (const id of crosswalkByTerm.get(t.termId) ?? []) push(byId.get(n(id)));
  for (const label of t.originalLabels) {
    push(byId.get(n(label)));
    for (const r of byName.get(n(label)) ?? []) push(r);
  }
  return out;
}

const P355_ID = /^(IMM|BSC)-\d{3}$/i;
/** Proposed display name: the P35.5 draft name for a bare catalog code, otherwise the submitted label verbatim. */
export function proposedDisplayName(t: PreflightTermInput, refs: readonly CatalogReference[]) {
  const label = (t.originalLabels[0] ?? "").trim();
  if (P355_ID.test(label)) {
    const r = refs.find((x) => x.source === "P35.5 draft catalog" && n(x.id) === n(label));
    if (r) return r.name.trim();
  }
  return label;
}

/** Literal unit text that names alternatives or no unit at all; never normalized or converted. */
export function ambiguousUnitReason(unit: string): string | null {
  const u = unit.trim();
  if (!u) return "No exact unit was submitted.";
  if (/\s(ή|or)\s/i.test(u)) return `Alternative units "${u}"; units are never chosen or converted.`;
  if (/[,;|]/.test(u) || /\s\/\s/.test(u)) return `Alternative units "${u}".`;
  if (/(assay|model)-specific/i.test(u)) return `The unit "${u}" is not specified.`;
  if (/^[a-z]+s\/[a-z]+s$/i.test(u)) return `Alternative units "${u}".`;
  return null;
}

const demoKeys = (displayName: string, aliases: readonly string[], unit: string) =>
  [...new Set([displayName, ...aliases].filter((a) => a.trim()).map((a) => `${n(a)}|${unit.trim()}`))];

const DOMAINS: readonly HealthDomainId[] = ["bone", "immune", "cardiovascular", "behavioral"];

/** Deterministic preflight of every submitted term (order: received sequence, then term ID). */
export function buildBulkDemoPreflight(
  terms: readonly PreflightTermInput[],
  o: PreflightOptions,
): PreflightRow[] {
  const sorted = [...terms].sort(
    (a, b) => a.receivedSeq - b.receivedSeq || a.termId.localeCompare(b.termId),
  );
  const eventByTerm = new Map(o.events.map((e) => [termKey(e.submissionId, e.termId), e]));
  // Keys owned by recorded (decided or active, not revoked) demo entries.
  const claimed = new Map<string, string>();
  for (const e of o.events)
    if (!e.revocationEventId)
      for (const k of demoKeys(e.entry.displayName, e.entry.aliases, e.entry.unit))
        claimed.set(k, e.termId);
  const seenTerm = new Map<string, string>();
  for (const e of o.events) seenTerm.set(e.termId, termKey(e.submissionId, e.termId));

  const rows: PreflightRow[] = [];
  for (const t of sorted) {
    const key = termKey(t.submissionId, t.termId);
    const labels = t.originalLabels.map((l) => l.trim()).filter(Boolean);
    const unit = t.exactUnit.trim();
    const refs = referencesFor(t);
    const refDomains = [...new Set(refs.map((r) => r.domain))];
    const proposedName = proposedDisplayName(t, refs);
    const proposedDomain = refDomains.length === 1 ? refDomains[0]! : null;
    const ov = o.overrides?.get(key);
    const displayName = (ov?.displayName ?? proposedName).trim();
    const domain = ov?.domain ?? proposedDomain;
    const triageAction = o.triage.get(key) ?? null;
    const row: PreflightRow = {
      key,
      submissionId: t.submissionId,
      termId: t.termId,
      labels,
      unit,
      sourceClassification: t.classification,
      category: "eligible",
      reasons: [],
      warnings: [],
      references: refs,
      proposedDisplayName: proposedName,
      proposedDomain,
      displayName,
      domain,
      aliases: [...new Set(labels)].sort(),
      duplicateOf: null,
      triageAction,
      inScope: o.scope.has(key),
    };
    rows.push(row);
    const block = (c: PreflightCategory, reason: string) => {
      row.category = c;
      row.reasons.push(reason);
    };
    const ev = eventByTerm.get(key);
    if (ev) {
      if (ev.revocationEventId)
        block("blocked", "This demo entry was revoked; a revoked term needs a new submission.");
      else if (ev.activationEventId)
        block("already_active", `Active as ${ev.demoId}; it is skipped and never processed again.`);
      else block("already_decided", "A synthetic demo decision exists; Ground Medical activates it.");
      continue;
    }
    if (!labels.length) {
      block("blocked", "The submitted term has no observed label.");
      continue;
    }
    const unitProblem = ambiguousUnitReason(unit);
    if (unitProblem) {
      block("ambiguous_unit", unitProblem);
      continue;
    }
    const existing = labels.map((l) => o.existingMatch(l, unit)).find((m) => m) ?? null;
    if (existing) {
      block(
        "existing_catalog_match",
        `Already recognized by ${existing} with this exact unit; a demo entry would never apply.`,
      );
      continue;
    }
    if (triageAction && triageAction !== "ACCEPT_FOR_REVIEW") {
      block("blocked", `Triage recorded ${triageAction}; only accepted terms may receive a decision.`);
      continue;
    }
    if (refDomains.length > 1 && !ov?.domain) {
      block(
        "conflicting_identity",
        `Existing references disagree on the domain (${refs.map((r) => `${r.id} → ${r.domain}`).join(", ")}). Choose the domain explicitly.`,
      );
      continue;
    }
    const earlier = seenTerm.get(t.termId);
    if (earlier && earlier !== key) {
      row.duplicateOf = earlier.split(":")[1] ?? earlier;
      block("duplicate", `The same term was already submitted (${earlier}).`);
      continue;
    }
    const keys = demoKeys(displayName || labels[0]!, labels, unit);
    const clash = keys.map((k) => claimed.get(k)).find((v) => v && v !== t.termId);
    if (clash) {
      row.duplicateOf = clash;
      block(
        "duplicate",
        `Same label and exact unit as ${clash}; incompatible or repeated terms are never merged.`,
      );
      continue;
    }
    seenTerm.set(t.termId, key);
    for (const k of keys) claimed.set(k, t.termId);
    if (displayName.length < 3 || displayName.length > 120)
      block("blocked", "The display name must be 3 to 120 characters; edit it to continue.");
    else if (!domain || !DOMAINS.includes(domain))
      block(
        "blocked",
        "No existing catalog reference names a domain for this term; choose the domain explicitly.",
      );
    if (refDomains.length > 1 && ov?.domain)
      row.warnings.push(`References disagreed on the domain; the Researcher chose ${ov.domain}.`);
    if (t.classification === "source_unvalidated")
      row.warnings.push(
        "The submitted document marked this row unvalidated: later rows still marked unvalidated stay review-only.",
      );
    if (t.classification === "unit_review_required")
      row.warnings.push(
        `Handbook candidate ${t.candidateMetricIds.join(", ") || "entry"} has no validated unit; the demo entry matches ${unit} only.`,
      );
    if (!row.inScope && row.category === "eligible")
      row.warnings.push("Not yet in the owner-authorized synthetic demo scope.");
  }
  return rows;
}

export function preflightCounts(rows: readonly PreflightRow[]) {
  const counts = Object.fromEntries(PREFLIGHT_CATEGORIES.map((c) => [c, 0])) as Record<
    PreflightCategory,
    number
  >;
  for (const r of rows) counts[r.category]++;
  return {
    total: rows.length,
    ...counts,
    blockedTotal:
      counts.duplicate +
      counts.existing_catalog_match +
      counts.ambiguous_unit +
      counts.conflicting_identity +
      counts.blocked,
  };
}

/** Terms that become eligible only after the Researcher chooses a domain (no reference names one). */
export const needsDomainChoice = (r: PreflightRow) =>
  r.category === "blocked" && r.reasons.some((x) => x.startsWith("No existing catalog reference"));

/**
 * Existing-match probe: the handbook, governed extensions and the verified
 * production catalog only (synthetic demo catalogs deliberately excluded).
 */
export function catalogExistingMatch(missionId: string) {
  const noDemo = new Map<string, EvaluatedDemoCatalog>();
  return (label: string, unit: string): string | null => {
    const r = classifyWithGovernedExtensions(
      { label, unit, provenance: "synthetic", missionId },
      undefined,
      undefined,
      noDemo,
    );
    return r.classification.status === "matched" ? r.classification.metricId : null;
  };
}
