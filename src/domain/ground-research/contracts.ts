import type { DataClassification, MissionContextRef } from "../contracts";

export const GROUND_ROLES = ["crew_self", "ground_medical", "mission_operator", "researcher"] as const;
export type GroundRole = (typeof GROUND_ROLES)[number];

export const GROUND_CAPABILITIES = [
  "crew_overview",
  "identified_health",
  "alert_review",
  "device_health",
  "audit_review",
  "research_export",
] as const;
export type GroundCapability = (typeof GROUND_CAPABILITIES)[number];

export interface GroundPrincipal {
  userId: string;
  missionId: string;
  role: GroundRole;
  crewMemberId?: string;
}

export interface GroundMissionEvent {
  id: string;
  mission: MissionContextRef;
  kind: string;
  occurredAt: string;
  sourceId: string;
  sourceVersion: string;
  classification: DataClassification;
  payload: unknown;
  payloadHash: string;
}

export interface GroundAuditEvent {
  id: string;
  missionId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface GroundCrewSummary {
  crewMemberId: string;
  pseudonym?: string;
  latestEventAt?: string;
  eventCount: number;
  openFindingCount: number;
  pendingActionCount: number;
  deviceIssueCount: number;
}

export interface GroundMissionSnapshot {
  missionId: string;
  generatedAt: string;
  crew: GroundCrewSummary[];
  totalEvents: number;
  openFindings: number;
  pendingActions: number;
  deviceIssues: number;
  lastSyncAt?: string;
}

export interface ResearchExportRow {
  participantId: string;
  missionId: string;
  kind: string;
  occurredAt: string;
  classification: "deidentified";
  payload: unknown;
  sourceCategory: string;
}
