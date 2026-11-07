/**
 * P41 — deterministic preflight inventory of the interpretation registry and
 * resumable, idempotent backlog processing (pure).
 *
 * The 416 P40 records are NOT 416 biomarkers: handbook entries, domain-catalog
 * placeholders and activated synthetic demo identities overlap. The preflight
 * clusters records by exact catalog ID, proposed handbook links and identical
 * normalized names within a domain, and lists conflicts and manual decisions.
 * Backlog processing never approves anything; it only records evidence-
 * retrieval/draft attempts, retries failures a bounded number of times, and
 * skips work already done.
 */
import {
  approvalProblem,
  type InterpretationDomain,
  type InterpretationEnvironment,
  type InterpretationSnapshot,
  type ResolvedInterpretation,
} from "./biomarker-interpretation";
import type { BundleStatus, EvidenceBundle } from "./interpretation-evidence";
import { normalizeCandidateLabel } from "./interpretation-research-candidates";

export type EvidenceCompleteness = "complete" | "partial" | "missing";
export interface PreflightReport {
  totalRecords: number;
  distinctNormalizedNames: number;
  distinctCanonicalClusters: number;
  byEnvironment: Record<InterpretationEnvironment, number>;
  byDomain: Record<InterpretationDomain, number>;
  byLifecycle: Record<ResolvedInterpretation["lifecycle"], number>;
  supersededApprovals: number;
  rejected: number;
  evidence: Record<EvidenceCompleteness, number>;
  conflicts: {
    nameInMultipleDomains: { name: string; domains: InterpretationDomain[]; keys: string[] }[];
    nameWithMultipleUnits: { name: string; units: string[]; keys: string[] }[];
    ambiguousSourceUnitText: { key: string; sourceUnitText: string }[];
    notUnitBound: number;
    specimenNotDocumented: number;
    methodNotDocumented: number;
    protocolNotDocumented: number;
  };
  duplicateClusters: { label: string; keys: string[] }[];
  manualDecisions: string[];
}

export function evidenceCompleteness(r: ResolvedInterpretation, bundle?: EvidenceBundle | null): EvidenceCompleteness {
  if (r.status === "approved" && r.content && !approvalProblem(r.identity, { content: r.content, citations: r.citations, evidenceStrength: r.evidenceStrength })) return "complete";
  if (r.pendingContent || r.latestDraft || bundle?.draft?.claims.some((c) => c.verification === "excerpt_found_in_inspected_text")) return "partial";
  return "missing";
}

class UnionFind {
  private p = new Map<string, string>();
  find(x: string): string {
    if (!this.p.has(x)) this.p.set(x, x);
    const px = this.p.get(x)!;
    if (px === x) return x;
    const root = this.find(px);
    this.p.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}

const AMBIGUOUS_UNIT = /\s(?:or|ή)\s|;|,|\s\/\s/i;

export function interpretationPreflight(snapshot: InterpretationSnapshot, bundles: ReadonlyMap<string, EvidenceBundle> = new Map()): PreflightReport {
  const rs = snapshot.records;
  const uf = new UnionFind();
  const byCatalog = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of rs) {
    uf.find(r.key);
    const cat = byCatalog.get(r.identity.catalogId);
    if (cat) uf.union(cat, r.key);
    else byCatalog.set(r.identity.catalogId, r.key);
    const nameKey = `${r.identity.domain}|${normalizeCandidateLabel(r.identity.displayName)}`;
    const nk = byName.get(nameKey);
    if (nk) uf.union(nk, r.key);
    else byName.set(nameKey, r.key);
  }
  for (const r of rs) for (const l of r.proposedLinks) {
    const target = byCatalog.get(l.catalogId);
    if (target) uf.union(target, r.key);
  }
  const clusters = new Map<string, string[]>();
  for (const r of rs) clusters.set(uf.find(r.key), [...(clusters.get(uf.find(r.key)) ?? []), r.key]);

  const names = new Map<string, ResolvedInterpretation[]>();
  for (const r of rs) {
    const n = normalizeCandidateLabel(r.identity.displayName);
    names.set(n, [...(names.get(n) ?? []), r]);
  }
  const count = <K extends string>(keys: readonly K[], f: (r: ResolvedInterpretation) => K) =>
    Object.fromEntries(keys.map((k) => [k, rs.filter((r) => f(r) === k).length])) as Record<K, number>;

  let superseded = 0;
  for (const r of rs) {
    const approvals = r.approvalHistory.filter((h) => h.action === "APPROVE").length;
    if (approvals > 1) superseded += approvals - 1;
  }
  const evidence = { complete: 0, partial: 0, missing: 0 };
  for (const r of rs) evidence[evidenceCompleteness(r, bundles.get(r.key))]++;

  const nameInMultipleDomains = [...names.entries()]
    .map(([name, list]) => ({ name, domains: [...new Set(list.map((r) => r.identity.domain))].sort(), keys: list.map((r) => r.key) }))
    .filter((x) => x.domains.length > 1);
  const nameWithMultipleUnits = [...names.entries()]
    .map(([name, list]) => ({ name, units: [...new Set(list.map((r) => r.identity.unit).filter((u): u is string => !!u))].sort(), keys: list.map((r) => r.key) }))
    .filter((x) => x.units.length > 1);
  const ambiguousSourceUnitText = rs.filter((r) => r.identity.unit === null && r.sourceUnitText && AMBIGUOUS_UNIT.test(r.sourceUnitText)).map((r) => ({ key: r.key, sourceUnitText: r.sourceUnitText! }));
  const unitBound = rs.filter((r) => r.identity.unit !== null);
  const duplicateClusters = [...clusters.values()]
    .filter((keys) => keys.length > 1)
    .map((keys) => ({ label: rs.find((r) => r.key === keys[0])!.identity.displayName, keys: [...keys].sort() }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const withLinks = rs.filter((r) => r.proposedLinks.length).length;
  const placeholders = rs.filter((r) => r.identity.environment === "domain_catalog" && !r.pendingContent).length;
  const notUnitBound = rs.length - unitBound.length;
  return {
    totalRecords: rs.length,
    distinctNormalizedNames: names.size,
    distinctCanonicalClusters: clusters.size,
    byEnvironment: count(["governed_handbook", "domain_catalog", "production_catalog", "synthetic_demo"] as const, (r) => r.identity.environment),
    byDomain: count(["bone", "cardiovascular", "immune", "behavioral"] as const, (r) => r.identity.domain),
    byLifecycle: count(["pending_review", "draft", "awaiting_attestation", "approved", "rejected", "revoked"] as const, (r) => r.lifecycle),
    supersededApprovals: superseded,
    rejected: rs.filter((r) => r.lifecycle === "rejected").length,
    evidence,
    conflicts: {
      nameInMultipleDomains,
      nameWithMultipleUnits,
      ambiguousSourceUnitText,
      notUnitBound,
      specimenNotDocumented: rs.filter((r) => !r.specimenText && !r.measurementContext?.specimen).length,
      methodNotDocumented: rs.filter((r) => !r.measurementContext?.method).length,
      protocolNotDocumented: rs.filter((r) => !r.measurementContext?.collectionProtocol).length,
    },
    duplicateClusters,
    manualDecisions: [
      ...(withLinks ? [`${withLinks} record(s) carry a proposed handbook link; identity equivalence must be decided by the Researcher (never applied automatically).`] : []),
      ...(nameInMultipleDomains.length ? [`${nameInMultipleDomains.length} biomarker name(s) appear in more than one domain; choose the domain per record.`] : []),
      ...(notUnitBound ? [`${notUnitBound} handbook/catalog record(s) are not bound to a unit; an exact unit must be chosen before any approval.`] : []),
      ...(ambiguousSourceUnitText.length ? [`${ambiguousSourceUnitText.length} source unit text(s) list several units; each unit needs its own record.`] : []),
      ...(placeholders ? [`${placeholders} Immune/Behavioral placeholder(s) have no approved English source text; evidence must be retrieved and reviewed.`] : []),
    ],
  };
}

// ------------------------------------------------------------ resumable batches

export const EVIDENCE_ATTEMPT_SCHEMA = "mitochondria.interpretation-evidence-attempt.v1" as const;
export type AttemptStatus = BundleStatus | "failed";
export interface EvidenceAttempt {
  schema: typeof EVIDENCE_ATTEMPT_SCHEMA;
  key: string;
  attempt: number;
  status: AttemptStatus;
  at: string;
  error: string | null;
  bundle: EvidenceBundle | null;
  actorUserId: string;
}
export const MAX_BACKLOG_ATTEMPTS = 3;
const FINAL: readonly AttemptStatus[] = ["draft_ready", "insufficient_evidence", "no_evidence_found"];

export function latestAttempts(attempts: readonly EvidenceAttempt[]): Map<string, { latest: EvidenceAttempt; count: number; bundle: EvidenceBundle | null }> {
  const out = new Map<string, { latest: EvidenceAttempt; count: number; bundle: EvidenceBundle | null }>();
  for (const a of [...attempts].sort((x, y) => x.key.localeCompare(y.key) || x.attempt - y.attempt)) {
    const cur = out.get(a.key);
    out.set(a.key, { latest: a, count: (cur?.count ?? 0) + 1, bundle: a.bundle ?? cur?.bundle ?? null });
  }
  return out;
}

/** Next keys to process, in a stable order: never-tried first, then retryable failures. */
export function nextBacklogBatch(keys: readonly string[], attempts: readonly EvidenceAttempt[], size: number, maxAttempts = MAX_BACKLOG_ATTEMPTS): string[] {
  const state = latestAttempts(attempts);
  const sorted = [...new Set(keys)].sort();
  const fresh = sorted.filter((k) => !state.has(k));
  const retry = sorted.filter((k) => {
    const s = state.get(k);
    return s && !FINAL.includes(s.latest.status) && s.count < maxAttempts;
  });
  return [...fresh, ...retry].slice(0, Math.max(0, size));
}

export function backlogProgress(keys: readonly string[], attempts: readonly EvidenceAttempt[], maxAttempts = MAX_BACKLOG_ATTEMPTS) {
  const state = latestAttempts(attempts);
  const p = { total: 0, draftReady: 0, insufficientEvidence: 0, noEvidence: 0, awaitingDraft: 0, failedRetryable: 0, failedExhausted: 0, notStarted: 0 };
  for (const k of new Set(keys)) {
    p.total++;
    const s = state.get(k);
    if (!s) p.notStarted++;
    else if (s.latest.status === "draft_ready") p.draftReady++;
    else if (s.latest.status === "insufficient_evidence") p.insufficientEvidence++;
    else if (s.latest.status === "no_evidence_found") p.noEvidence++;
    else if (s.latest.status === "evidence_retrieved") p.awaitingDraft++;
    else if (s.count >= maxAttempts) p.failedExhausted++;
    else p.failedRetryable++;
  }
  return p;
}

export function planAttempt(key: string, attempts: readonly EvidenceAttempt[], status: AttemptStatus, bundle: EvidenceBundle | null, error: string | null, actorUserId: string, at: string): EvidenceAttempt {
  const n = attempts.filter((a) => a.key === key).reduce((m, a) => Math.max(m, a.attempt), 0) + 1;
  return { schema: EVIDENCE_ATTEMPT_SCHEMA, key, attempt: n, status, at, error, bundle, actorUserId };
}
