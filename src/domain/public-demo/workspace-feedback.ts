/**
 * P71 workspace-level feedback for the live demo (pure, browser-safe).
 *
 * Workspace notices live above the record cards so a message about a refused
 * or completed action survives the card refreshing or unmounting. Reset and
 * Restore report success only after the server accepted the change AND the
 * refreshed workspace was loaded; nothing here retries a refused action.
 */
import type { DemoTransitionAction } from "./workflow";

export type DemoNoticeTone = "info" | "success" | "warning" | "error";
export type DemoNotice = { tone: DemoNoticeTone; text: string };
export type DemoActionOutcome = { ok: true } | { ok: false; code?: string; message: string };
export type WorkspaceActionKind = "reset" | "restore";

/** Server codes meaning the record moved on since this view loaded it. */
export function isRecordConflict(code: string | undefined): boolean {
  return code === "stale" || code === "invalid_state";
}

const STEP = {
  scientific_assessment_recorded: "scientific assessment",
  medical_review_recorded: "medical review",
} as const satisfies Record<DemoTransitionAction, string>;

/** Persistent explanation shown when a review was refused because the record changed. */
export function recordConflictNotice(action: DemoTransitionAction, recordRef: string, latestLoaded: boolean): DemoNotice {
  const step = STEP[action];
  return {
    tone: "warning",
    text: latestLoaded
      ? `${recordRef} changed before your ${step} could be saved, for example because someone else already recorded it. Your ${step} was not saved. The latest state has been loaded — check it before acting again.`
      : `${recordRef} changed before your ${step} could be saved. Your ${step} was not saved, and the latest state could not be loaded. Use Refresh before acting again.`,
  };
}

export function pendingWorkspaceText(kind: WorkspaceActionKind, epoch?: number): string {
  return kind === "reset" ? "Resetting the workspace and loading the new version…" : `Restoring version ${epoch} and loading it…`;
}

/**
 * Runs Reset/Restore, then reloads the workspace. Success is reported only when
 * both steps succeed; a reload failure after an accepted change is reported as
 * unconfirmed rather than as success or failure.
 */
export async function runWorkspaceAction(args: {
  kind: WorkspaceActionKind;
  epoch?: number;
  perform: () => Promise<DemoActionOutcome>;
  reload: () => Promise<boolean>;
}): Promise<DemoNotice> {
  const safeReload = () => args.reload().catch(() => false);
  let outcome: DemoActionOutcome;
  try {
    outcome = await args.perform();
  } catch {
    outcome = { ok: false, message: "The demo service could not be reached." };
  }
  if (!outcome.ok) {
    await safeReload();
    return { tone: "error", text: `${args.kind === "reset" ? "Reset" : `Restore of version ${args.epoch}`} was not applied. ${outcome.message}` };
  }
  const loaded = await safeReload();
  if (args.kind === "reset")
    return loaded
      ? { tone: "success", text: "Workspace reset to the deterministic seed. Earlier versions stay restorable." }
      : { tone: "warning", text: "The reset may have succeeded, but the updated workspace could not be loaded to confirm it. Use Refresh before continuing." };
  return loaded
    ? { tone: "success", text: `Workspace version ${args.epoch} restored.` }
    : { tone: "warning", text: `The restore of version ${args.epoch} may have succeeded, but the updated workspace could not be loaded to confirm it. Use Refresh before continuing.` };
}

/** Ignores a second start while one run is in flight (duplicate Reset/Restore clicks). */
export function createSingleFlight() {
  let active = false;
  return {
    get active() {
      return active;
    },
    async run<T>(fn: () => Promise<T>): Promise<{ started: true; value: T } | { started: false }> {
      if (active) return { started: false };
      active = true;
      try {
        return { started: true, value: await fn() };
      } finally {
        active = false;
      }
    },
  };
}
