import type { GroundMissionEvent, ResearchExportRow } from "./contracts";

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function researchSafePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const input = payload as Record<string, unknown>;
  const blocked = new Set(["displayName", "name", "email", "externalRef", "actorId", "crewMemberId", "userId"]);
  return Object.fromEntries(Object.entries(input).filter(([key]) => !blocked.has(key)));
}

export async function deidentifyMissionEvents(
  events: readonly GroundMissionEvent[],
  missionScopedSalt: string,
): Promise<ResearchExportRow[]> {
  if (missionScopedSalt.length < 16) throw new Error("Research export requires a mission-scoped pseudonymization salt");
  return Promise.all(events.map(async (event) => ({
    participantId: `p_${(await sha256Hex(`${missionScopedSalt}:${event.mission.missionId}:${event.mission.crewMemberId}`)).slice(0, 20)}`,
    missionId: event.mission.missionId,
    kind: event.kind,
    occurredAt: event.occurredAt,
    classification: "deidentified" as const,
    payload: researchSafePayload(event.payload),
    sourceCategory: event.sourceId.split(":")[0] || "unknown",
  })));
}
