/**
 * P48.2 focused Crew Self revalidation.
 *
 * Framework-free controller for the Daily Health Companion's private evidence. It never
 * reads or writes storage; authorization comes only from the injected mission-context and
 * evidence loaders (database RLS stays the server-side enforcement point). Every async
 * result is accepted only while its generation token is still current, so a delayed
 * response can never repopulate evidence after revocation, scope change, sign-out,
 * backgrounding or disposal.
 */
import type {
  ScientificEvidenceReport,
  ScientificObservation,
} from "@/domain/health-intelligence/live-evidence";

export type CrewScope = { missionId: string; crewMemberId: string };
export const crewScopeKey = (m: CrewScope) => `${m.missionId}|${m.crewMemberId}`;

export interface CrewMissionContext {
  signedIn: boolean;
  userId?: string;
  memberships: Array<{ missionId: string; crewMemberId?: string; role: string }>;
  error?: string;
}

export interface CrewEvidenceResult {
  report: ScientificEvidenceReport | null;
  reason?: string | undefined;
}

export type CrewPhase = "checking" | "hidden" | "loading" | "ready" | "none" | "revoked" | "error";

export const CREW_STATUS = {
  initial: "Checking mission authorization...",
  rechecking: "Re-checking Crew Self authorization; private data is hidden until confirmed.",
  hidden: "Private data hidden while this tab is in the background.",
  loading: "Loading authorized read-only evidence...",
  signedOut: "Sign in as the assigned Crew Self member to view your own health trends.",
  unauthorized: "No authorized Crew Self mission context. Private health data is unavailable.",
  revoked:
    "The previously shown Crew Self scope is no longer authorized; its data was cleared. Choose another authorized mission to continue.",
  authError: "Mission authorization unavailable; no private data shown. Retry when connected.",
  evidenceError: "Evidence unavailable; no private data shown. Retry when connected.",
  loaded: "Read-only evidence loaded.",
  noEvidence: "No eligible evidence.",
} as const;

export interface CrewEvidenceSink {
  setPhase(phase: CrewPhase, status: string): void;
  setScopes(scopes: CrewScope[], selected: string): void;
  /** `preserveFilters` is true only when the same scope was revalidated (not switched). */
  setReport(report: ScientificEvidenceReport | null, preserveFilters: boolean): void;
}

export interface CrewEvidenceDeps {
  /** The only role whose own-crew evidence this controller may request. */
  role: "crew_self";
  loadContext(): Promise<CrewMissionContext>;
  loadEvidence(missionId: string, crewMemberId: string): Promise<CrewEvidenceResult>;
  sink: CrewEvidenceSink;
}

export function allowedCrewScopes(
  memberships: CrewMissionContext["memberships"],
  role: "crew_self" = "crew_self",
): CrewScope[] {
  const seen = new Set<string>();
  const out: CrewScope[] = [];
  for (const m of memberships) {
    if (m.role !== role || !m.crewMemberId) continue;
    const scope = { missionId: m.missionId, crewMemberId: m.crewMemberId };
    if (seen.has(crewScopeKey(scope))) continue;
    seen.add(crewScopeKey(scope));
    out.push(scope);
  }
  return out;
}

export type AuthorizationOutcome =
  | { kind: "error"; status: string }
  | { kind: "none"; status: string }
  | { kind: "revoked"; scopes: CrewScope[]; status: string }
  | { kind: "authorized"; scopes: CrewScope[]; selected: string; sameScope: boolean };

/**
 * `previousKey` is the last authorized scope for the same signed-in user, or null when
 * there is none (first load, different user). A previous scope is restored only when it is
 * still present in fresh memberships; cached state never implies authorization.
 */
export function resolveAuthorization(
  ctx: CrewMissionContext,
  previousKey: string | null,
  role: "crew_self" = "crew_self",
): AuthorizationOutcome {
  if (ctx.error) return { kind: "error", status: CREW_STATUS.authError };
  if (!ctx.signedIn) return { kind: "none", status: CREW_STATUS.signedOut };
  const scopes = allowedCrewScopes(ctx.memberships, role);
  if (!scopes.length) return { kind: "none", status: CREW_STATUS.unauthorized };
  if (previousKey && scopes.some((s) => crewScopeKey(s) === previousKey))
    return { kind: "authorized", scopes, selected: previousKey, sameScope: true };
  if (previousKey) return { kind: "revoked", scopes, status: CREW_STATUS.revoked };
  return { kind: "authorized", scopes, selected: crewScopeKey(scopes[0]!), sameScope: false };
}

export interface TrendSelection {
  metric: string;
  window: "all" | "7" | "30" | "90";
  source: string;
}

const metricKey = (m: { metricCode: string; unit: string }) => `${m.metricCode}|${m.unit}`;

/** Restore metric/window/source only when each is still valid in the fresh report. */
export function restoreTrendSelection(
  report: ScientificEvidenceReport,
  prior: TrendSelection | null,
): TrendSelection {
  const first = report.metrics[0];
  const fallback: TrendSelection = {
    metric: first ? metricKey(first) : "",
    window: "all",
    source: "all",
  };
  if (!prior || !report.metrics.some((m) => metricKey(m) === prior.metric)) return fallback;
  const sourceValid =
    prior.source === "all" ||
    report.observations.some(
      (o: ScientificObservation) =>
        `${o.metricCode}|${o.unit}` === prior.metric && o.sourceId === prior.source,
    );
  return { metric: prior.metric, window: prior.window, source: sourceValid ? prior.source : "all" };
}

export function createCrewEvidenceController(deps: CrewEvidenceDeps) {
  let generation = 0;
  let disposed = false;
  let scopes: CrewScope[] = [];
  let lastKey: string | null = null;
  let lastUserId: string | undefined;

  const current = (token: number) => !disposed && token === generation;

  const hidePrivate = (phase: CrewPhase, status: string) => {
    deps.sink.setReport(null, false);
    deps.sink.setScopes([], "");
    deps.sink.setPhase(phase, status);
  };

  async function loadEvidence(token: number, key: string, preserveFilters: boolean) {
    const scope = scopes.find((s) => crewScopeKey(s) === key);
    if (!scope) return;
    deps.sink.setReport(null, false);
    deps.sink.setPhase("loading", CREW_STATUS.loading);
    let result: CrewEvidenceResult;
    try {
      result = await deps.loadEvidence(scope.missionId, scope.crewMemberId);
    } catch {
      if (current(token)) deps.sink.setPhase("error", CREW_STATUS.evidenceError);
      return;
    }
    if (!current(token)) return;
    const report = result.report;
    if (
      report &&
      (report.mission.missionId !== scope.missionId ||
        report.mission.crewMemberId !== scope.crewMemberId)
    ) {
      deps.sink.setPhase("error", CREW_STATUS.evidenceError);
      return;
    }
    deps.sink.setReport(report, preserveFilters);
    deps.sink.setPhase(
      report ? "ready" : "none",
      result.reason ?? (report ? CREW_STATUS.loaded : CREW_STATUS.noEvidence),
    );
  }

  return {
    /** Fail closed synchronously, then re-read mission context and (if allowed) evidence. */
    async revalidate(mode: "initial" | "return" | "auth" | "retry") {
      if (disposed) return;
      const token = ++generation;
      hidePrivate("checking", mode === "initial" ? CREW_STATUS.initial : CREW_STATUS.rechecking);
      scopes = [];
      let ctx: CrewMissionContext;
      try {
        ctx = await deps.loadContext();
      } catch {
        if (current(token)) deps.sink.setPhase("error", CREW_STATUS.authError);
        return;
      }
      if (!current(token)) return;
      const sameUser = Boolean(ctx.userId) && ctx.userId === lastUserId;
      const outcome = resolveAuthorization(ctx, sameUser ? lastKey : null, deps.role);
      if (outcome.kind === "error") {
        deps.sink.setPhase("error", outcome.status);
        return; // keep lastKey/lastUserId so an explicit retry can restore a still-valid scope
      }
      lastUserId = ctx.userId;
      if (outcome.kind === "none") {
        lastKey = null;
        deps.sink.setPhase("none", outcome.status);
        return;
      }
      scopes = outcome.scopes;
      if (outcome.kind === "revoked") {
        lastKey = null;
        deps.sink.setScopes(scopes, "");
        deps.sink.setPhase("revoked", outcome.status);
        return;
      }
      lastKey = outcome.selected;
      deps.sink.setScopes(scopes, outcome.selected);
      await loadEvidence(token, outcome.selected, outcome.sameScope);
    },
    /** User picked a different authorized scope; filters reset (P47 rule). */
    async select(key: string) {
      if (disposed || !scopes.some((s) => crewScopeKey(s) === key)) return;
      const token = ++generation;
      lastKey = key;
      deps.sink.setScopes(scopes, key);
      await loadEvidence(token, key, false);
    },
    /** Tab went to the background: drop private data and invalidate in-flight loads. */
    suspend() {
      if (disposed) return;
      generation++;
      scopes = [];
      hidePrivate("hidden", CREW_STATUS.hidden);
    },
    dispose() {
      disposed = true;
      generation++;
    },
  };
}
