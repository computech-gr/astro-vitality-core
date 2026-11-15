/**
 * P72.10 — Scientific interpretation inputs of a Health Intelligence report (pure; no React,
 * no IndexedDB access, no writes).
 *
 * Inventory of everything that can change findings, classifications, alerts or recommendations:
 *  - Clinical observations and Ground Medical reviews: the P72.9 dataset snapshot (server-confirmed,
 *    or an explicitly chosen local offline dataset).
 *  - Shared versioned rules, bundled with the app and identical on every device: interpretation
 *    registry, verified reference intervals, P57 criteria registry, P56/P57.1/P58/P59/P60 libraries
 *    and rules, the cross-domain context list and the bundled attestation keys (SHARED_RULE_SETS).
 *  - Device-local scientific decisions: P40/P41 interpretation review events and P57 reference-
 *    criteria decisions. They live only in this device's encrypted review ledger; the server signs
 *    (attests) them but keeps no copy, so no authorized server source exists for them.
 *  - User choices on the page (period, sources, synthetic literature demonstration).
 *  - Informational only: the optional AI wording (role- and deployment-gated, never changes a class
 *    or priority) and the export time.
 *
 * Server-confirmed reports therefore apply only the shared versioned rules, which every authorized
 * device holds identically; device-local decisions are never substituted for an authoritative source
 * and, when they would change content, are disclosed as not applied. A local offline report (explicit
 * user choice) applies this device's verified decisions and labels them as device-local.
 */
import { canonicalJson } from "./observation-envelope";
import { bundledInterpretationRegistry } from "./biomarker-interpretation-ledger";
import { buildVerifiedSnapshot, type InterpretationSnapshot } from "./biomarker-interpretation";
import { bundledCriteriaRegistry } from "./p57-reference-criteria";
import { resolveCriteriaReview, type CriteriaReviewResolution } from "./p57-criteria-review";
import { REPORT_ENGINE_VERSION, type DatasetReadiness, type DatasetReadinessState, type ReportDataSource } from "./p729-report-dataset";
import interpretationRegistry from "../../../data/scientific/biomarker-interpretation-registry.v1.json";
import verifiedReferences from "../../../data/scientific/verified-reference-intervals.v1.json";
import criteriaRegistry from "../../../data/scientific/p57-reference-criteria.v1.json";
import patternLibrary from "../../../data/scientific/p56-health-pattern-library.v1.json";
import reviewPriorityRules from "../../../data/scientific/p56-review-priority-rules.v1.json";
import warningRules from "../../../data/scientific/p571-clinical-warning-rules.v1.json";
import concernLibrary from "../../../data/scientific/p58-clinical-concern-library.v1.json";
import provisionalCriteria from "../../../data/scientific/p59-provisional-literature-criteria.v1.json";
import demonstrationMappings from "../../../data/scientific/p59-synthetic-demonstration-mappings.v1.json";
import relationshipModel from "../../../data/scientific/p59-relationship-model.v1.json";
import clinicalPatterns from "../../../data/scientific/p60-clinical-pattern-library.v1.json";
import crossDomainContext from "../../../data/scientific/nikolas-cross-domain-context.v1.json";
import interpretationKeys from "../../../data/scientific/interpretation-attestation-keys.v1.json";
import criteriaKeys from "../../../data/scientific/p57-criteria-attestation-keys.v1.json";

export const SCIENTIFIC_SNAPSHOT_VERSION = "p72.10-scientific-inputs.v1" as const;
export const SHARED_RULES_LABEL = "SHARED VERSIONED RULES" as const;
export const DEVICE_DECISIONS_LABEL = "DEVICE-LOCAL SCIENTIFIC DECISIONS — NOT SERVER VERIFIED" as const;

/** Bundled rule files that can influence findings (same bytes on every device running this release). */
export const SHARED_RULE_SETS: readonly { id: string; data: unknown }[] = [
  { id: "biomarker-interpretation-registry", data: interpretationRegistry },
  { id: "verified-reference-intervals", data: verifiedReferences },
  { id: "p57-reference-criteria", data: criteriaRegistry },
  { id: "p56-health-pattern-library", data: patternLibrary },
  { id: "p56-review-priority-rules", data: reviewPriorityRules },
  { id: "p571-clinical-warning-rules", data: warningRules },
  { id: "p58-clinical-concern-library", data: concernLibrary },
  { id: "p59-provisional-literature-criteria", data: provisionalCriteria },
  { id: "p59-synthetic-demonstration-mappings", data: demonstrationMappings },
  { id: "p59-relationship-model", data: relationshipModel },
  { id: "p60-clinical-pattern-library", data: clinicalPatterns },
  { id: "nikolas-cross-domain-context", data: crossDomainContext },
  { id: "interpretation-attestation-keys", data: interpretationKeys },
  { id: "p57-criteria-attestation-keys", data: criteriaKeys },
];

export interface RuleSetIdentity {
  id: string;
  version: string | null;
  status: string | null;
  sha256: string;
}

export type ScientificBasis = "shared_versioned_rules" | "device_local_decisions";

/** What this device's review ledger holds (for disclosure only; never part of a server-confirmed fingerprint). */
export interface DeviceDecisionSummary {
  state: "loading" | "read" | "unreadable";
  interpretationEvents: number;
  /** Interpretations approved or revoked by a verified, server-attested device event. */
  interpretationDecisions: number;
  awaitingAttestation: number;
  drafts: number;
  /** Reference criteria approved by a verified, server-attested device event. */
  approvedCriteria: number;
  criteriaAwaitingAttestation: number;
  integrityProblem: string | null;
}

export interface ReportScientificSnapshot {
  version: typeof SCIENTIFIC_SNAPSHOT_VERSION;
  source: ReportDataSource;
  /** Bound to the P72.9 dataset snapshot it was built for. */
  datasetToken: number;
  datasetFingerprint: string;
  basis: ScientificBasis;
  interpretation: InterpretationSnapshot;
  criteria: CriteriaReviewResolution;
  ruleSets: readonly RuleSetIdentity[];
}

/** Page options that change scientific output (part of the scientific-input fingerprint). */
export interface ScientificOptions {
  provisionalLiteratureDemonstration: boolean;
}

export type ScientificSnapshotResult =
  | { kind: "ready"; snapshot: ReportScientificSnapshot }
  | { kind: "waiting"; reason: string }
  | { kind: "blocked"; reason: string };

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

const field = (data: unknown, k: string): string | null => {
  const v = data && typeof data === "object" ? (data as Record<string, unknown>)[k] : undefined;
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
};

let ruleCache: Promise<RuleSetIdentity[]> | null = null;
/** Identity (version, status, content SHA-256) of every shared rule file. */
export function sharedRuleSetIdentities(): Promise<RuleSetIdentity[]> {
  ruleCache ??= Promise.all(
    SHARED_RULE_SETS.map(async (r) => ({ id: r.id, version: field(r.data, "version"), status: field(r.data, "status"), sha256: await sha256Hex(canonicalJson(r.data)) })),
  );
  return ruleCache;
}

let sharedCache: Promise<{ interpretation: InterpretationSnapshot; criteria: CriteriaReviewResolution }> | null = null;
/** The shared scientific state: bundled registries with no device-local decision applied. */
export function sharedScientificState(): Promise<{ interpretation: InterpretationSnapshot; criteria: CriteriaReviewResolution }> {
  sharedCache ??= Promise.all([buildVerifiedSnapshot(bundledInterpretationRegistry(), []), resolveCriteriaReview(bundledCriteriaRegistry(), [])]).then(([interpretation, criteria]) => ({
    interpretation: deepFreeze(interpretation),
    criteria: deepFreeze(criteria),
  }));
  return sharedCache;
}

export function summarizeDeviceDecisions(
  interpretation: { snapshot: InterpretationSnapshot; state: "registry_only" | "verified" | "error" },
  criteria: { resolution: CriteriaReviewResolution; state: "loading" | "verified" | "error" },
): DeviceDecisionSummary {
  const s = interpretation.snapshot;
  const state = interpretation.state === "error" || criteria.state === "error" ? "unreadable" : interpretation.state === "registry_only" || criteria.state === "loading" ? "loading" : "read";
  return {
    state,
    interpretationEvents: s.ledger.events,
    interpretationDecisions: s.records.filter((r) => r.basis === "device_local").length,
    awaitingAttestation: s.records.filter((r) => r.awaitingAttestation).length,
    drafts: s.records.filter((r) => r.latestDraft).length,
    approvedCriteria: criteria.resolution.approved.length,
    criteriaAwaitingAttestation: criteria.resolution.states.filter((c) => c.status === "APPROVED_AWAITING_ATTESTATION").length,
    integrityProblem: s.ledger.verified ? (criteria.resolution.chainOk ? null : criteria.resolution.problem ?? "criteria decision history failed its integrity check") : s.ledger.note,
  };
}

/** Device decisions that WOULD change report content if applied (approvals/revocations/criteria). */
export function deviceDecisionsChangeContent(d: DeviceDecisionSummary): boolean {
  return d.interpretationDecisions > 0 || d.approvedCriteria > 0;
}

/**
 * Plain statement about this device's decisions in a server-confirmed report, or null when the
 * device holds nothing that could change content (tasks, drafts and unattested approvals never do).
 */
export function deviceDecisionsNotAppliedStatement(d: DeviceDecisionSummary): string | null {
  if (d.state === "unreadable") return "This device's scientific review history could not be read; it is not used by server-confirmed reports, so the report is unaffected.";
  if (!deviceDecisionsChangeContent(d)) return null;
  const parts = [
    d.interpretationDecisions ? `${d.interpretationDecisions} interpretation approval/revocation decision(s)` : null,
    d.approvedCriteria ? `${d.approvedCriteria} approved reference criterion/criteria` : null,
  ].filter(Boolean);
  return `NOT APPLIED: ${parts.join(" and ")} recorded only on the exporting device. They have no server copy, so they are not part of this server-confirmed report; they appear only in a LOCAL OFFLINE report from that device, or for everyone once merged into the shared registry.`;
}

const criteriaKey = (c: CriteriaReviewResolution) => ({
  chainOk: c.chainOk,
  states: c.states.map((s) => ({ id: s.criterionId, fingerprint: s.fingerprint, status: s.status, missions: s.missions })).sort((a, b) => a.id.localeCompare(b.id)),
  approved: c.approved.map((a) => ({ id: a.criterion.id, fingerprint: a.fingerprint, missions: a.missions, ref: a.approvalRef })).sort((a, b) => a.id.localeCompare(b.id) || a.ref.localeCompare(b.ref)),
});

/** SHA-256 over every scientific interpretation input (separate from the clinical-observation fingerprints). */
export async function scientificFingerprint(input: Pick<ReportScientificSnapshot, "basis" | "interpretation" | "criteria" | "ruleSets">, options: ScientificOptions): Promise<string> {
  return sha256Hex(
    canonicalJson({
      version: SCIENTIFIC_SNAPSHOT_VERSION,
      engine: REPORT_ENGINE_VERSION,
      basis: input.basis,
      ruleSets: [...input.ruleSets].map((r) => ({ id: r.id, sha256: r.sha256 })).sort((a, b) => a.id.localeCompare(b.id)),
      interpretation: { registryVersion: input.interpretation.registryVersion, digest: input.interpretation.digest, verified: input.interpretation.ledger.verified },
      criteria: criteriaKey(input.criteria),
      options: { provisionalLiteratureDemonstration: options.provisionalLiteratureDemonstration },
    }),
  );
}

/** Deterministic description printed as "Scientific rules applied". */
export function describeScientificInputs(s: Pick<ReportScientificSnapshot, "basis" | "interpretation" | "criteria" | "ruleSets">, options: ScientificOptions): string {
  const { basis, interpretation, criteria, ruleSets: rules } = s;
  const approvedInterpretations = interpretation.records.filter((r) => r.status === "approved").length;
  const common = `interpretation registry v${interpretation.registryVersion} (${approvedInterpretations} approved interpretation(s)); ${criteria.approved.length} Researcher-approved reference criteria; ${rules.length} bundled rule sets; synthetic literature demonstration ${options.provisionalLiteratureDemonstration ? "ON (provisional, not clinically validated)" : "OFF"}`;
  return basis === "shared_versioned_rules"
    ? `${SHARED_RULES_LABEL} — ${common}. No device-local decision is applied, so every authorized device produces the same findings for the same dataset.`
    : `${DEVICE_DECISIONS_LABEL} — ${common}, including ${interpretation.ledger.events} verified review event(s) held on this device. Another device may hold different decisions.`;
}

/**
 * Build the scientific snapshot for one dataset snapshot. Server-confirmed: shared rules only.
 * Local offline: this device's verified decisions; waits while they load and blocks (with an
 * actionable reason) when they could not be read, instead of silently using fewer decisions.
 */
export async function buildScientificSnapshot(input: {
  source: ReportDataSource;
  datasetToken: number;
  datasetFingerprint: string;
  device: { interpretation: { snapshot: InterpretationSnapshot; state: "registry_only" | "verified" | "error" }; criteria: { resolution: CriteriaReviewResolution; state: "loading" | "verified" | "error" } };
}): Promise<ScientificSnapshotResult> {
  const ruleSets = await sharedRuleSetIdentities();
  let basis: ScientificBasis;
  let interpretation: InterpretationSnapshot;
  let criteria: CriteriaReviewResolution;
  if (input.source === "server_confirmed") {
    basis = "shared_versioned_rules";
    ({ interpretation, criteria } = await sharedScientificState());
  } else {
    const d = summarizeDeviceDecisions(input.device.interpretation, input.device.criteria);
    if (d.state === "loading") return { kind: "waiting", reason: "Reading the scientific review decisions stored on this device…" };
    if (d.state === "unreadable")
      return {
        kind: "blocked",
        reason:
          "The scientific review decisions stored on this device could not be read, so a local offline report would be built from incomplete scientific inputs. Reload the page; when online, use the server-confirmed report instead.",
      };
    if (d.integrityProblem)
      return {
        kind: "blocked",
        reason: `This device's scientific review history failed its integrity check (${d.integrityProblem}), so its decisions cannot be applied to a local offline report. Use the server-confirmed report when online; nothing was changed.`,
      };
    basis = "device_local_decisions";
    interpretation = input.device.interpretation.snapshot;
    criteria = input.device.criteria.resolution;
    if (!interpretation.digest) return { kind: "waiting", reason: "Verifying the scientific review decisions stored on this device…" };
  }
  return {
    kind: "ready",
    snapshot: deepFreeze({
      version: SCIENTIFIC_SNAPSHOT_VERSION,
      source: input.source,
      datasetToken: input.datasetToken,
      datasetFingerprint: input.datasetFingerprint,
      basis,
      interpretation,
      criteria,
      ruleSets,
    } satisfies ReportScientificSnapshot),
  };
}

/** Short rule-set list for provenance, e.g. "p56-health-pattern-library v1 PENDING_SCIENTIFIC_REVIEW 1a2b3c4d". */
export function ruleSetLines(rules: readonly RuleSetIdentity[]): string[] {
  return [...rules].sort((a, b) => a.id.localeCompare(b.id)).map((r) => `${r.id}${r.version ? ` v${r.version}` : ""}${r.status ? ` (${r.status})` : ""} sha256 ${r.sha256.slice(0, 16)}`);
}

// ---------- Readiness (dataset readiness + scientific inputs) ----------

export type ScientificReadinessState = "scientific_preparing" | "scientific_blocked";

/**
 * A report (screen and every export) is available only when its dataset is ready AND the scientific
 * snapshot was built for exactly that dataset. A blocked scientific input blocks the report with an
 * actionable reason; it never falls back to fewer or other inputs.
 */
export type ReportReadiness = Omit<DatasetReadiness, "state"> & { state: DatasetReadinessState | ScientificReadinessState; scientific: ReportScientificSnapshot | null };

export function withScientificReadiness(
  readiness: DatasetReadiness,
  result: ScientificSnapshotResult | null,
  dataset: { token: number; source: ReportDataSource; datasetFingerprint: string } | null,
): ReportReadiness {
  if (!readiness.exportAllowed || !dataset) return { ...readiness, scientific: null };
  if (result?.kind === "blocked")
    return { ...readiness, state: "scientific_blocked", exportAllowed: false, offerLocalOffline: false, title: "Scientific interpretation inputs unavailable", detail: `${result.reason} No report was generated; this is not a negative finding.`, scientific: null };
  const s = result?.kind === "ready" ? result.snapshot : null;
  if (!s || s.datasetToken !== dataset.token || s.source !== dataset.source || s.datasetFingerprint !== dataset.datasetFingerprint)
    return {
      ...readiness,
      state: "scientific_preparing",
      exportAllowed: false,
      offerLocalOffline: false,
      title: "Preparing the scientific interpretation inputs…",
      detail: result?.kind === "waiting" ? result.reason : "The scientific rules for this dataset are being verified.",
      scientific: null,
    };
  return { ...readiness, scientific: s };
}
