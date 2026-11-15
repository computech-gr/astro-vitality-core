/**
 * P72.9 — Server-confirmed Health Intelligence report dataset (pure; no React, no IndexedDB writes).
 *
 * One immutable, validated dataset snapshot feeds the on-screen report and every export:
 *  - SERVER-CONFIRMED (default when an authorized server dataset exists): the complete authorized
 *    examination and Ground Medical review dataset for one mission/crew/provenance is read through the
 *    existing caller-scoped read APIs (v9.4 observation pull, v9 review pull). Every page is read;
 *    any refusal, unreadable row, scope mismatch or unfinished pagination fails closed. Nothing is
 *    written to this device's encrypted store (downloads stay with the explicit sync workflows).
 *  - LOCAL OFFLINE (explicit user choice only): the complete, successfully read encrypted local store,
 *    always labelled "LOCAL OFFLINE DATASET — NOT SERVER VERIFIED".
 * The source is never switched silently: a failed server retrieval stays a failure until the user
 * explicitly chooses the local offline report.
 */
import type { AttestationEvent } from "./evidence-attestation";
import { canonicalJson, validateUnifiedObservation, type UnifiedObservation } from "./observation-envelope";
import { collapseUnifiedObservationVersions } from "./observation-store";
import { compareObservationDates, observationDay } from "./observation-date";
import { OBSERVATION_SYNC_PAGE_MAX, observationContentSha256, type SyncScope } from "./observation-sync";
import type { PullResponse } from "./observation-sync-runner";
import { attestationSyncPayload, remoteRowToAttestation } from "./review-sync";
import type { UnifiedReportInputs } from "./unified-health-report";

export const REPORT_DATASET_VERSION = "p72.9-report-dataset.v1" as const;
/** Scientific/report engine identifier printed in every export (changes only with report-engine releases). */
export const REPORT_ENGINE_VERSION = "mitochondria-health-intelligence p59-premium/p58-professional · dataset p72.9.v1" as const;
export const LOCAL_OFFLINE_LABEL = "LOCAL OFFLINE DATASET — NOT SERVER VERIFIED" as const;
export const SERVER_CONFIRMED_LABEL = "SERVER-CONFIRMED" as const;
/** Upper bound of pages per stream; reaching it with more pages left is an incomplete read. */
export const REPORT_DATASET_MAX_PAGES = 500;
export const REVIEW_PAGE_LIMIT = 500;

export type ReportDataSource = "server_confirmed" | "local_offline";

export type ReviewPullResponse =
  | { ok: true; rows: Record<string, string | number | null>[]; lastSeq: number; hasMore: boolean }
  | { ok: false; code: string; message: string };

export interface DatasetSummary {
  /** Accepted, non-erroneous, current observations of this provenance (what the report can evaluate). */
  examinations: number;
  examinationDates: string[];
  firstDate: string | null;
  lastDate: string | null;
}

export interface ReportDatasetSnapshot {
  version: typeof REPORT_DATASET_VERSION;
  source: ReportDataSource;
  scope: SyncScope;
  /** Bound to the retrieval that produced it; exports check it is still the displayed one. */
  token: number;
  inputs: Readonly<UnifiedReportInputs>;
  attestations: readonly AttestationEvent[];
  observationEvents: number;
  reviewEvents: number;
  /** SHA-256 over the canonical content of the complete scope dataset (observations + reviews), independent of period and order. */
  datasetFingerprint: string;
  summary: DatasetSummary;
  pages: { observations: number; reviews: number } | null;
}

export type ServerDatasetFailureCode = "offline" | "forbidden" | "unavailable" | "incomplete" | "invalid" | "network";

export type ServerDatasetResult =
  | { kind: "ready"; snapshot: ReportDatasetSnapshot }
  | { kind: "failed"; token: number; code: ServerDatasetFailureCode; reason: string };

export interface ServerDatasetDeps {
  pullObservations: (args: { scope: SyncScope; afterSeq: number; limit: number }) => Promise<PullResponse>;
  pullReviews: (args: { scope: SyncScope; kind: "attestation"; afterSeq: number; limit: number }) => Promise<ReviewPullResponse>;
  /** navigator.onLine; false = offline, so no server dataset can be retrieved. */
  online?: boolean | undefined;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Deterministic order: newest first by recorded date (same as the local reader), then by ID. */
export function orderObservations(rows: readonly UnifiedObservation[]): UnifiedObservation[] {
  return [...rows].sort((a, b) => compareObservationDates(b, a) || a.id.localeCompare(b.id));
}

export function orderAttestations(rows: readonly AttestationEvent[]): AttestationEvent[] {
  return [...rows].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || a.eventId.localeCompare(b.eventId));
}

/** What the report can evaluate in this dataset (all periods), for the "local examinations" line. */
export function summarizeDataset(observations: readonly UnifiedObservation[], provenance: SyncScope["provenance"]): DatasetSummary {
  const superseded = new Set(observations.filter((o) => o.supersedesId && o.status !== "erroneous").map((o) => o.supersedesId!));
  const usable = observations.filter((o) => o.provenance === provenance && o.status !== "erroneous" && o.reviewState === "accepted" && !superseded.has(o.id));
  const dates = [...new Set(usable.map((o) => observationDay(o.observedAt)).filter(Boolean))].sort();
  return { examinations: usable.length, examinationDates: dates, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null };
}

/**
 * Fingerprint of the complete scope dataset: identical content gives the identical value on every
 * device and from either source, regardless of read order.
 */
export async function datasetFingerprint(inputs: UnifiedReportInputs, attestations: readonly AttestationEvent[], scope: SyncScope): Promise<string> {
  const obs = (await Promise.all(inputs.unifiedObservations.filter((o) => o.provenance === scope.provenance).map(async (o) => `obs ${o.id} ${await observationContentSha256(o)}`))).sort();
  const rev = attestations.map((a) => `rev ${a.eventId} ${canonicalJson(attestationSyncPayload(a))}`).sort();
  const domainEntries = Object.entries(inputs.domainEntries ?? {}).flatMap(([d, entries]) => (entries ?? []).map((e) => `dom ${d} ${canonicalJson(e)}`)).sort();
  const devices = (inputs.deviceRecords ?? []).map((r) => `dev ${r.id}`).sort();
  return sha256Hex([`scope ${scope.missionId}|${scope.crewMemberId}|${scope.provenance}`, ...obs, ...rev, ...domainEntries, ...devices].join("\n"));
}

/**
 * Read-only retrieval of the complete authorized server dataset for exactly one scope. Every page of
 * both streams is read; any failure returns `failed` and never a partial snapshot.
 */
export async function fetchServerReportDataset(scope: SyncScope, token: number, deps: ServerDatasetDeps, maxPages = REPORT_DATASET_MAX_PAGES): Promise<ServerDatasetResult> {
  const fail = (code: ServerDatasetFailureCode, reason: string): ServerDatasetResult => ({ kind: "failed", token, code, reason });
  if (deps.online === false) return fail("offline", "This device is offline, so the authorized server dataset could not be retrieved.");

  // 1. Examinations (v9.4 caller-scoped pull; decrypted and validated server-side).
  const byEvent = new Map<string, { eventKind: "entry" | "status"; observation: UnifiedObservation; json: string }>();
  let afterSeq = 0;
  let obsPages = 0;
  for (;;) {
    if (obsPages >= maxPages) return fail("incomplete", `Only part of the server examinations could be read (stopped after ${obsPages} pages). No report was generated.`);
    let res: PullResponse;
    try {
      res = await deps.pullObservations({ scope, afterSeq, limit: OBSERVATION_SYNC_PAGE_MAX });
    } catch {
      return fail("network", "The server could not be reached to retrieve the examinations.");
    }
    obsPages++;
    if (!res.ok) {
      if (res.code === "forbidden") return fail("forbidden", "The server did not authorize access to these examinations.");
      if (res.code === "disabled" || res.code === "migration_required") return fail("unavailable", "Server copies are not available for this data type.");
      return fail("unavailable", "The server examinations could not be retrieved.");
    }
    if (res.problems.length) return fail("invalid", `${res.problems.length} server examination record(s) could not be read. No report was generated.`);
    for (const e of res.events) {
      const o = e.observation;
      if (o.missionId !== scope.missionId || o.crewMemberId !== scope.crewMemberId || o.provenance !== scope.provenance)
        return fail("invalid", "A server examination record did not match this mission, crew member and data type. No report was generated.");
      if (e.eventId !== `${o.id}:${e.eventKind}` || (e.eventKind === "status") !== (o.status === "erroneous") || validateUnifiedObservation(o))
        return fail("invalid", "A server examination record failed validation. No report was generated.");
      const json = canonicalJson(o);
      const prior = byEvent.get(e.eventId);
      if (prior && prior.json !== json) return fail("invalid", "The server returned two different versions of the same examination record. No report was generated.");
      byEvent.set(e.eventId, { eventKind: e.eventKind, observation: o, json });
    }
    if (!res.hasMore) break;
    if (!(res.lastSeq > afterSeq)) return fail("incomplete", "Only part of the server examinations could be read (the page position did not advance).");
    afterSeq = res.lastSeq;
  }

  // 2. Ground Medical review events (v9 caller-scoped pull).
  const reviews = new Map<string, { event: AttestationEvent; json: string }>();
  let revSeq = 0;
  let revPages = 0;
  for (;;) {
    if (revPages >= maxPages) return fail("incomplete", `Only part of the server reviews could be read (stopped after ${revPages} pages). No report was generated.`);
    let res: ReviewPullResponse;
    try {
      res = await deps.pullReviews({ scope, kind: "attestation", afterSeq: revSeq, limit: REVIEW_PAGE_LIMIT });
    } catch {
      return fail("network", "The server could not be reached to retrieve the medical reviews.");
    }
    revPages++;
    if (!res.ok) {
      if (res.code === "forbidden") return fail("forbidden", "The server did not authorize access to the medical reviews of these examinations.");
      return fail("unavailable", "The server medical reviews could not be retrieved.");
    }
    for (const row of res.rows) {
      const event = remoteRowToAttestation(row, scope);
      if (!event) return fail("invalid", "A server medical review record failed validation. No report was generated.");
      const json = canonicalJson(attestationSyncPayload(event));
      const prior = reviews.get(event.eventId);
      if (prior && prior.json !== json) return fail("invalid", "The server returned two different versions of the same review record. No report was generated.");
      reviews.set(event.eventId, { event, json });
    }
    if (!res.hasMore) break;
    if (!(res.lastSeq > revSeq)) return fail("incomplete", "Only part of the server reviews could be read (the page position did not advance).");
    revSeq = res.lastSeq;
  }

  // 3. Deterministic collapse and ordering (status events always win, as on the device).
  const ordered = [...byEvent.entries()].sort(([a], [b]) => a.localeCompare(b));
  const observations = orderObservations(
    collapseUnifiedObservationVersions(ordered.map(([, v]) => ({ observation: v.observation, storedAt: v.eventKind === "status" ? "1" : "0" }))),
  );
  const inputs: UnifiedReportInputs = { domainEntries: {}, unifiedObservations: observations, deviceRecords: [] };
  const attestations = orderAttestations([...reviews.values()].map((r) => r.event));
  const snapshot: ReportDatasetSnapshot = {
    version: REPORT_DATASET_VERSION,
    source: "server_confirmed",
    scope: { ...scope },
    token,
    inputs,
    attestations,
    observationEvents: byEvent.size,
    reviewEvents: reviews.size,
    datasetFingerprint: await datasetFingerprint(inputs, attestations, scope),
    summary: summarizeDataset(observations, scope.provenance),
    pages: { observations: obsPages, reviews: revPages },
  };
  return { kind: "ready", snapshot: deepFreeze(snapshot) };
}

/** Explicit local offline snapshot from a complete, successful local read. */
export async function localOfflineSnapshot(scope: SyncScope, token: number, inputs: UnifiedReportInputs, attestations: readonly AttestationEvent[]): Promise<ReportDatasetSnapshot> {
  const observations = orderObservations(inputs.unifiedObservations);
  const frozenInputs: UnifiedReportInputs = { ...inputs, unifiedObservations: observations };
  const scoped = orderAttestations(attestations.filter((a) => a.scope.missionId === scope.missionId && a.scope.crewMemberId === scope.crewMemberId && a.scope.provenance === scope.provenance));
  return deepFreeze({
    version: REPORT_DATASET_VERSION,
    source: "local_offline",
    scope: { ...scope },
    token,
    inputs: frozenInputs,
    attestations: scoped,
    observationEvents: observations.filter((o) => o.provenance === scope.provenance).length,
    reviewEvents: scoped.length,
    datasetFingerprint: await datasetFingerprint(frozenInputs, scoped, scope),
    summary: summarizeDataset(observations, scope.provenance),
    pages: null,
  } satisfies ReportDatasetSnapshot);
}

/** Records present on this device but absent from the server snapshot (shown as a notice; never merged in). */
export function localRecordsNotOnServer(server: ReportDatasetSnapshot, local: UnifiedReportInputs | null): { observations: number; deviceOnly: number } {
  if (!local) return { observations: 0, deviceOnly: 0 };
  const ids = new Set(server.inputs.unifiedObservations.map((o) => o.id));
  const observations = local.unifiedObservations.filter((o) => o.provenance === server.scope.provenance && !ids.has(o.id)).length;
  const deviceOnly = Object.values(local.domainEntries ?? {}).reduce((n, e) => n + (e?.length ?? 0), 0) + (local.deviceRecords?.length ?? 0);
  return { observations, deviceOnly };
}

// ---------- Source state and readiness ----------

export type ServerDatasetState = { kind: "idle" } | { kind: "loading"; token: number } | ServerDatasetResult;

export type LocalDatasetState =
  | { kind: "idle" }
  | { kind: "loading"; token: number }
  | { kind: "ready"; token: number; inputs: UnifiedReportInputs; complete: boolean; readRecords: number; storedRecords: number | null }
  | { kind: "failed"; token: number; message: string };

export type DatasetReadinessState =
  | "no_selection"
  | "server_loading"
  | "server_failed"
  | "ready_server_confirmed"
  | "local_loading"
  | "local_failed"
  | "local_incomplete"
  | "ready_local_offline";

export interface DatasetReadiness {
  version: typeof REPORT_DATASET_VERSION;
  state: DatasetReadinessState;
  exportAllowed: boolean;
  source: ReportDataSource | null;
  dataStatus: "not_retrieved" | "no_examinations" | "examinations_present";
  title: string;
  detail: string;
  /** True only when a failed server retrieval may be replaced by an EXPLICIT local offline report. */
  offerLocalOffline: boolean;
}

export function localOfflineEligible(local: LocalDatasetState): boolean {
  return local.kind === "ready" && local.complete;
}

const range = (s: DatasetSummary) => (s.firstDate ? (s.firstDate === s.lastDate ? s.firstDate : `${s.firstDate} to ${s.lastDate}`) : "no dates");

export function assessDatasetReadiness(input: {
  hasSelection: boolean;
  mode: ReportDataSource;
  server: ServerDatasetState;
  local: LocalDatasetState;
  snapshot: ReportDatasetSnapshot | null;
  /** Accepted observations included in the selected period (from the snapshot the analysis used). */
  includedObservations: number;
}): DatasetReadiness {
  const base = { version: REPORT_DATASET_VERSION, exportAllowed: false, source: null, dataStatus: "not_retrieved" as const, offerLocalOffline: false };
  if (!input.hasSelection) return { ...base, state: "no_selection", title: "Select a crew member", detail: "Choose an authorized mission and crew member to load examinations." };
  const dataStatus = input.includedObservations > 0 ? ("examinations_present" as const) : ("no_examinations" as const);
  if (input.mode === "server_confirmed") {
    const s = input.server;
    if (s.kind === "idle" || s.kind === "loading")
      return { ...base, state: "server_loading", title: "Retrieving the authorized examination dataset from the server…", detail: "Read-only: every page of examinations and medical reviews is read; nothing is stored on this device. The report and its downloads are available once retrieval finishes." };
    if (s.kind === "failed")
      return {
        ...base,
        state: "server_failed",
        title: "Server-confirmed report unavailable",
        detail: `${s.reason} Examinations may exist that this report cannot show, so no server-confirmed report was generated; this is not a negative finding.${localOfflineEligible(input.local) ? " You can explicitly generate a LOCAL OFFLINE report from the examinations stored on this device." : input.local.kind === "loading" ? " Checking whether a local offline report is possible…" : " No complete local dataset is available on this device for an offline report."}`,
        offerLocalOffline: localOfflineEligible(input.local),
      };
    const snap = input.snapshot;
    if (!snap || snap.source !== "server_confirmed" || snap.token !== s.snapshot.token)
      return { ...base, state: "server_loading", title: "Preparing the server-confirmed report…", detail: "The retrieved dataset is being analysed." };
    return {
      ...base,
      state: "ready_server_confirmed",
      exportAllowed: true,
      source: "server_confirmed",
      dataStatus,
      title: dataStatus === "no_examinations" ? "Server-confirmed: no examinations in this period" : "Server-confirmed report",
      detail: `Complete authorized server dataset: ${snap.observationEvents} examination record(s) and ${snap.reviewEvents} medical review record(s), ${snap.summary.examinations} evaluable observation(s) on ${snap.summary.examinationDates.length} date(s) (${range(snap.summary)}). Read-only; nothing was stored on this device.`,
    };
  }
  const l = input.local;
  if (l.kind === "idle" || l.kind === "loading")
    return { ...base, state: "local_loading", title: "Reading examinations stored on this device…", detail: "The local offline report is available once loading finishes." };
  if (l.kind === "failed") return { ...base, state: "local_failed", title: "Local examinations could not be read", detail: `${l.message} No report was generated; this is not a negative finding.` };
  if (!l.complete)
    return { ...base, state: "local_incomplete", title: "Only part of the stored examinations were read", detail: `${l.readRecords} of ${l.storedRecords ?? "?"} stored records were read. Reload the page; no local offline report was generated.` };
  const snap = input.snapshot;
  if (!snap || snap.source !== "local_offline" || snap.token !== l.token)
    return { ...base, state: "local_loading", title: "Preparing the local offline report…", detail: "The local dataset is being analysed." };
  return {
    ...base,
    state: "ready_local_offline",
    exportAllowed: true,
    source: "local_offline",
    dataStatus,
    title: LOCAL_OFFLINE_LABEL,
    detail: `${snap.summary.examinations} local evaluable observation(s) on ${snap.summary.examinationDates.length} date(s) (${range(snap.summary)}) stored on this device. This is not a complete server dataset: the server may hold examinations not shown here.`,
  };
}
