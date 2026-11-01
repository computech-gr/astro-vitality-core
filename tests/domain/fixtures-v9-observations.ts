import { UNIFIED_OBSERVATION_SCHEMA, type UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";

export const V9_SCOPE = { missionId: "mission-a", crewMemberId: "crew-a", provenance: "synthetic" as const };
export const GM_USER = "00000000-0000-4000-8000-0000000000a2";

let n = 0;
export function obs(over: Partial<UnifiedObservation> = {}): UnifiedObservation {
  n++;
  return {
    schema: UNIFIED_OBSERVATION_SCHEMA,
    id: `obs-${String(n).padStart(6, "0")}`,
    missionId: V9_SCOPE.missionId,
    crewMemberId: V9_SCOPE.crewMemberId,
    metricId: "cv-001",
    domain: "cardiovascular",
    value: String(60 + n),
    originalUnit: "bpm",
    observedAt: new Date(Date.UTC(2026, 9, 1, 7, 30) + n * 86_400_000).toISOString(),
    source: { kind: "csv", label: "CSV: synthetic-kit.csv", documentName: "synthetic-kit.csv", documentSha256: "a".repeat(64), excerpt: "HR,62,bpm" },
    provenance: "synthetic",
    quality: { reviewerConfirmed: true },
    reviewState: "accepted",
    status: "active",
    recordedAt: "2026-10-30T10:00:00.000Z",
    ...over,
  };
}

export const gmCtx = (over: Partial<{ actorUserId: string | null; rolesForScope: string[]; scope: typeof V9_SCOPE | { missionId: string; crewMemberId: string; provenance: "synthetic" | "real" }; decidedAt: string }> = {}) => ({
  actorUserId: GM_USER,
  rolesForScope: ["ground_medical"],
  scope: { ...V9_SCOPE },
  decidedAt: "2026-11-01T10:00:00.000Z",
  ...over,
});
