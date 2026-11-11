/**
 * P61.4 scientific mapping governance (pure, browser-safe). Makes the seven held P61.3 register proposals
 * actionable WITHOUT a new approval authority: every recorded decision is a write through the existing
 * caller-scoped P36 global triage RPC (accept with a recorded mapping rationale / request more evidence /
 * reject) and the existing P37 SYNTHETIC DEMO decision RPC; activation stays the separate Ground Medical
 * step, and an observation becomes eligible only when a verified signed demo snapshot on this device
 * recognizes its exact label + unit. "Defer" records nothing.
 *
 * Safeguards: each proposal has a closed list of measurement definitions (the demo display name is derived
 * from the chosen definition, never typed), every requirement of the chosen definition needs evidence from
 * the source document or a validation receipt (an unverified source note never counts), units are never
 * converted and known non-equivalences (total CO2 vs calculated HCO3, urea vs urea nitrogen, SDNN vs RMSSD,
 * sleep duration vs total sleep time, 10^9/L vs 10^3/μL) are never merged. Synthetic data only.
 */
import { MAPPING_DECISIONS, MAPPING_CATEGORY_LABELS, type MappingDecision } from "./p613-mapping-decision-register";
import { normalizeCatalogText } from "./catalog-lifecycle";
import { recognizeSyntheticDemo, type EvaluatedDemoCatalog } from "./synthetic-demo-catalog";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import type { EvidenceRequirement, TriageAction } from "@/lib/p36-global-triage-rules";

export const P614_RULES_VERSION = "mitochondria.p614-mapping-governance.v1" as const;
export const P614_SYNTHETIC_DEMO_ACKNOWLEDGEMENT = "SYNTHETIC DEMO - NOT A SCIENTIFIC APPROVAL" as const;

// --- Requirements and evidence -----------------------------------------------------------------

export type RequirementId = "specimen" | "measurement_definition" | "method" | "recording_window" | "unit_expression";
export const REQUIREMENT_LABELS: Record<RequirementId, string> = {
  specimen: "Specimen",
  measurement_definition: "Measurement definition",
  method: "Measurement / acquisition method",
  recording_window: "Recording window",
  unit_expression: "Exact unit expression",
};
/** Existing triage evidence vocabulary each requirement is requested under. */
export const REQUIREMENT_TO_TRIAGE: Record<RequirementId, EvidenceRequirement> = {
  specimen: "specimen",
  measurement_definition: "identity",
  method: "method",
  recording_window: "protocol",
  unit_expression: "unit",
};

export type EvidenceBasis = "SOURCE_DOCUMENT_STATEMENT" | "SOURCE_VALIDATION_RECEIPT" | "UNVERIFIED_SOURCE_NOTE" | "NOT_PROVIDED";
export const EVIDENCE_BASIS_LABELS: Record<EvidenceBasis, string> = {
  SOURCE_DOCUMENT_STATEMENT: "Stated in the source document (cite page/line)",
  SOURCE_VALIDATION_RECEIPT: "Independent source-validation receipt (cite reference)",
  UNVERIFIED_SOURCE_NOTE: "Unverified source note only",
  NOT_PROVIDED: "Not provided",
};
const SUFFICIENT_BASIS = new Set<EvidenceBasis>(["SOURCE_DOCUMENT_STATEMENT", "SOURCE_VALIDATION_RECEIPT"]);
export const isSufficientEvidence = (e: { basis: EvidenceBasis; citation: string } | undefined) =>
  !!e && SUFFICIENT_BASIS.has(e.basis) && e.citation.trim().length >= 8;

// --- Per-proposal safeguards -----------------------------------------------------------------

export interface MappingDefinitionOption {
  id: string;
  label: string;
  /** Synthetic demo display name recorded by the decision; derived, never typed. */
  displayName: string;
  requires: RequirementId[];
}
export interface MappingSafeguard {
  registerId: string;
  label: string;
  reportedUnit: string;
  rule: string;
  existingCandidates: { id: string; name: string; unit: string; relation: string }[];
  definitions: MappingDefinitionOption[];
  neverEquate: string[];
  defaultDomain: HealthDomainId;
}

const SAFEGUARD_LIST: MappingSafeguard[] = [
  {
    registerId: "P613-M02", label: "Chloride", reportedUnit: "mmol/L", defaultDomain: "cardiovascular",
    rule: "Requires the specimen and a scientifically defined catalog entry; serum/plasma and urine chloride are different measurements.",
    existingCandidates: [],
    definitions: [
      { id: "CL_SERUM_PLASMA", label: "Chloride, serum/plasma", displayName: "Chloride, serum/plasma", requires: ["specimen"] },
      { id: "CL_URINE", label: "Chloride, urine", displayName: "Chloride, urine", requires: ["specimen"] },
    ],
    neverEquate: ["Serum/plasma chloride is never equated with urine chloride."],
  },
  {
    registerId: "P613-M01", label: "Bicarbonate", reportedUnit: "mmol/L", defaultDomain: "cardiovascular",
    rule: "Chemistry-panel total CO2 and calculated blood-gas bicarbonate are different measurements and are never silently equated.",
    existingCandidates: [],
    definitions: [
      { id: "TOTAL_CO2_CHEMISTRY", label: "Total CO2 (chemistry panel, serum/plasma)", displayName: "Total CO2, serum/plasma (reported as Bicarbonate)", requires: ["specimen", "measurement_definition"] },
      { id: "HCO3_CALCULATED_BLOOD_GAS", label: "Bicarbonate, calculated (blood gas)", displayName: "Bicarbonate, calculated (blood gas)", requires: ["specimen", "measurement_definition", "method"] },
    ],
    neverEquate: ["Total CO2 (chemistry panel) is never equated with calculated HCO3 (blood gas)."],
  },
  {
    registerId: "P613-M06", label: "Creatinine", reportedUnit: "mg/dL", defaultDomain: "cardiovascular",
    rule: "Requires the specimen and measurement definition; serum is never assumed from an unverified source note (spot-urine creatinine is also reported in mg/dL).",
    existingCandidates: [{ id: "demo:ubt-5630390c", name: "Serum creatinine", unit: "mg/dL", relation: "Not merged: a new entry stays a separate series unless a separate alias decision is approved." }],
    definitions: [
      { id: "CREA_SERUM_PLASMA", label: "Creatinine, serum/plasma", displayName: "Creatinine, serum/plasma (reported as Creatinine)", requires: ["specimen", "measurement_definition"] },
      { id: "CREA_URINE_SPOT", label: "Creatinine, spot urine", displayName: "Creatinine, spot urine (reported as Creatinine)", requires: ["specimen", "measurement_definition"] },
    ],
    neverEquate: ["\"Creatinine\" is never read as serum creatinine without a stated specimen."],
  },
  {
    registerId: "P613-M03", label: "Urea nitrogen (BUN)", reportedUnit: "mg/dL", defaultDomain: "cardiovascular",
    rule: "Blood urea nitrogen and urea concentration are different quantities; they are never converted or equated.",
    existingCandidates: [],
    definitions: [
      { id: "BUN_SERUM_PLASMA", label: "Urea nitrogen, serum/plasma (urea-nitrogen quantity)", displayName: "Urea nitrogen (BUN), serum/plasma", requires: ["specimen", "measurement_definition"] },
    ],
    neverEquate: ["Urea nitrogen (mg/dL) is never equated with or converted to urea (mmol/L)."],
  },
  {
    registerId: "P613-M05", label: "Platelets", reportedUnit: "10^9/L", defaultDomain: "cardiovascular",
    rule: "The existing identities use other unit expressions; the reported 10^9/L is preserved and no scale conversion exists (one would need its own reviewed rule and tests).",
    existingCandidates: [
      { id: "cv-058", name: "Platelet count", unit: "10⁹/L", relation: "Production reference entry; aliasing it needs a governed catalog extension, not this synthetic path." },
      { id: "demo:ubt-c4b4d258", name: "Platelet count", unit: "10^3/μL", relation: "Different unit expression; never merged and never converted." },
    ],
    definitions: [
      { id: "PLT_WHOLE_BLOOD", label: "Platelet count, whole blood (unit kept as 10^9/L)", displayName: "Platelet count, whole blood (reported as Platelets, 10^9/L)", requires: ["specimen", "unit_expression"] },
    ],
    neverEquate: ["10^9/L is never merged with the 10^3/μL demo entry and never converted."],
  },
  {
    registerId: "P613-M07", label: "Sleep duration", reportedUnit: "h", defaultDomain: "behavioral",
    rule: "Generic sleep duration is never equated with Total Sleep Time without a confirmed measurement definition and method.",
    existingCandidates: [{ id: "demo:ubt-d900847d", name: "Total sleep time (main sleep + naps)", unit: "h", relation: "Not merged: only a confirmed definition and method could justify an alias decision." }],
    definitions: [
      { id: "SLEEP_MAIN_PERIOD", label: "Main sleep period duration", displayName: "Main sleep period duration (reported as Sleep duration)", requires: ["measurement_definition", "method"] },
      { id: "SLEEP_TOTAL_INCL_NAPS", label: "Total sleep time incl. naps", displayName: "Total sleep time incl. naps (reported as Sleep duration)", requires: ["measurement_definition", "method"] },
      { id: "SLEEP_TIME_IN_BED", label: "Time in bed", displayName: "Time in bed (reported as Sleep duration)", requires: ["measurement_definition", "method"] },
    ],
    neverEquate: ["\"Sleep duration\" is never equated with Total Sleep Time without a confirmed definition and method."],
  },
  {
    registerId: "P613-M08", label: "HRV SDNN", reportedUnit: "ms", defaultDomain: "cardiovascular",
    rule: "Requires a reviewed SDNN identity with its recording window and acquisition method; RMSSD or any other HRV metric is never substituted.",
    existingCandidates: [{ id: "cv-026", name: "SDNN", unit: "ms", relation: "Production reference entry; aliasing it needs a governed catalog extension with the recording-window condition." }],
    definitions: [
      { id: "SDNN_SHORT_TERM_5MIN", label: "SDNN, short-term (5-minute recording)", displayName: "SDNN, short-term 5-min (reported as HRV SDNN)", requires: ["measurement_definition", "recording_window", "method"] },
      { id: "SDNN_24H", label: "SDNN, 24-hour recording", displayName: "SDNN, 24-hour (reported as HRV SDNN)", requires: ["measurement_definition", "recording_window", "method"] },
    ],
    neverEquate: ["SDNN is never replaced by RMSSD or another HRV metric; short-term and 24-hour SDNN are not comparable."],
  },
];

/** Fail closed: a safeguard whose register entry is missing, changed or already applied disables the module. */
export function validateSafeguards(list: readonly MappingSafeguard[], register: readonly MappingDecision[] | null): MappingSafeguard[] | null {
  if (!register) return null;
  const ids = new Set<string>();
  for (const s of list) {
    const d = register.find((x) => x.id === s.registerId);
    if (!d || d.applied || d.label !== s.label || d.reportedUnit !== s.reportedUnit || ids.has(s.registerId)) return null;
    if (!s.definitions.length || s.definitions.some((o) => !o.requires.length || o.displayName.length < 3 || o.displayName.length > 120)) return null;
    ids.add(s.registerId);
  }
  return [...list];
}
export const MAPPING_SAFEGUARDS = validateSafeguards(SAFEGUARD_LIST, MAPPING_DECISIONS);
const keyOf = (label: string, unit: string) => `${normalizeCatalogText(label)}|${unit.trim()}`;
export function safeguardFor(label: string, unit: string, list: readonly MappingSafeguard[] | null = MAPPING_SAFEGUARDS): MappingSafeguard | null {
  const k = keyOf(label, unit);
  return list?.find((s) => keyOf(s.label, s.reportedUnit) === k) ?? null;
}
export const registerEntryFor = (s: MappingSafeguard) => MAPPING_DECISIONS?.find((d) => d.id === s.registerId) ?? null;

// --- Governance stage over the existing lifecycle ------------------------------------------

export interface GovernanceTerm { submissionId: string; termId: string; originalLabels: readonly string[]; exactUnit: string }
export interface GovernanceTriageEvent {
  eventId: string; submissionId: string; termId: string; action: TriageAction; reason: string | null;
  evidenceRequirements: readonly string[]; previousEventId: string | null; recordedAt: string; recordedByCaller: boolean;
}
export interface GovernanceDemoEvent {
  decisionEventId: string; submissionId: string; termId: string; demoId: string;
  entry: { displayName: string; aliases: readonly string[]; unit: string; domain: string };
  decidedAt: string; decidedByCaller: boolean;
  activationEventId: string | null; activatedAt: string | null; activatedByCaller: boolean | null;
  revocationEventId: string | null; revokedAt: string | null; revocationReason: string | null;
}
export interface GovernanceInputs {
  missionId: string;
  /** Submitted terms readable through global review; null when this account cannot read them. */
  submittedTerms: readonly GovernanceTerm[] | null;
  /** Owner-authorized synthetic demo scope (P37 lifecycle); null when unavailable. */
  scopeTerms: readonly GovernanceTerm[] | null;
  triage: readonly GovernanceTriageEvent[];
  demoEvents: readonly GovernanceDemoEvent[];
  /** Verified signed demo snapshots installed on this device. */
  catalogs: ReadonlyMap<string, EvaluatedDemoCatalog>;
}

export type GovernanceStage =
  | "STATUS_UNAVAILABLE"
  | "NOT_SUBMITTED"
  | "NOT_IN_DEMO_SCOPE"
  | "SUBMITTED_NOT_IN_SCOPE"
  | "AWAITING_TRIAGE"
  | "MORE_EVIDENCE_REQUESTED"
  | "REJECTED"
  | "ACCEPTED_AWAITING_DECISION"
  | "APPROVED_AWAITING_ACTIVATION"
  | "ACTIVATED_NOT_INSTALLED"
  | "REVOKED"
  | "ACTIVE";
export type NextRole = "ground_medical" | "owner" | "researcher" | "device" | "none";
export const NEXT_ROLE_LABELS: Record<NextRole, string> = {
  ground_medical: "Ground Medical",
  owner: "Project owner",
  researcher: "Researcher",
  device: "This device (refresh the signed catalog online)",
  none: "No one — the rows stay held",
};
const STAGE_TEXT: Record<GovernanceStage, { label: string; next: NextRole; step: string }> = {
  STATUS_UNAVAILABLE: { label: "Governance status unavailable for this account", next: "researcher", step: "An authorized Researcher can see the live status in Scientific Review." },
  NOT_SUBMITTED: { label: "Not submitted for scientific review", next: "ground_medical", step: "Ground Medical submits the held rows as an unknown-biomarker request (existing P36 submission); the owner then authorizes the synthetic demonstration scope." },
  NOT_IN_DEMO_SCOPE: { label: "Not submitted, or not in the authorized synthetic demonstration scope", next: "ground_medical", step: "Ground Medical submits the held rows (existing P36 submission); the owner then authorizes the synthetic demonstration scope." },
  SUBMITTED_NOT_IN_SCOPE: { label: "Submitted; not in the owner-authorized synthetic demonstration scope", next: "owner", step: "The owner authorizes this exact submitted term for the synthetic demonstration scope (separate, reviewed database statement)." },
  AWAITING_TRIAGE: { label: "Awaiting Researcher decision", next: "researcher", step: "The Researcher approves (with evidence), rejects, requests more evidence or defers." },
  MORE_EVIDENCE_REQUESTED: { label: "More evidence requested", next: "ground_medical", step: "Ground Medical supplies the requested evidence through a new submission; the rows stay held." },
  REJECTED: { label: "Rejected by the Researcher", next: "none", step: "The mapping was rejected; the rows stay held. Only a new submission can be reviewed again." },
  ACCEPTED_AWAITING_DECISION: { label: "Accepted for review; approval not yet recorded", next: "researcher", step: "The Researcher records the synthetic demonstration decision for the recorded definition." },
  APPROVED_AWAITING_ACTIVATION: { label: "Approved by the Researcher; awaiting Ground Medical activation", next: "ground_medical", step: "A Ground Medical member of this mission (never the approver) activates it in the catalog panel." },
  ACTIVATED_NOT_INSTALLED: { label: "Activated; not yet in this device's verified catalog", next: "device", step: "Go online so this device installs the new signed catalog version, then re-import the original file." },
  REVOKED: { label: "Activation revoked", next: "researcher", step: "Revoked mappings never recognize new rows; a new decision would be needed." },
  ACTIVE: { label: "Approved and activated — available on this device", next: "none", step: "Re-import the original file: the held rows are re-evaluated and offered for explicit confirmation; existing rows are detected as duplicates." },
};

export interface HistoryEntry { at: string; role: "Researcher" | "Ground Medical"; byCaller: boolean | null; action: string; detail: string | null }
export interface MappingGovernanceStatus {
  stage: GovernanceStage;
  label: string;
  nextRole: NextRole;
  nextStep: string;
  /** True only when a verified signed demo snapshot on this device recognizes the exact label + unit. */
  eligible: boolean;
  activeDemoId: string | null;
  term: { submissionId: string; termId: string } | null;
  inScope: boolean;
  latestTriage: GovernanceTriageEvent | null;
  demo: GovernanceDemoEvent | null;
  history: HistoryEntry[];
}

const termMatches = (t: GovernanceTerm, label: string, unit: string) =>
  t.exactUnit.trim() === unit.trim() && t.originalLabels.some((l) => normalizeCatalogText(l) === normalizeCatalogText(label));
const sameTerm = (a: { submissionId: string; termId: string }, b: { submissionId: string; termId: string }) =>
  a.submissionId === b.submissionId && a.termId === b.termId;
const TRIAGE_TEXT: Record<TriageAction, string> = {
  ACCEPT_FOR_REVIEW: "Accepted for review",
  REQUEST_MORE_EVIDENCE: "More evidence requested",
  REJECT_REVIEW_REQUEST: "Rejected",
};

/** Ordered append-only chain for one term (genesis first); broken links stop the chain. */
export function triageChain(events: readonly GovernanceTriageEvent[], term: { submissionId: string; termId: string }): GovernanceTriageEvent[] {
  const mine = events.filter((e) => sameTerm(e, term));
  const out: GovernanceTriageEvent[] = [];
  let prev: string | null = null;
  for (;;) {
    const next = mine.find((e) => e.previousEventId === prev);
    if (!next || out.includes(next)) break;
    out.push(next);
    prev = next.eventId;
  }
  return out;
}

export function mappingGovernanceStatus(sg: { label: string; reportedUnit: string }, i: GovernanceInputs): MappingGovernanceStatus {
  const make = (stage: GovernanceStage, extra: Partial<MappingGovernanceStatus> = {}): MappingGovernanceStatus => ({
    stage, label: STAGE_TEXT[stage].label, nextRole: STAGE_TEXT[stage].next, nextStep: STAGE_TEXT[stage].step,
    eligible: false, activeDemoId: null, term: null, inScope: false, latestTriage: null, demo: null, history: [], ...extra,
  });
  const recognition = recognizeSyntheticDemo({ label: sg.label, unit: sg.reportedUnit, provenance: "synthetic", missionId: i.missionId }, i.catalogs);
  const scopeTerm = i.scopeTerms?.find((t) => termMatches(t, sg.label, sg.reportedUnit)) ?? null;
  const submitted = scopeTerm ?? i.submittedTerms?.find((t) => termMatches(t, sg.label, sg.reportedUnit)) ?? null;
  const term = submitted ? { submissionId: submitted.submissionId, termId: submitted.termId } : null;
  const decisions = i.demoEvents.filter(
    (e) => (term && sameTerm(e, term)) || (e.entry.unit.trim() === sg.reportedUnit.trim() && e.entry.aliases.some((a) => normalizeCatalogText(a) === normalizeCatalogText(sg.label))),
  );
  const demo = decisions[decisions.length - 1] ?? null;
  const chain = term ? triageChain(i.triage, term) : [];
  const latestTriage = chain[chain.length - 1] ?? null;
  const history: HistoryEntry[] = [
    ...chain.map((e) => ({ at: e.recordedAt, role: "Researcher" as const, byCaller: e.recordedByCaller, action: TRIAGE_TEXT[e.action], detail: [e.reason, e.evidenceRequirements.length ? `Evidence requested: ${e.evidenceRequirements.join(", ")}` : null].filter(Boolean).join(" · ") || null })),
    ...decisions.flatMap((d) => [
      { at: d.decidedAt, role: "Researcher" as const, byCaller: d.decidedByCaller, action: "Synthetic demonstration decision recorded", detail: `${d.entry.displayName} · ${d.entry.unit} · ${d.entry.domain} (${d.demoId})` },
      ...(d.activatedAt ? [{ at: d.activatedAt, role: "Ground Medical" as const, byCaller: d.activatedByCaller, action: "Activated", detail: null }] : []),
      ...(d.revokedAt ? [{ at: d.revokedAt, role: "Ground Medical" as const, byCaller: null, action: "Activation revoked", detail: d.revocationReason }] : []),
    ]),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const base = { term, inScope: !!scopeTerm, latestTriage, demo, history };
  if (recognition.status === "SYNTHETIC_DEMO_RECOGNIZED") return make("ACTIVE", { ...base, eligible: true, activeDemoId: recognition.demoId });
  if (demo) {
    if (demo.revocationEventId) return make("REVOKED", base);
    if (demo.activationEventId) return make("ACTIVATED_NOT_INSTALLED", base);
    return make("APPROVED_AWAITING_ACTIVATION", base);
  }
  if (term) {
    if (latestTriage?.action === "REJECT_REVIEW_REQUEST") return make("REJECTED", base);
    if (latestTriage?.action === "REQUEST_MORE_EVIDENCE") return make("MORE_EVIDENCE_REQUESTED", base);
    if (!scopeTerm) return make(i.scopeTerms ? "SUBMITTED_NOT_IN_SCOPE" : "STATUS_UNAVAILABLE", base);
    return make(latestTriage?.action === "ACCEPT_FOR_REVIEW" ? "ACCEPTED_AWAITING_DECISION" : "AWAITING_TRIAGE", base);
  }
  if (i.submittedTerms) return make("NOT_SUBMITTED", base);
  if (i.scopeTerms) return make("NOT_IN_DEMO_SCOPE", base);
  return make("STATUS_UNAVAILABLE", base);
}

// --- Researcher decision preflight ----------------------------------------------------------

export type ResearcherDecision = "APPROVE" | "REJECT" | "REQUEST_EVIDENCE" | "DEFER";
export const DECISION_LABELS: Record<ResearcherDecision, string> = {
  APPROVE: "Approve (synthetic demonstration mapping)",
  REJECT: "Reject, with rationale",
  REQUEST_EVIDENCE: "Request additional evidence",
  DEFER: "Defer — remain held",
};
export interface DecisionDraft {
  decision: ResearcherDecision;
  definitionId: string | null;
  domain: HealthDomainId | null;
  evidence: Partial<Record<RequirementId, { basis: EvidenceBasis; citation: string }>>;
  rationale: string;
  evidenceRequests: RequirementId[];
  acknowledged: boolean;
  provenance: "synthetic" | "real";
}
export interface DecisionActor {
  /** From the existing lifecycle read: scientific approver grant + global review basis for this mission. */
  canDecide: boolean;
}
export type WriteStep =
  | { kind: "triage"; submissionId: string; termId: string; action: TriageAction; reason: string | null; evidenceRequirements: EvidenceRequirement[]; expectedPreviousEventId: string | null }
  | { kind: "demo_decide"; submissionId: string; termId: string; displayName: string; domain: HealthDomainId };
export type DecisionPreflight = { ok: true; steps: WriteStep[]; summary: string } | { ok: false; problems: string[] };

const DOMAINS: readonly HealthDomainId[] = ["bone", "immune", "cardiovascular", "behavioral"];
const REVIEWABLE: ReadonlySet<GovernanceStage> = new Set(["AWAITING_TRIAGE", "ACCEPTED_AWAITING_DECISION", "MORE_EVIDENCE_REQUESTED", "SUBMITTED_NOT_IN_SCOPE"]);
export const mappingRecordPrefix = (registerId: string) => `P61.4 mapping ${registerId} ${P614_RULES_VERSION}`;

/** The structured rationale persisted (as the triage reason) with an approval; ≤ 2000 characters. */
export function mappingRecord(sg: MappingSafeguard, def: MappingDefinitionOption, draft: DecisionDraft): string {
  const ev = def.requires.map((r) => `${r}=${draft.evidence[r]?.basis}: ${draft.evidence[r]?.citation.trim()}`).join(" | ");
  return `${mappingRecordPrefix(sg.registerId)} | definition=${def.id} | unit=${sg.reportedUnit} (as reported, not converted) | ${ev} | rationale: ${draft.rationale.trim()}`;
}
/** Definition recorded by an earlier P61.4 acceptance for this proposal, if any. */
export function recordedDefinition(sg: MappingSafeguard, reason: string | null): string | null {
  if (!reason?.startsWith(`${mappingRecordPrefix(sg.registerId)} | definition=`)) return null;
  return /\| definition=([A-Z0-9_]+) \|/.exec(reason)?.[1] ?? null;
}

export function preflightMappingDecision(sg: MappingSafeguard, status: MappingGovernanceStatus, draft: DecisionDraft, actor: DecisionActor): DecisionPreflight {
  if (draft.decision === "DEFER") return { ok: true, steps: [], summary: "Deferred: nothing is recorded and the rows stay held." };
  const problems: string[] = [];
  if (!actor.canDecide) problems.push("Only an authorized Researcher (scientific approver grant with review access to this mission) may record a mapping decision.");
  if (draft.provenance !== "synthetic") problems.push("These mappings apply to synthetic demonstration data only; real data needs the production catalog lifecycle.");
  if (!status.term) problems.push(`No submitted term exists for "${sg.label}" (${sg.reportedUnit}). ${status.nextStep}`);
  else if (!REVIEWABLE.has(status.stage)) problems.push(`Not possible at this stage: ${status.label}.`);
  const rationale = draft.rationale.trim();
  if (rationale.length < 8) problems.push("A documented rationale (at least 8 characters) is required.");
  const prev = status.latestTriage?.eventId ?? null;
  if (draft.decision === "REJECT" || draft.decision === "REQUEST_EVIDENCE") {
    if (draft.decision === "REQUEST_EVIDENCE" && !draft.evidenceRequests.length) problems.push("Name at least one missing evidence requirement.");
    if (draft.decision === "REJECT" && draft.evidenceRequests.length) problems.push("Evidence requirements apply only to evidence requests.");
    const reason = `${mappingRecordPrefix(sg.registerId)} | ${draft.decision === "REJECT" ? "rejected" : "evidence requested"} | rationale: ${rationale}`;
    if (reason.length > 2000) problems.push("The rationale is too long (2000 characters in total).");
    if (problems.length || !status.term) return { ok: false, problems };
    return {
      ok: true,
      summary: draft.decision === "REJECT" ? "Records a rejection through the existing triage ledger; the rows stay held." : "Records an evidence request through the existing triage ledger; the rows stay held.",
      steps: [{
        kind: "triage", ...status.term, expectedPreviousEventId: prev, reason,
        action: draft.decision === "REJECT" ? "REJECT_REVIEW_REQUEST" : "REQUEST_MORE_EVIDENCE",
        evidenceRequirements: draft.decision === "REQUEST_EVIDENCE" ? [...new Set(draft.evidenceRequests.map((r) => REQUIREMENT_TO_TRIAGE[r]))] : [],
      }],
    };
  }
  // APPROVE
  const approvable = status.stage === "AWAITING_TRIAGE" || status.stage === "ACCEPTED_AWAITING_DECISION" || (status.stage === "MORE_EVIDENCE_REQUESTED" && status.inScope);
  if (!approvable && status.term && REVIEWABLE.has(status.stage))
    problems.push(`Approval needs an owner-authorized synthetic demonstration term awaiting decision (current: ${status.label}).`);
  const def = sg.definitions.find((d) => d.id === draft.definitionId) ?? null;
  if (!def) problems.push("Choose one of the listed measurement definitions; names are never typed or inferred.");
  if (!draft.domain || !DOMAINS.includes(draft.domain)) problems.push("Choose the scientific domain.");
  if (def)
    for (const r of def.requires) {
      const e = draft.evidence[r];
      if (e?.basis === "UNVERIFIED_SOURCE_NOTE") problems.push(`${REQUIREMENT_LABELS[r]}: an unverified source note cannot establish it.`);
      else if (!isSufficientEvidence(e)) problems.push(`${REQUIREMENT_LABELS[r]}: cite the source document statement or a validation receipt (at least 8 characters).`);
    }
  if (!draft.acknowledged) problems.push(`Acknowledge "${P614_SYNTHETIC_DEMO_ACKNOWLEDGEMENT}".`);
  if (status.stage === "ACCEPTED_AWAITING_DECISION") {
    const recorded = recordedDefinition(sg, status.latestTriage?.reason ?? null);
    if (!recorded) problems.push("This term was accepted without a recorded P61.4 mapping rationale and evidence, so it cannot be approved here.");
    else if (def && recorded !== def.id) problems.push("The definition differs from the one recorded with the acceptance.");
  }
  const record = def ? mappingRecord(sg, def, draft) : "";
  if (record.length > 2000) problems.push("The rationale and citations are too long (2000 characters in total).");
  if (problems.length || !status.term || !def || !draft.domain) return { ok: false, problems };
  const steps: WriteStep[] = [];
  if (status.stage !== "ACCEPTED_AWAITING_DECISION")
    steps.push({ kind: "triage", ...status.term, action: "ACCEPT_FOR_REVIEW", reason: record, evidenceRequirements: [], expectedPreviousEventId: prev });
  steps.push({ kind: "demo_decide", ...status.term, displayName: def.displayName, domain: draft.domain });
  return {
    ok: true,
    steps,
    summary: `Records "${def.displayName}" (${sg.reportedUnit}, not converted) as a SYNTHETIC DEMO decision. It recognizes nothing until a Ground Medical member of the mission (never you) activates it.`,
  };
}

// --- Exception queue view and recovery --------------------------------------------------------

export interface HeldMappingView {
  safeguard: MappingSafeguard;
  rows: number;
  dates: string[];
  whyHeld: string;
  /** Requirements still needing source-document or receipt evidence (then Researcher approval and Ground Medical activation). */
  missingEvidence: string[];
  status: MappingGovernanceStatus;
}

/** One view per held proposal present in the import (exception rows only; display only). */
export function heldMappingViews(
  rows: readonly { key: string; label: string; unit: string; observedAt: string }[],
  statuses: ReadonlyMap<string, { kind: string }>,
  inputs: GovernanceInputs,
): HeldMappingView[] {
  const out: HeldMappingView[] = [];
  for (const sg of MAPPING_SAFEGUARDS ?? []) {
    const mine = rows.filter((r) => statuses.get(r.key)?.kind === "exception" && keyOf(r.label, r.unit) === keyOf(sg.label, sg.reportedUnit));
    if (!mine.length) continue;
    const reg = registerEntryFor(sg);
    const reqs = [...new Set(sg.definitions.flatMap((d) => d.requires))];
    out.push({
      safeguard: sg,
      rows: mine.length,
      dates: [...new Set(mine.map((r) => r.observedAt.slice(0, 10)).filter(Boolean))].sort(),
      whyHeld: reg ? reg.categories.map((c) => MAPPING_CATEGORY_LABELS[c]).join(" · ") : "No approved and activated mapping.",
      missingEvidence: reqs.map((r) => REQUIREMENT_LABELS[r]),
      status: mappingGovernanceStatus(sg, inputs),
    });
  }
  return out;
}

export interface MappingRecovery {
  extracted: number;
  duplicates: number;
  newlyEligible: number;
  stillHeld: number;
  rejected: number;
  /** Always 0: nothing is saved without the reviewer's explicit confirmation. */
  autoSaved: 0;
  newlyEligibleByDate: { date: string; rows: number }[];
}
/**
 * Recovery counts for a re-import: rows of a previously held proposal that are now validated (an approved and
 * activated mapping recognized them) versus rows still held. Display only; saving remains explicit.
 */
export function mappingRecovery(
  rows: readonly { key: string; label: string; unit: string; observedAt: string }[],
  statuses: ReadonlyMap<string, { kind: string }>,
): MappingRecovery {
  let duplicates = 0, newlyEligible = 0, stillHeld = 0, rejected = 0;
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const s = statuses.get(r.key)?.kind;
    if (s === "duplicate") duplicates++;
    else if (s === "rejected") rejected++;
    else if (s === "exception") stillHeld++;
    else if (s === "validated" && safeguardFor(r.label, r.unit)) {
      newlyEligible++;
      const d = r.observedAt.slice(0, 10);
      byDate.set(d, (byDate.get(d) ?? 0) + 1);
    }
  }
  return {
    extracted: rows.length, duplicates, newlyEligible, stillHeld, rejected, autoSaved: 0,
    newlyEligibleByDate: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, n]) => ({ date, rows: n })),
  };
}

// --- Provisional synthetic rules (P61.2 aliases, P61.3 UN-1) -----------------------------------

export interface ProvisionalRuleView {
  registerId: string;
  label: string;
  reportedUnit: string;
  kind: "SYNTHETIC_ALIAS" | "UNIT_NOTATION_RULE";
  target: string;
  syntheticOnly: true;
  status: string;
  nextRole: NextRole;
  path: string;
}
export function provisionalRuleViews(register: readonly MappingDecision[] | null = MAPPING_DECISIONS): ProvisionalRuleView[] {
  return (register ?? [])
    .filter((d) => d.applied)
    .map((d) => ({
      registerId: d.id,
      label: d.label,
      reportedUnit: d.reportedUnit,
      kind: d.categories.includes("SAFE_DETERMINISTIC_NORMALIZATION") ? "UNIT_NOTATION_RULE" : "SYNTHETIC_ALIAS",
      target: `${d.proposal.catalogName} (${d.proposal.catalogId}) · ${d.proposal.catalogUnit}`,
      syntheticOnly: true,
      status: d.approval.status,
      nextRole: "researcher",
      path: `${d.approval.path} Real-data use needs a separate governed catalog extension; the app never writes that registry or promotes these rules.`,
    }));
}
