/**
 * FV-01.4.6 Mission Settings — pure validation for the existing update_mission_operation RPC.
 * The server re-validates everything (name length, lifecycle, closure immutability, operator role).
 */
export type MissionSettingsStatus = "planning" | "active" | "completed" | "aborted";

export interface MissionSettingsSnapshot {
  id: string;
  code: string;
  name: string;
  status: MissionSettingsStatus;
  starts_at?: string | null;
  ends_at?: string | null;
}

/** Draft values. Dates use "YYYY-MM-DDTHH:mm" interpreted as UTC (empty = not set). */
export interface MissionSettingsDraft {
  name: string;
  status: MissionSettingsStatus;
  startsAt: string;
  endsAt: string;
}

export const MISSION_NAME_MIN = 3;
export const MISSION_NAME_MAX = 120;

export function isTerminalStatus(status: MissionSettingsStatus): boolean {
  return status === "completed" || status === "aborted";
}

/** Mirrors the server lifecycle: planning → active|aborted, active → completed|aborted, terminal is final. */
export function allowedStatusTargets(status: MissionSettingsStatus): MissionSettingsStatus[] {
  if (status === "planning") return ["planning", "active", "aborted"];
  if (status === "active") return ["active", "completed", "aborted"];
  return [status];
}

/** ISO timestamp → UTC "YYYY-MM-DDTHH:mm" for a datetime-local input labelled UTC. */
export function isoToUtcInput(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

/** UTC "YYYY-MM-DDTHH:mm" → ISO string, or null when empty/invalid. */
export function utcInputToIso(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function draftFromMission(mission: MissionSettingsSnapshot): MissionSettingsDraft {
  return { name: mission.name, status: mission.status, startsAt: isoToUtcInput(mission.starts_at), endsAt: isoToUtcInput(mission.ends_at) };
}

export function isDraftDirty(mission: MissionSettingsSnapshot, draft: MissionSettingsDraft): boolean {
  const base = draftFromMission(mission);
  return base.name !== draft.name.trim() || base.status !== draft.status || base.startsAt !== draft.startsAt || base.endsAt !== draft.endsAt;
}

export function validateMissionSettings(mission: MissionSettingsSnapshot, draft: MissionSettingsDraft): string[] {
  const errors: string[] = [];
  if (isTerminalStatus(mission.status)) {
    errors.push("This mission is closed. Its settings are read-only.");
    return errors;
  }
  const name = draft.name.trim();
  if (name.length < MISSION_NAME_MIN || name.length > MISSION_NAME_MAX) errors.push(`Mission name must be ${MISSION_NAME_MIN}–${MISSION_NAME_MAX} characters.`);
  if (!allowedStatusTargets(mission.status).includes(draft.status)) errors.push(`Status cannot change from ${mission.status} to ${draft.status}.`);
  const starts = utcInputToIso(draft.startsAt);
  const ends = utcInputToIso(draft.endsAt);
  if (draft.startsAt && !starts) errors.push("Start date is not a valid date and time.");
  if (draft.endsAt && !ends) errors.push("End date is not a valid date and time.");
  if (mission.starts_at && !draft.startsAt) errors.push("A start date that is already set cannot be cleared.");
  if (starts && ends && new Date(ends) <= new Date(starts)) errors.push("End date must be after the start date.");
  return errors;
}

/** Arguments for updateMissionOperation. Always sends the end date so it is never cleared by accident. */
export function buildMissionSettingsUpdate(mission: MissionSettingsSnapshot, draft: MissionSettingsDraft) {
  const update: { missionId: string; name: string; status?: MissionSettingsStatus; startsAt?: string; endsAt?: string } = { missionId: mission.id, name: draft.name.trim() };
  if (draft.status !== mission.status) update.status = draft.status;
  const startsAt = utcInputToIso(draft.startsAt);
  const endsAt = utcInputToIso(draft.endsAt);
  if (startsAt) update.startsAt = startsAt;
  if (endsAt) update.endsAt = endsAt;
  return update;
}
