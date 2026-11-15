/**
 * P72.8 — Health Intelligence report data readiness (pure; no React, no network, no writes).
 *
 * The report is computed from THIS DEVICE's encrypted local store. Two devices therefore produce
 * different reports when one of them has not imported the mission's examinations. This module:
 *  1. compares the local events of one mission/crew/provenance with the server's copies through the
 *     existing read-only v9.4 pull (full cursor scan; nothing is imported or written), and
 *  2. decides whether a completed report may be exported, distinguishing explicitly between
 *     "no examinations exist in the period", "examinations exist but could not be retrieved" and
 *     "examinations were retrieved" (findings or no findings).
 * A loading, failed, partial or stale read never yields an exportable report, so missing data can
 * never be printed as "No high-priority findings".
 */
import type { UnifiedObservation } from "./observation-envelope";
import { OBSERVATION_SYNC_PAGE_MAX, observationContentSha256, type SyncScope } from "./observation-sync";
import type { PullResponse } from "./observation-sync-runner";
import type { ReportSourceCoverage } from "./p60-observation-census";

export const REPORT_READINESS_VERSION = "p72.8-report-readiness.v1";
/** Upper bound of server pages scanned (100 events each). Reaching it with more pages left is a partial read. */
export const SERVER_COMPARISON_MAX_PAGES = 500;

export type LocalReadState =
  | { kind: "idle" }
  | { kind: "loading"; scopeKey: string; token: number }
  | { kind: "ready"; scopeKey: string; token: number }
  | { kind: "failed"; scopeKey: string; token: number; message: string };

export type ServerComparison =
  | { kind: "pending" }
  | { kind: "checking"; token: number }
  | { kind: "matched"; token: number; remoteEvents: number; localEvents: number; localOnly: number; pages: number }
  | { kind: "missing_locally"; token: number; remoteEvents: number; localEvents: number; missing: number; missingIds: string[] }
  | { kind: "inconsistent"; token: number; remoteEvents: number; conflicts: number; conflictIds: string[] }
  | { kind: "failed"; token: number; reason: string }
  | { kind: "unavailable"; token: number; reason: string };

export interface ServerComparisonDeps {
  listLocal: () => Promise<{ eventId: string; eventKind: "entry" | "status"; observation: UnifiedObservation }[]>;
  pull: (args: { scope: SyncScope; afterSeq: number; limit: number }) => Promise<PullResponse>;
  /** navigator.onLine; false means the device is offline, so no server comparison is possible. */
  online?: boolean;
}

/**
 * Read-only comparison of the local store with the server copies for exactly one scope. Every page is
 * read; any refused page, undecryptable/invalid server row, or unfinished pagination is a failure.
 */
export async function compareLocalWithServer(
  scope: SyncScope,
  token: number,
  deps: ServerComparisonDeps,
  maxPages = SERVER_COMPARISON_MAX_PAGES,
): Promise<ServerComparison> {
  if (deps.online === false) return { kind: "unavailable", token, reason: "This device is offline, so the report could not be compared with the server copies." };
  let local: Awaited<ReturnType<ServerComparisonDeps["listLocal"]>>;
  try {
    local = (await deps.listLocal()).filter((e) => e.observation.provenance === scope.provenance);
  } catch {
    return { kind: "failed", token, reason: "The examinations stored on this device could not be read." };
  }
  const localById = new Map(local.map((e) => [e.eventId, e.observation]));
  const remoteIds = new Set<string>();
  const missing: string[] = [];
  const conflicts: string[] = [];
  let afterSeq = 0;
  let pages = 0;
  for (;;) {
    if (pages >= maxPages) return { kind: "failed", token, reason: `Only part of the server examinations could be read (stopped after ${pages} pages). No report was completed.` };
    let res: PullResponse;
    try {
      res = await deps.pull({ scope, afterSeq, limit: OBSERVATION_SYNC_PAGE_MAX });
    } catch {
      return { kind: "failed", token, reason: "The server could not be reached to confirm the examinations." };
    }
    pages++;
    if (!res.ok) {
      if (res.code === "disabled" || res.code === "migration_required")
        return { kind: "unavailable", token, reason: "Server copies are not available for this data type, so the report could not be compared with them." };
      return { kind: "failed", token, reason: res.code === "forbidden" ? "The server did not confirm your access to these examinations." : "The server examinations could not be retrieved." };
    }
    if (res.problems.length)
      return { kind: "failed", token, reason: `${res.problems.length} server examination record(s) could not be read. No report was completed.` };
    for (const e of res.events) {
      if (remoteIds.has(e.eventId)) continue;
      remoteIds.add(e.eventId);
      // The server already validated each event (including demo catalogs); here only scope and identity are re-checked.
      const o = e.observation;
      if (o.missionId !== scope.missionId || o.crewMemberId !== scope.crewMemberId || o.provenance !== scope.provenance || e.eventId !== `${o.id}:${e.eventKind}`)
        return { kind: "failed", token, reason: "A server examination record did not match this mission and crew member. No report was completed." };
      const mine = localById.get(e.eventId);
      if (!mine) missing.push(e.eventId);
      else if ((await observationContentSha256(mine)) !== (await observationContentSha256(o))) conflicts.push(e.eventId);
    }
    if (!res.hasMore) break;
    if (!(res.lastSeq > afterSeq)) return { kind: "failed", token, reason: "Only part of the server examinations could be read (the page position did not advance)." };
    afterSeq = res.lastSeq;
  }
  missing.sort();
  conflicts.sort();
  if (missing.length) return { kind: "missing_locally", token, remoteEvents: remoteIds.size, localEvents: local.length, missing: missing.length, missingIds: missing.slice(0, 20) };
  if (conflicts.length) return { kind: "inconsistent", token, remoteEvents: remoteIds.size, conflicts: conflicts.length, conflictIds: conflicts.slice(0, 20) };
  const localOnly = local.filter((e) => !remoteIds.has(e.eventId)).length;
  return { kind: "matched", token, remoteEvents: remoteIds.size, localEvents: local.length, localOnly, pages };
}

export type ReadinessState =
  | "no_selection"
  | "loading"
  | "local_failed"
  | "incomplete_read"
  | "verifying"
  | "server_failed"
  | "missing_locally"
  | "inconsistent"
  | "ready_server_confirmed"
  | "ready_local_only";

/** What the data allows the report to say. */
export type ReportDataStatus = "not_retrieved" | "no_examinations" | "examinations_present";

export interface ReportReadiness {
  version: typeof REPORT_READINESS_VERSION;
  state: ReadinessState;
  exportAllowed: boolean;
  dataStatus: ReportDataStatus;
  basis: "server_confirmed" | "local_only" | null;
  title: string;
  detail: string;
}

const blocked = (state: ReadinessState, title: string, detail: string): ReportReadiness => ({
  version: REPORT_READINESS_VERSION, state, exportAllowed: false, dataStatus: "not_retrieved", basis: null, title, detail,
});

export function assessReportReadiness(input: {
  scopeKey: string;
  local: LocalReadState;
  /** Token of the local read the comparison must belong to (stale comparisons are ignored). */
  server: ServerComparison;
  coverage: ReportSourceCoverage | null | undefined;
  /** Accepted observations included in the selected period (from the same dataset the analysis uses). */
  includedObservations: number;
}): ReportReadiness {
  const { local, server } = input;
  if (!input.scopeKey) return blocked("no_selection", "Select a crew member", "Choose an authorized mission and crew member to load examinations.");
  if (local.kind === "idle" || local.kind === "loading" || local.scopeKey !== input.scopeKey)
    return blocked("loading", "Loading examinations…", "Examinations stored on this device are being read. The report and its downloads are not available until loading finishes.");
  if (local.kind === "failed")
    return blocked("local_failed", "Examinations could not be read", `${local.message} No report was generated; this is not a negative finding.`);
  if (input.coverage && input.coverage.complete === false)
    return blocked("incomplete_read", "Only part of the stored examinations were read", `${input.coverage.readRecords} of ${input.coverage.storedRecords ?? "?"} stored records were read. Reload the page before exporting; no report was completed.`);
  const sameRead = "token" in server && server.token === local.token;
  if (server.kind === "pending" || server.kind === "checking" || !sameRead)
    return blocked("verifying", "Confirming examinations with the server…", "The examinations on this device are being compared with the server copies. Downloads are available once this finishes.");
  if (server.kind === "failed")
    return blocked("server_failed", "Examinations could not be confirmed", `${server.reason} Examinations may exist that this device cannot show, so no report can be exported. Try again.`);
  if (server.kind === "missing_locally")
    return blocked(
      "missing_locally",
      "Examinations exist but are not on this device",
      `The server holds ${server.missing} examination record(s) for this crew member that are not stored on this device (${server.remoteEvents} on the server, ${server.localEvents} here). Download them first (Examinations → "Sync observations & reviews", or the Researcher's "Download records to this device"), then the report becomes available.`,
    );
  if (server.kind === "inconsistent")
    return blocked("inconsistent", "This device's examinations differ from the server", `${server.conflicts} examination record(s) on this device have different content from the server copy. The report is not exported until Ground Medical resolves the difference.`);
  const dataStatus: ReportDataStatus = input.includedObservations > 0 ? "examinations_present" : "no_examinations";
  if (server.kind === "matched")
    return {
      version: REPORT_READINESS_VERSION, state: "ready_server_confirmed", exportAllowed: true, dataStatus, basis: "server_confirmed",
      title: dataStatus === "no_examinations" ? "Confirmed: no examinations in this period" : "Examinations confirmed with the server",
      detail: `All ${server.remoteEvents} server examination record(s) for this crew member are on this device${server.localOnly ? ` (plus ${server.localOnly} recorded here and not yet uploaded)` : ""}.`,
    };
  return {
    version: REPORT_READINESS_VERSION, state: "ready_local_only", exportAllowed: true, dataStatus, basis: "local_only",
    title: "This device only — not compared with the server",
    detail: `${server.reason} The report covers only the examinations stored on this device and is labelled accordingly.`,
  };
}

export interface ReportDataProvenance {
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
  period: string;
  examinationDates: readonly string[];
  observations: number;
  series: number;
  datasetFingerprint: string;
  basis: "server_confirmed" | "local_only";
  serverRecords: number | null;
  readinessVersion: string;
  /** Wall-clock export time. Never an input of any scientific calculation. */
  exportedAt: string;
}

/** Plain lines for the PDF provenance section (deterministic for identical inputs except exportedAt). */
export function reportProvenanceLines(p: ReportDataProvenance): string[] {
  return [
    `Mission ID: ${p.missionId} · Crew ID: ${p.crewMemberId} · Data: ${p.provenance.toUpperCase()}`,
    `Selected period: ${p.period}`,
    `Examination dates (${p.examinationDates.length}): ${p.examinationDates.length ? p.examinationDates.join(", ") : "none in this period"}`,
    `Observations evaluated: ${p.observations} in ${p.series} series`,
    `Dataset fingerprint (SHA-256 of exactly the observations evaluated): ${p.datasetFingerprint}`,
    p.basis === "server_confirmed"
      ? `Data basis: server-confirmed — every server copy for this crew member (${p.serverRecords ?? 0} record(s)) was present on the exporting device.`
      : "Data basis: THIS DEVICE ONLY — not compared with the server copies; another device may hold examinations not shown here.",
    `Export timestamp (UTC): ${p.exportedAt} — recorded for traceability only; not an input of any finding.`,
    `Readiness check: ${p.readinessVersion}`,
  ];
}
