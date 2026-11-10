/**
 * P61.2 owner-directed synthetic intake aliases (data/scientific/p612-synthetic-intake-aliases.v1.json).
 * Pure and fail-closed: an alias only points an incoming label at an ACTIVE entry of the same mission's
 * verified SYNTHETIC DEMO catalog with the identical unit, display name and domain. It never converts a unit,
 * never applies to real data and is not scientific approval (status stays pending Researcher review).
 */
import register from "../../../data/scientific/p612-synthetic-intake-aliases.v1.json";
import { normalizeCatalogText } from "./catalog-lifecycle";
import type { EvaluatedDemoCatalog, SyntheticDemoEntry } from "./synthetic-demo-catalog";

export const P612_ALIAS_SCHEMA = "mitochondria.p612-synthetic-intake-aliases.v1";
export const P612_ALIAS_STATUS = "OWNER_DIRECTED_SYNTHETIC_ONLY_PENDING_RESEARCHER_REVIEW";
const DOMAINS = new Set(["bone", "immune", "cardiovascular", "behavioral"]);
const BASES = new Set(["abbreviation", "word-order"]);

export interface SyntheticIntakeAlias {
  alias: string;
  unit: string;
  demoId: string;
  targetDisplayName: string;
  domain: string;
  basis: string;
  evidence: string;
}
export interface SyntheticIntakeAliasRegister {
  missionId: string;
  aliases: SyntheticIntakeAlias[];
}

/** Structural validation; any defect disables the whole register. */
export function validateSyntheticIntakeAliasRegister(raw: unknown): SyntheticIntakeAliasRegister | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || r.schema !== P612_ALIAS_SCHEMA || r.status !== P612_ALIAS_STATUS) return null;
  if (typeof r.missionId !== "string" || !r.missionId || !Array.isArray(r.aliases)) return null;
  const seen = new Set<string>();
  const aliases: SyntheticIntakeAlias[] = [];
  for (const a of r.aliases as Record<string, unknown>[]) {
    const s = (k: string) => (typeof a?.[k] === "string" ? (a[k] as string) : "");
    const entry = { alias: s("alias"), unit: s("unit"), demoId: s("demoId"), targetDisplayName: s("targetDisplayName"), domain: s("domain"), basis: s("basis"), evidence: s("evidence") };
    if (Object.values(entry).some((v) => !v.trim()) || entry.unit !== entry.unit.trim()) return null;
    if (!/^demo:ubt-[0-9a-f]{8}$/.test(entry.demoId) || !DOMAINS.has(entry.domain) || !BASES.has(entry.basis)) return null;
    if (normalizeCatalogText(entry.alias) === normalizeCatalogText(entry.targetDisplayName)) return null;
    const key = `${normalizeCatalogText(entry.alias)}\u0000${entry.unit}`;
    if (seen.has(key)) return null;
    seen.add(key);
    aliases.push(entry);
  }
  return { missionId: r.missionId, aliases };
}

export const SYNTHETIC_INTAKE_ALIASES = validateSyntheticIntakeAliasRegister(register);

/**
 * The single active demo entry an owner-directed alias names for this label + exact unit, or null.
 * Callers must already have found no entry by display name or signed alias.
 */
export function syntheticIntakeAliasEntry(
  input: { label: string; unit: string; missionId: string },
  catalog: EvaluatedDemoCatalog,
  reg: SyntheticIntakeAliasRegister | null = SYNTHETIC_INTAKE_ALIASES,
): { entry: SyntheticDemoEntry; alias: SyntheticIntakeAlias } | null {
  if (!reg || reg.missionId !== input.missionId) return null;
  const label = normalizeCatalogText(input.label);
  const unit = input.unit.trim();
  const hits = reg.aliases.filter((a) => normalizeCatalogText(a.alias) === label && a.unit === unit);
  if (hits.length !== 1) return null;
  const a = hits[0]!;
  // The alias must not collide with any active entry's own name or signed alias (any unit).
  if (catalog.active.some((e) => [e.displayName, ...e.aliases].some((n) => normalizeCatalogText(n) === label))) return null;
  const targets = catalog.active.filter(
    (e) => e.demoId === a.demoId && e.missionId === input.missionId && e.unit.trim() === a.unit && e.displayName === a.targetDisplayName && e.domain === a.domain,
  );
  return targets.length === 1 ? { entry: targets[0]!, alias: a } : null;
}

/**
 * Display-only: the owner-directed alias that explains why a matched row (label + exact unit) points at
 * `metricId`, or null. Used to label such rows "synthetic alias — pending Researcher review".
 */
export function syntheticIntakeAliasFor(
  row: { label: string; unit: string; metricId: string },
  reg: SyntheticIntakeAliasRegister | null = SYNTHETIC_INTAKE_ALIASES,
): SyntheticIntakeAlias | null {
  if (!reg) return null;
  const label = normalizeCatalogText(row.label);
  return reg.aliases.find((a) => a.demoId === row.metricId && a.unit === row.unit.trim() && normalizeCatalogText(a.alias) === label) ?? null;
}
