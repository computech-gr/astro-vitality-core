/**
 * P61.3 mapping decision register (data/scientific/p613-mapping-decision-register.v1.json): display-only,
 * Researcher-reviewable record of how each incoming name + exact unit of the owner's synthetic examinations is
 * (or is not) mapped. It never changes classification, never approves and is never written by the app; any
 * structural defect, or any entry that claims an approval, disables the whole register.
 */
import raw from "../../../data/scientific/p613-mapping-decision-register.v1.json";
import { normalizeCatalogText } from "./catalog-lifecycle";

export const P613_REGISTER_SCHEMA = "mitochondria.p613-mapping-decision-register.v1";
export const MAPPING_CATEGORIES = [
  "SAFE_DETERMINISTIC_NORMALIZATION",
  "EXISTING_IDENTITY_REQUIRES_ALIAS_APPROVAL",
  "MISSING_CANONICAL_DEFINITION",
  "AMBIGUOUS_SPECIMEN_OR_METHOD",
  "INSUFFICIENT_SOURCE_EVIDENCE",
  "PROVISIONAL_SYNTHETIC_ALIAS",
] as const;
export type MappingCategory = (typeof MAPPING_CATEGORIES)[number];
export const MAPPING_CATEGORY_LABELS: Record<MappingCategory, string> = {
  SAFE_DETERMINISTIC_NORMALIZATION: "Safe deterministic unit-notation normalization",
  EXISTING_IDENTITY_REQUIRES_ALIAS_APPROVAL: "Existing catalog identity — alias needs Researcher approval",
  MISSING_CANONICAL_DEFINITION: "No catalog definition exists",
  AMBIGUOUS_SPECIMEN_OR_METHOD: "Ambiguous specimen, definition or method",
  INSUFFICIENT_SOURCE_EVIDENCE: "Insufficient source evidence",
  PROVISIONAL_SYNTHETIC_ALIAS: "Provisional synthetic alias (P61.2)",
};
const APPROVAL_STATUSES = new Set(["PENDING_RESEARCHER_REVIEW", "PENDING_RESEARCHER_CONFIRMATION"]);
const SOURCES = new Set(["production-p36", "synthetic-demo", "none"]);
const DOMAINS = new Set(["bone", "immune", "cardiovascular", "behavioral"]);
/** Only these categories may be applied (everything else stays held in the exception queue). */
const APPLICABLE = new Set<MappingCategory>(["SAFE_DETERMINISTIC_NORMALIZATION", "PROVISIONAL_SYNTHETIC_ALIAS"]);

export interface MappingDecision {
  id: string;
  label: string;
  reportedUnit: string;
  fixtureRows: number;
  categories: MappingCategory[];
  applied: boolean;
  unitNotationRules?: string[];
  proposal: { catalogId: string | null; catalogName: string; catalogUnit: string; catalogSource: "production-p36" | "synthetic-demo" | "none"; domain: string | null };
  verification: { specimen: string; method: string; unit: string; domain: string };
  evidence: string[];
  uncertainty: string[];
  approval: { status: string; requiredRole: "researcher"; path: string; approvedBy: null; approvedAt: null };
}

const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export function validateMappingDecisionRegister(input: unknown): MappingDecision[] | null {
  const r = input as { schema?: unknown; decisions?: unknown } | null;
  if (!r || r.schema !== P613_REGISTER_SCHEMA || !Array.isArray(r.decisions)) return null;
  const seen = new Set<string>();
  const out: MappingDecision[] = [];
  for (const d of r.decisions as MappingDecision[]) {
    if (!d || !str(d.id) || !str(d.label) || !str(d.reportedUnit) || !Number.isInteger(d.fixtureRows)) return null;
    if (!Array.isArray(d.categories) || !d.categories.length || d.categories.some((c) => !(MAPPING_CATEGORIES as readonly string[]).includes(c))) return null;
    if (typeof d.applied !== "boolean" || (d.applied && !APPLICABLE.has(d.categories[0]!))) return null;
    if (d.categories.includes("SAFE_DETERMINISTIC_NORMALIZATION") && !d.unitNotationRules?.length) return null;
    const p = d.proposal;
    if (!p || !str(p.catalogName) || !str(p.catalogUnit) || !SOURCES.has(p.catalogSource)) return null;
    if ((p.catalogSource === "none") !== (p.catalogId === null)) return null;
    if (p.domain !== null && !DOMAINS.has(p.domain)) return null;
    if (d.applied && (p.catalogSource !== "synthetic-demo" || !p.catalogId)) return null;
    const v = d.verification;
    if (!v || !str(v.specimen) || !str(v.method) || !str(v.unit) || !str(v.domain)) return null;
    if (!Array.isArray(d.evidence) || !d.evidence.length || !Array.isArray(d.uncertainty)) return null;
    // The register can never carry an approval: approvals live only in the governed registries / ledgers.
    const a = d.approval;
    if (!a || !APPROVAL_STATUSES.has(a.status) || a.requiredRole !== "researcher" || !str(a.path) || a.approvedBy !== null || a.approvedAt !== null) return null;
    const key = `${normalizeCatalogText(d.label)}\u0000${d.reportedUnit}`;
    if (seen.has(key)) return null;
    seen.add(key);
    out.push(d);
  }
  return out;
}

export const MAPPING_DECISIONS = validateMappingDecisionRegister(raw);

/** The register entry for an incoming name + exact reported unit, or null. Display only. */
export function mappingDecisionFor(label: string, unit: string, register: readonly MappingDecision[] | null = MAPPING_DECISIONS): MappingDecision | null {
  if (!register) return null;
  const k = normalizeCatalogText(label);
  return register.find((d) => normalizeCatalogText(d.label) === k && d.reportedUnit === unit.trim()) ?? null;
}
