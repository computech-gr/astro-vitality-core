/**
 * P56 — health pattern library (browser-safe, pure).
 *
 * Groups biologically related biomarkers by EXACT catalog ID (handbook,
 * domain-catalog or mission synthetic-demo term ID) so the assessment can
 * explain them together. The library never classifies a value: severity
 * comes only from the verified-reference registry (biomarker-health-assessment.ts).
 * Membership is never widened by label or synonym matching.
 */
import libraryJson from "../../../data/scientific/p56-health-pattern-library.v1.json";

export const PATTERN_LIBRARY_SCHEMA = "mitochondria.p56-health-pattern-library.v1" as const;

export type RecommendationCategory =
  | "physical_activity"
  | "nutrition"
  | "hydration"
  | "sleep"
  | "recovery"
  | "monitoring"
  | "further_examination"
  | "ground_medical";
export const RECOMMENDATION_CATEGORIES: readonly RecommendationCategory[] = [
  "physical_activity",
  "nutrition",
  "hydration",
  "sleep",
  "recovery",
  "monitoring",
  "further_examination",
  "ground_medical",
];
export const RECOMMENDATION_CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  physical_activity: "Physical activity",
  nutrition: "Nutrition",
  hydration: "Hydration",
  sleep: "Sleep",
  recovery: "Recovery",
  monitoring: "Monitoring",
  further_examination: "Further examination",
  ground_medical: "Ground Medical follow-up",
};
export type RecommendationAuthorization = "general_wellness" | "clinician_required";
export const AUTHORIZATION_LABELS: Record<RecommendationAuthorization, string> = {
  general_wellness: "General wellness guidance",
  clinician_required: "Requires Ground Medical authorization",
};

export interface LibraryRecommendation {
  category: RecommendationCategory;
  authorization: RecommendationAuthorization;
  text: string;
}
export interface PatternMember {
  id: string;
  name: string;
  role: string;
}
export interface HealthPattern {
  id: string;
  title: string;
  area: string;
  relationship: string;
  spaceflightContext: string;
  handbookIds: string[];
  members: PatternMember[];
  keyEvidence: { label: string; ids: string[] }[];
  conditions: { name: string; requires: string }[];
  recommendations: { concern: LibraryRecommendation[]; change: LibraryRecommendation[] };
}
export interface PatternLibrary {
  schema: typeof PATTERN_LIBRARY_SCHEMA;
  version: number;
  status: string;
  patterns: HealthPattern[];
  excluded: { id: string; reason: string }[];
}

/** Treatment/dose language is never allowed in library text (clinician authorization only). */
const DOSE = /\b\d+(?:\.\d+)?\s*(?:mg|µg|μg|mcg|iu|g|ml|mmol)\b|\bdose of\b|\btake \d/i;
const filled = (s: unknown, min = 1): s is string => typeof s === "string" && s.trim().length >= min;

function patternProblem(p: Partial<HealthPattern>, seen: Set<string>): string | null {
  if (!filled(p.id) || !filled(p.title, 3) || !filled(p.area, 3)) return "missing id, title or area";
  if (!filled(p.relationship, 40) || !filled(p.spaceflightContext, 20)) return "relationship or spaceflight context not explained";
  if (!Array.isArray(p.members) || p.members.length < 2) return "fewer than two members";
  for (const m of p.members) {
    if (!filled(m?.id) || !filled(m?.name) || !filled(m?.role)) return "member without exact id, name or role";
    if (seen.has(m.id)) return `member ${m.id} belongs to more than one pattern`;
  }
  const ids = new Set(p.members.map((m) => m.id));
  if (!Array.isArray(p.keyEvidence) || p.keyEvidence.some((k) => !filled(k?.label) || !Array.isArray(k.ids) || !k.ids.length || k.ids.some((id) => !ids.has(id))))
    return "key evidence references a non-member";
  if (!Array.isArray(p.conditions) || p.conditions.some((c) => !filled(c?.name) || !filled(c?.requires, 10))) return "condition without requirements";
  const recs = [...(p.recommendations?.concern ?? []), ...(p.recommendations?.change ?? [])];
  for (const r of recs) {
    if (!(RECOMMENDATION_CATEGORIES as readonly unknown[]).includes(r?.category)) return "unknown recommendation category";
    if (r.authorization !== "general_wellness" && r.authorization !== "clinician_required") return "recommendation authorization missing";
    if (!filled(r.text, 20)) return "recommendation text missing";
    if (DOSE.test(r.text)) return "recommendation contains a dose or amount";
  }
  if (!p.recommendations?.concern?.length || !p.recommendations?.change?.length) return "recommendations missing";
  return null;
}

/** Fail-closed validation: a malformed pattern is excluded with a reason, never repaired. */
export function validatePatternLibrary(raw: unknown): PatternLibrary {
  const r = raw as { schema?: unknown; version?: unknown; status?: unknown; patterns?: unknown } | null;
  if (!r || r.schema !== PATTERN_LIBRARY_SCHEMA || !Array.isArray(r.patterns))
    return { schema: PATTERN_LIBRARY_SCHEMA, version: 0, status: "INVALID", patterns: [], excluded: [{ id: "*", reason: "library schema invalid" }] };
  const seen = new Set<string>();
  const patterns: HealthPattern[] = [];
  const excluded: PatternLibrary["excluded"] = [];
  for (const p of r.patterns as Partial<HealthPattern>[]) {
    const problem = patternProblem(p ?? {}, seen);
    if (problem || patterns.some((x) => x.id === p.id)) {
      excluded.push({ id: filled(p?.id) ? p!.id! : "?", reason: problem ?? "duplicate id" });
      continue;
    }
    for (const m of p.members!) seen.add(m.id);
    patterns.push(p as HealthPattern);
  }
  return { schema: PATTERN_LIBRARY_SCHEMA, version: typeof r.version === "number" ? r.version : 0, status: typeof r.status === "string" ? r.status : "UNKNOWN", patterns, excluded };
}

let bundled: PatternLibrary | null = null;
export function bundledPatternLibrary(): PatternLibrary {
  if (!bundled) bundled = validatePatternLibrary(libraryJson);
  return bundled;
}
