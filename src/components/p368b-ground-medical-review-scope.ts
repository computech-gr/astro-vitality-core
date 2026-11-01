// Framework-free review scope for the Ground Medical synthetic review panel.
// One authorized mission ID is the only input for every list/detail/decision request, so
// automatic (single-mission) and manual selection share exactly the same loading path.
// Responses are accepted only when their request epoch and mission are still current.
import type { MissionIdentitySnapshot, MissionMembershipContext } from "@/infrastructure/mission-identity";
import type {
  GroundMedicalPendingBatch, GroundMedicalReviewItem, ResearchDecision, ResearchDecisionReceipt,
} from "@/infrastructure/p368b-ground-medical-review";

// Neutral status texts carry no batch counts or values, so nothing private survives a reset.
export const SELECT_MISSION_STATUS = "Select your Ground Medical mission to load pending synthetic submissions.";
export const SIGNED_OUT_STATUS = "Sign in with an active Ground Medical mission membership to review synthetic submissions.";
export const LOADING_STATUS = "Loading pending synthetic submissions…";
export const EMPTY_STATUS = "No pending synthetic submissions for this mission.";
export const LOAD_FAILED_STATUS = "Pending synthetic submissions could not be loaded.";

export type LoadState = "idle" | "loading" | "loaded" | "error";

export interface ReviewScopeSnapshot {
  missions: MissionMembershipContext[];
  missionId: string;
  queue: GroundMedicalPendingBatch[];
  queueLoad: LoadState;
  status: string;
  error: string;
  revalidating: boolean;
  selectedBatch: string;
  details: GroundMedicalReviewItem[];
  detailLoad: LoadState;
  deciding: boolean;
  receipt: ResearchDecisionReceipt | null;
}

export interface ReviewScopeDeps {
  loadIdentity: () => Promise<MissionIdentitySnapshot>;
  subscribeIdentity: (listener: () => void) => () => void;
  listPending: (missionId: string) => Promise<GroundMedicalPendingBatch[]>;
  getBatch: (missionId: string, batchId: string) => Promise<GroundMedicalReviewItem[]>;
  decide: (input: {
    missionId: string; batchId: string; decision: ResearchDecision; note: string;
    idempotencyKey: string; expectedItemCount: number;
  }) => Promise<ResearchDecisionReceipt>;
}

/** Only active Ground Medical memberships of a signed-in, error-free identity are reviewable. */
export function groundMedicalMemberships(identity: MissionIdentitySnapshot): MissionMembershipContext[] {
  return identity.signedIn && !identity.error ? identity.memberships.filter(m => m.role === "ground_medical") : [];
}

/** Keeps a still-authorized selection; otherwise auto-selects only when exactly one mission is allowed. */
export function resolveMissionSelection(allowed: MissionMembershipContext[], previous: string): string {
  if (previous && allowed.some(m => m.missionId === previous)) return previous;
  return allowed.length === 1 ? (allowed[0]?.missionId ?? "") : "";
}

const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

const INITIAL: ReviewScopeSnapshot = {
  missions: [], missionId: "", queue: [], queueLoad: "idle", status: SELECT_MISSION_STATUS, error: "",
  revalidating: false, selectedBatch: "", details: [], detailLoad: "idle", deciding: false, receipt: null,
};

export function createGroundMedicalReviewScope(deps: ReviewScopeDeps) {
  let state: ReviewScopeSnapshot = INITIAL;
  const listeners = new Set<() => void>();
  let running = false;
  let unsubscribeIdentity: (() => void) | undefined;
  let identityRequest = 0;
  let dataEpoch = 0;
  // The mission whose authorization was verified for the current identity ("" = none).
  let authorizedMission = "";
  let verifiedUser: string | undefined;

  const set = (patch: Partial<ReviewScopeSnapshot>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };
  const isCurrent = (epoch: number, mission: string) =>
    running && epoch === dataEpoch && authorizedMission === mission && state.missionId === mission;
  const privateReset = (): Partial<ReviewScopeSnapshot> => ({
    queue: [], queueLoad: "idle", error: "", selectedBatch: "", details: [], detailLoad: "idle", deciding: false, receipt: null,
  });

  async function refresh(successMessage?: string): Promise<void> {
    const mission = authorizedMission;
    if (!running || !mission || state.missionId !== mission || !state.missions.some(m => m.missionId === mission)) return;
    const epoch = ++dataEpoch;
    set({ queue: [], queueLoad: "loading", error: "", selectedBatch: "", details: [], detailLoad: "idle", status: LOADING_STATUS });
    try {
      const rows = await deps.listPending(mission);
      if (!isCurrent(epoch, mission)) return;
      set({
        queue: rows, queueLoad: "loaded",
        status: successMessage ?? (rows.length ? `${rows.length} pending synthetic batch(es).` : EMPTY_STATUS),
      });
    } catch (error) {
      if (!isCurrent(epoch, mission)) return;
      set({ queue: [], queueLoad: "error", error: message(error, "Review queue unavailable."), status: LOAD_FAILED_STATUS });
    }
  }

  function applyMission(missionId: string, missions: MissionMembershipContext[]) {
    dataEpoch++;
    authorizedMission = missionId;
    set({
      ...privateReset(), missions, missionId, revalidating: false,
      status: missionId ? LOADING_STATUS : (missions.length ? SELECT_MISSION_STATUS : SIGNED_OUT_STATUS),
    });
    if (missionId) void refresh();
  }

  async function revalidate() {
    const request = ++identityRequest;
    try {
      const identity = await deps.loadIdentity();
      if (!running || request !== identityRequest) return;
      const allowed = groundMedicalMemberships(identity);
      const previous = state.missionId;
      const next = resolveMissionSelection(allowed, previous);
      const sameUser = Boolean(identity.userId && verifiedUser === identity.userId);
      verifiedUser = identity.userId;
      if (sameUser && next && next === previous) {
        // Tab-return retention: same user, same still-authorized mission keeps already-loaded rows.
        authorizedMission = next;
        const interruptedList = state.queueLoad === "loading";
        const interruptedDetail = state.detailLoad === "loading";
        set({
          missions: allowed, revalidating: false,
          ...(interruptedDetail ? { selectedBatch: "", details: [], detailLoad: "idle" as const } : {}),
        });
        if (interruptedList) void refresh();
        return;
      }
      applyMission(next, allowed);
    } catch {
      if (!running || request !== identityRequest) return;
      verifiedUser = undefined;
      dataEpoch++;
      authorizedMission = "";
      set({ ...privateReset(), missions: [], missionId: "", revalidating: false, status: SIGNED_OUT_STATUS });
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      running = true;
      void revalidate();
      unsubscribeIdentity = deps.subscribeIdentity(() => {
        // Fail closed immediately on auth changes; old responses must never repopulate private UI.
        dataEpoch++;
        authorizedMission = "";
        set({ revalidating: true, deciding: false });
        void revalidate();
      });
      return () => {
        running = false; identityRequest++; dataEpoch++; authorizedMission = "";
        unsubscribeIdentity?.(); unsubscribeIdentity = undefined;
      };
    },
    /** Manual selection; uses the same path as automatic single-mission selection. */
    selectMission(missionId: string) {
      if (!running || state.revalidating) return;
      const allowed = missionId && state.missions.some(m => m.missionId === missionId) ? missionId : "";
      applyMission(allowed, state.missions);
    },
    refresh,
    async viewBatch(batchId: string): Promise<GroundMedicalReviewItem[] | null> {
      const mission = authorizedMission;
      if (!running || !mission || !state.queue.some(row => row.batch_id === batchId)) return null;
      const epoch = ++dataEpoch;
      set({ selectedBatch: batchId, details: [], detailLoad: "loading", receipt: null, error: "" });
      try {
        const rows = await deps.getBatch(mission, batchId);
        if (!isCurrent(epoch, mission)) return null;
        set({
          details: rows, detailLoad: "loaded",
          status: rows.length ? `${rows.length} synthetic biomarker value(s) loaded.` : "Batch is no longer available for independent review.",
        });
        return rows;
      } catch (error) {
        if (!isCurrent(epoch, mission)) return null;
        set({ selectedBatch: "", details: [], detailLoad: "error", error: message(error, "Batch detail unavailable."), status: "Batch detail could not be loaded." });
        return null;
      }
    },
    /** Records a research-only decision for the selected batch, then reloads the current mission's queue. */
    async decide(input: { decision: ResearchDecision; note: string; idempotencyKey: string }): Promise<ResearchDecisionReceipt | null> {
      const mission = authorizedMission;
      const { selectedBatch, details } = state;
      if (!running || !mission || !selectedBatch || !details.length || !input.idempotencyKey) return null;
      if (!details.every(d => d.review_status === "pending_review")) return null;
      set({ deciding: true });
      try {
        const receipt = await deps.decide({
          missionId: mission, batchId: selectedBatch, decision: input.decision, note: input.note,
          idempotencyKey: input.idempotencyKey, expectedItemCount: details.length,
        });
        if (authorizedMission !== mission || state.missionId !== mission) return null;
        set({ receipt, deciding: false });
        const label = input.decision === "accepted_for_research" ? "Accept for research" : "Reject for research";
        await refresh(`Decision recorded: ${label}${receipt.replay ? " (previously recorded)" : ""}.`);
        return receipt;
      } finally {
        if (state.deciding) set({ deciding: false });
      }
    },
  };
}

export type GroundMedicalReviewScope = ReturnType<typeof createGroundMedicalReviewScope>;
