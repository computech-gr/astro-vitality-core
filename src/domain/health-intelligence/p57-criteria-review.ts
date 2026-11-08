/**
 * P57 — Researcher review workflow for reference criteria (pure, offline).
 *
 * Append-only, hash-chained decision events (catalog level: no astronaut,
 * observation or value). Bulk review by domain records one event per selected
 * criterion with a shared batch ID; criteria left out of the selection or
 * rejected individually are the exceptions. An APPROVE applies only after an
 * ATTEST event carries a server signature that matches the exact event,
 * criterion fingerprint, missions and actor. REJECT / REVOKE are conservative
 * and apply immediately. A changed criterion (new fingerprint) returns to
 * pending review; earlier approvals never carry over.
 */
import { canonicalJson } from "./observation-envelope";
import { sha256Hex } from "./catalog-lifecycle";
import {
  approvalBlocker,
  criterionFingerprint,
  type ApprovedCriterion,
  type CriteriaRegistry,
  type ReferenceCriterion,
} from "./p57-reference-criteria";
import {
  BUNDLED_CRITERIA_KEYS,
  verifyCriteriaAttestation,
  type CriteriaTrustedKey,
  type SignedCriteriaAttestation,
} from "./p57-criteria-attestation";

export const CRITERIA_EVENT_SCHEMA = "mitochondria.p57-criteria-event.v1" as const;
export const CRITERIA_APPROVAL_ACKNOWLEDGEMENT =
  "I compared this criterion with its cited source, confirm the exact biomarker, unit, bounds and applicability, and approve it only where every applicability requirement is met; this is not a diagnosis";
export const CRITERIA_NOTE_MIN = 10;

export type CriteriaDecision = "APPROVE" | "REJECT" | "REVOKE";
export type CriteriaAction = CriteriaDecision | "ATTEST";

export interface CriteriaEventBody {
  schema: typeof CRITERIA_EVENT_SCHEMA;
  seq: number;
  prevHash: string | null;
  recordedAt: string;
  actorUserId: string;
  action: CriteriaAction;
  criterionId: string;
  criterionSha256: string;
  batchId: string;
  missions: { missionId: string; conditions: string[] }[];
  acknowledgement: string | null;
  note: string;
  attestsEventHash: string | null;
  attestation: SignedCriteriaAttestation | null;
}
export interface CriteriaEvent extends CriteriaEventBody {
  hash: string;
}

export async function sealCriteriaEvent(body: CriteriaEventBody): Promise<CriteriaEvent> {
  return { ...body, hash: await sha256Hex(canonicalJson(body)) };
}

export async function verifyCriteriaChain(events: readonly CriteriaEvent[]): Promise<{ ok: true } | { ok: false; reason: string }> {
  let prev: string | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    if (e.schema !== CRITERIA_EVENT_SCHEMA) return { ok: false, reason: `event ${i + 1} has an unknown schema` };
    if (e.seq !== i + 1) return { ok: false, reason: `event ${i + 1} is out of sequence` };
    if (e.prevHash !== prev) return { ok: false, reason: `event ${i + 1} does not link to the previous event` };
    const { hash, ...body } = e;
    if ((await sha256Hex(canonicalJson(body))) !== hash) return { ok: false, reason: `event ${i + 1} was modified` };
    prev = hash;
  }
  return { ok: true };
}

export type CriterionReviewStatus =
  | "PENDING_RESEARCHER_REVIEW"
  | "APPROVED_AWAITING_ATTESTATION"
  | "APPROVED"
  | "REJECTED"
  | "REVOKED"
  | "BLOCKED";
export const CRITERION_STATUS_LABELS: Record<CriterionReviewStatus, string> = {
  PENDING_RESEARCHER_REVIEW: "Pending Researcher review",
  APPROVED_AWAITING_ATTESTATION: "Approved on this device — awaiting server attestation (not applied)",
  APPROVED: "Approved (server-attested)",
  REJECTED: "Rejected",
  REVOKED: "Approval revoked",
  BLOCKED: "Cannot be approved",
};

export interface CriterionReviewState {
  criterionId: string;
  fingerprint: string;
  status: CriterionReviewStatus;
  blocker: string | null;
  missions: { missionId: string; conditions: string[] }[];
  lastDecision: CriteriaEvent | null;
  history: CriteriaEvent[];
}

export interface CriteriaReviewResolution {
  chainOk: boolean;
  problem: string | null;
  states: CriterionReviewState[];
  approved: ApprovedCriterion[];
}

/**
 * Resolve the review state of every registry criterion from the device events.
 * A broken chain is ignored entirely (nothing approved).
 */
export async function resolveCriteriaReview(
  registry: CriteriaRegistry,
  events: readonly CriteriaEvent[],
  trustedKeys: readonly CriteriaTrustedKey[] = BUNDLED_CRITERIA_KEYS,
): Promise<CriteriaReviewResolution> {
  const chain = await verifyCriteriaChain(events);
  const usable = chain.ok ? events : [];
  const states: CriterionReviewState[] = [];
  const approved: ApprovedCriterion[] = [];
  for (const c of registry.criteria) {
    const fp = await criterionFingerprint(c);
    const mine = usable.filter((e) => e.criterionId === c.id);
    const blocker = approvalBlocker(c);
    let status: CriterionReviewStatus = blocker ? "BLOCKED" : "PENDING_RESEARCHER_REVIEW";
    let last: CriteriaEvent | null = null;
    let missions: CriterionReviewState["missions"] = [];
    let applied: { event: CriteriaEvent; attestedAt: string } | null = null;
    for (const e of mine) {
      if (e.criterionSha256 !== fp) continue; // decisions about other content never apply
      if (e.action === "ATTEST") {
        if (!last || last.action !== "APPROVE" || e.attestsEventHash !== last.hash || !e.attestation) continue;
        const st = e.attestation.statement;
        const ok =
          (await verifyCriteriaAttestation(e.attestation, trustedKeys)) &&
          st.eventHash === last.hash &&
          st.criterionId === c.id &&
          st.criterionSha256 === fp &&
          st.action === "APPROVE" &&
          st.actorUserId === last.actorUserId &&
          canonicalJson(st.missions) === canonicalJson(last.missions);
        if (ok && !blocker) {
          status = "APPROVED";
          applied = { event: last, attestedAt: st.attestedAt };
        }
        continue;
      }
      last = e;
      applied = null;
      missions = e.action === "APPROVE" ? e.missions : [];
      status = blocker ? "BLOCKED" : e.action === "APPROVE" ? "APPROVED_AWAITING_ATTESTATION" : e.action === "REJECT" ? "REJECTED" : "REVOKED";
    }
    states.push({ criterionId: c.id, fingerprint: fp, status, blocker, missions, lastDecision: last, history: mine });
    if (status === "APPROVED" && applied)
      approved.push({
        criterion: c,
        fingerprint: fp,
        missions: applied.event.missions,
        approvedAt: applied.attestedAt,
        approverUserId: applied.event.actorUserId,
        approvalRef: `P57-${applied.event.hash.slice(0, 10)}`,
      });
  }
  return { chainOk: chain.ok, problem: chain.ok ? null : chain.reason, states, approved };
}

// ------------------------------------------------------------ planning decisions (bulk by domain, with exceptions)

export interface CriteriaActor {
  userId: string | null | undefined;
  /** Missions where the caller holds an active Researcher membership (fresh server read). */
  researcherMissions: readonly string[];
  now: string;
}
export interface CriteriaDecisionInput {
  action: CriteriaDecision;
  criterionIds: readonly string[];
  /** For APPROVE: missions covered and the mission-level conditions attested for each. */
  missions: { missionId: string; conditions: string[] }[];
  acknowledgement: string;
  note: string;
  batchId: string;
}
export type CriteriaPlan =
  | { ok: true; events: CriteriaEvent[]; skipped: { criterionId: string; reason: string }[] }
  | { ok: false; reason: string };

export async function planCriteriaDecisions(
  registry: CriteriaRegistry,
  existing: readonly CriteriaEvent[],
  resolution: CriteriaReviewResolution,
  actor: CriteriaActor,
  input: CriteriaDecisionInput,
): Promise<CriteriaPlan> {
  if (!actor.userId) return { ok: false, reason: "Sign in again: the Researcher could not be verified." };
  if (!actor.researcherMissions.length) return { ok: false, reason: "Only an active Researcher can record reference-criteria decisions." };
  if (!resolution.chainOk) return { ok: false, reason: `The decision history failed its integrity check (${resolution.problem}); nothing can be recorded until it is reloaded.` };
  if (!input.criterionIds.length) return { ok: false, reason: "Select at least one criterion." };
  if (input.criterionIds.length > 50) return { ok: false, reason: "At most 50 criteria per batch." };
  if (input.note.trim().length < CRITERIA_NOTE_MIN) return { ok: false, reason: `A review note of at least ${CRITERIA_NOTE_MIN} characters is required.` };
  if (input.action === "APPROVE") {
    if (input.acknowledgement !== CRITERIA_APPROVAL_ACKNOWLEDGEMENT) return { ok: false, reason: "The exact approval acknowledgement is required." };
    if (!input.missions.length) return { ok: false, reason: "Name at least one mission this approval applies to." };
    const foreign = input.missions.filter((m) => !actor.researcherMissions.includes(m.missionId));
    if (foreign.length) return { ok: false, reason: `You are not an active Researcher for: ${foreign.map((m) => m.missionId).join(", ")}.` };
  }
  const skipped: { criterionId: string; reason: string }[] = [];
  const bodies: Omit<CriteriaEventBody, "seq" | "prevHash">[] = [];
  for (const id of [...new Set(input.criterionIds)]) {
    const c = registry.criteria.find((x) => x.id === id);
    const state = resolution.states.find((s) => s.criterionId === id);
    if (!c || !state) { skipped.push({ criterionId: id, reason: "not in the validated registry" }); continue; }
    if (input.action === "APPROVE") {
      if (state.blocker) { skipped.push({ criterionId: id, reason: state.blocker }); continue; }
      if (state.status === "APPROVED" || state.status === "APPROVED_AWAITING_ATTESTATION") { skipped.push({ criterionId: id, reason: "already approved" }); continue; }
      const required = c.applicability.missionLevel.map((x) => x.id);
      const missing = input.missions.filter((m) => required.some((r) => !m.conditions.includes(r)));
      if (missing.length) { skipped.push({ criterionId: id, reason: `mission-level conditions not attested for ${missing.map((m) => m.missionId).join(", ")}` }); continue; }
    } else if (input.action === "REVOKE" && state.status !== "APPROVED" && state.status !== "APPROVED_AWAITING_ATTESTATION") {
      skipped.push({ criterionId: id, reason: "no approval to revoke" });
      continue;
    } else if (input.action === "REJECT" && state.status === "REJECTED") {
      skipped.push({ criterionId: id, reason: "already rejected" });
      continue;
    }
    const conditionsFor = (m: { missionId: string; conditions: string[] }) => ({
      missionId: m.missionId,
      conditions: [...new Set(m.conditions.filter((x) => c.applicability.missionLevel.some((y) => y.id === x)))].sort(),
    });
    bodies.push({
      schema: CRITERIA_EVENT_SCHEMA,
      recordedAt: actor.now,
      actorUserId: actor.userId,
      action: input.action,
      criterionId: id,
      criterionSha256: state.fingerprint,
      batchId: input.batchId,
      missions: input.action === "APPROVE" ? input.missions.map(conditionsFor).sort((a, b) => a.missionId.localeCompare(b.missionId)) : [],
      acknowledgement: input.action === "APPROVE" ? input.acknowledgement : null,
      note: input.note.trim(),
      attestsEventHash: null,
      attestation: null,
    });
  }
  return { ok: true, events: await chainBodies(existing, bodies), skipped };
}

async function chainBodies(existing: readonly CriteriaEvent[], bodies: Omit<CriteriaEventBody, "seq" | "prevHash">[]): Promise<CriteriaEvent[]> {
  const out: CriteriaEvent[] = [];
  let prev = existing.at(-1)?.hash ?? null;
  let seq = existing.length;
  for (const b of bodies) {
    const e = await sealCriteriaEvent({ ...b, seq: ++seq, prevHash: prev } as CriteriaEventBody);
    out.push(e);
    prev = e.hash;
  }
  return out;
}

/** ATTEST events for server attestations that match their APPROVE events exactly. */
export async function planCriteriaAttestations(
  existing: readonly CriteriaEvent[],
  attestations: readonly SignedCriteriaAttestation[],
  actor: { userId: string; now: string },
  trustedKeys: readonly CriteriaTrustedKey[] = BUNDLED_CRITERIA_KEYS,
): Promise<{ events: CriteriaEvent[]; rejected: { eventHash: string; reason: string }[] }> {
  const rejected: { eventHash: string; reason: string }[] = [];
  const bodies: Omit<CriteriaEventBody, "seq" | "prevHash">[] = [];
  for (const a of attestations) {
    const target = existing.find((e) => e.hash === a.statement.eventHash);
    if (!target || target.action !== "APPROVE") { rejected.push({ eventHash: a.statement.eventHash, reason: "no matching approval event" }); continue; }
    if (!(await verifyCriteriaAttestation(a, trustedKeys))) { rejected.push({ eventHash: target.hash, reason: "signature not trusted" }); continue; }
    if (a.statement.actorUserId !== actor.userId || target.actorUserId !== actor.userId) { rejected.push({ eventHash: target.hash, reason: "attested for a different account" }); continue; }
    bodies.push({
      schema: CRITERIA_EVENT_SCHEMA,
      recordedAt: actor.now,
      actorUserId: actor.userId,
      action: "ATTEST",
      criterionId: target.criterionId,
      criterionSha256: target.criterionSha256,
      batchId: target.batchId,
      missions: target.missions,
      acknowledgement: null,
      note: "Server attestation of the approval event.",
      attestsEventHash: target.hash,
      attestation: a,
    });
  }
  return { events: await chainBodies(existing, bodies), rejected };
}

/** Server-side re-check of one APPROVE/REJECT/REVOKE event before signing (pure). */
export async function attestationProblem(
  event: unknown,
  registry: CriteriaRegistry,
  caller: { userId: string; researcherMissions: readonly string[] },
): Promise<string | null> {
  const e = event as Partial<CriteriaEvent> | null;
  if (!e || e.schema !== CRITERIA_EVENT_SCHEMA || typeof e.hash !== "string" || !["APPROVE", "REJECT", "REVOKE"].includes(e.action as string)) return "Only a criteria decision event can be attested.";
  const { hash, ...body } = e as CriteriaEvent;
  if ((await sha256Hex(canonicalJson(body))) !== hash) return "The decision event does not match its hash.";
  if (body.actorUserId !== caller.userId) return "A decision can only be attested for the account that recorded it.";
  const c: ReferenceCriterion | undefined = registry.criteria.find((x) => x.id === body.criterionId);
  if (!c) return "The criterion is not in the validated registry.";
  if ((await criterionFingerprint(c)) !== body.criterionSha256) return "The criterion changed since the decision; review it again.";
  if (body.note.trim().length < CRITERIA_NOTE_MIN) return "The review note is missing.";
  if (body.action === "APPROVE") {
    const blocker = approvalBlocker(c);
    if (blocker) return blocker;
    if (body.acknowledgement !== CRITERIA_APPROVAL_ACKNOWLEDGEMENT) return "The approval acknowledgement is missing.";
    if (!body.missions.length) return "The approval names no mission.";
    for (const m of body.missions) {
      if (!caller.researcherMissions.includes(m.missionId)) return `The caller is not an active Researcher for ${m.missionId}.`;
      const missing = c.applicability.missionLevel.filter((x) => !m.conditions.includes(x.id));
      if (missing.length) return `Mission-level conditions not attested for ${m.missionId}.`;
    }
  }
  return null;
}
