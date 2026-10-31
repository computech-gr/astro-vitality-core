import type { OfflineEventRecord, OfflineSyncQueueItem } from "@/domain/offline-mission";
import { synchronizeGroundQueueIfAuthenticated } from "@/infrastructure/ground-research";
import { getOfflineMissionStore } from "@/infrastructure/offline";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseBrowserConfigStatus, supabaseConfigurationMessage } from "@/integrations/supabase/config";

export type RecordedDataLocation = "local" | "cloud";

export interface RecordedMissionRow {
  id: string;
  missionId: string;
  crewMemberId: string;
  kind: string;
  eventTimestamp: string;
  sourceId: string;
  sourceVersion: string;
  classification: string;
  metricCode?: string;
  metricLabel?: string;
  value?: string;
  unit?: string;
  quality?: string;
  location: RecordedDataLocation;
  /** P49: original stored payload, read-only, for canonical projection. Never rewritten. */
  payload?: unknown;
  syncState?: OfflineSyncQueueItem["state"];
}

export interface CloudMissionContext {
  signedIn: boolean;
  userId?: string;
  memberships: Array<{ missionId: string; crewMemberId?: string; role: string }>;
  configuration: "configured" | "missing";
  error?: string;
}

export interface RecordedMissionDataset {
  local: RecordedMissionRow[];
  cloud: RecordedMissionRow[];
  cloudContext: CloudMissionContext;
  queue: OfflineSyncQueueItem[];
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizePayload(payload: unknown): Pick<RecordedMissionRow, "metricCode" | "metricLabel" | "value" | "unit" | "quality"> {
  const envelope = asObject(payload);
  if (!envelope) return {};

  // Live scalar observations are persisted as ObservationEnvelope objects, while
  // raw/vector series are persisted directly as RawSignalChunk objects. Project
  // both shapes without rewriting the append-only encrypted record itself.
  const root = asObject(envelope["observation"]) ?? envelope;
  const metric = asObject(root["metric"]);
  const observationValue = asObject(root["value"]);
  const quality = asObject(root["quality"]);
  const metricCode = asText(metric?.["code"]) ?? asText(root["metricCode"]);
  const metricLabel = asText(metric?.["displayName"]);
  const unit = asText(metric?.["unit"]) ?? asText(root["unit"]);
  const qualityLevel = asText(quality?.["level"]);
  const numeric = asNumber(observationValue?.["number"]);
  const bool = typeof observationValue?.["boolean"] === "boolean" ? observationValue["boolean"] : undefined;
  const text = asText(observationValue?.["text"]) ?? asText(observationValue?.["category"]);

  if (numeric !== undefined || bool !== undefined || text !== undefined) {
    return {
      ...(metricCode ? { metricCode } : {}),
      ...(metricLabel ? { metricLabel } : {}),
      value: numeric !== undefined ? String(numeric) : bool !== undefined ? String(bool) : text!,
      ...(unit ? { unit } : {}),
      ...(qualityLevel ? { quality: qualityLevel } : {}),
    };
  }

  const samples = Array.isArray(root["samples"]) ? root["samples"] : undefined;
  if (samples?.length) {
    const last = samples[samples.length - 1];
    const printable = Array.isArray(last)
      ? last.map((item) => (typeof item === "number" ? Number(item.toFixed(3)) : item)).join(", ")
      : typeof last === "number"
        ? String(Number(last.toFixed(3)))
        : undefined;
    return {
      ...(metricCode ? { metricCode } : {}),
      ...(metricLabel ? { metricLabel } : {}),
      ...(printable ? { value: printable } : {}),
      ...(unit ? { unit } : {}),
      ...(qualityLevel ? { quality: qualityLevel } : {}),
    };
  }

  const state = asText(root["state"]);
  return {
    ...(metricCode ? { metricCode } : {}),
    ...(metricLabel ? { metricLabel } : {}),
    ...(state ? { value: state } : {}),
    ...(qualityLevel ? { quality: qualityLevel } : {}),
  };
}

export function localRecordedRow(record: OfflineEventRecord, syncState?: OfflineSyncQueueItem["state"]): RecordedMissionRow {
  return {
    id: record.id,
    missionId: record.mission.missionId,
    crewMemberId: record.mission.crewMemberId,
    kind: record.kind,
    eventTimestamp: record.eventTimestamp,
    sourceId: record.sourceId,
    sourceVersion: record.sourceVersion,
    classification: record.classification,
    location: "local",
    ...(syncState ? { syncState } : {}),
    payload: record.payload,
    ...summarizePayload(record.payload),
  };
}

interface CloudEventShape {
  id: string;
  mission_id: string;
  crew_member_id: string;
  kind: string;
  event_timestamp: string;
  source_id: string;
  source_version: string;
  classification: string;
  payload: unknown;
}

function cloudRow(record: CloudEventShape): RecordedMissionRow {
  return {
    id: record.id,
    missionId: record.mission_id,
    crewMemberId: record.crew_member_id,
    kind: record.kind,
    eventTimestamp: record.event_timestamp,
    sourceId: record.source_id,
    sourceVersion: record.source_version,
    classification: record.classification,
    location: "cloud",
    payload: record.payload,
    ...summarizePayload(record.payload),
  };
}

export async function getCloudMissionContext(): Promise<CloudMissionContext> {
  if (typeof window === "undefined") return { signedIn: false, memberships: [], configuration: "configured" };
  const config = getSupabaseBrowserConfigStatus();
  if (!config.configured) {
    return {
      signedIn: false,
      memberships: [],
      configuration: "missing",
      error: supabaseConfigurationMessage(),
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return {
      signedIn: false,
      memberships: [],
      configuration: "configured",
      error: sessionError.message,
    };
  }
  const session = sessionData.session;
  if (!session) return { signedIn: false, memberships: [], configuration: "configured" };

  const { data, error } = await supabase
    .from("mission_memberships")
    .select("mission_id, crew_member_id, role, active")
    .eq("user_id", session.user.id)
    .eq("active", true);
  if (error) return { signedIn: true, userId: session.user.id, memberships: [], configuration: "configured", error: error.message };

  return {
    signedIn: true,
    userId: session.user.id,
    configuration: "configured",
    memberships: (data ?? []).map((membership) => ({
      missionId: membership.mission_id,
      ...(membership.crew_member_id ? { crewMemberId: membership.crew_member_id } : {}),
      role: membership.role,
    })),
  };
}

export async function loadRecordedMissionData(limit = 300): Promise<RecordedMissionDataset> {
  const store = getOfflineMissionStore();
  await store.initialize();
  const [records, queue, cloudContext] = await Promise.all([
    store.list(limit),
    store.listQueueItems(),
    getCloudMissionContext(),
  ]);
  const queueByRecordId = new Map(queue.map((item) => [item.recordId, item.state] as const));
  const local = records.map((record) => localRecordedRow(record, queueByRecordId.get(record.id)));

  if (!cloudContext.signedIn || !cloudContext.memberships.length) {
    return { local, cloud: [], cloudContext, queue };
  }

  const missionIds = [...new Set(cloudContext.memberships.map((membership) => membership.missionId))];
  const { data, error } = await supabase
    .from("mission_events")
    .select("id, mission_id, crew_member_id, kind, event_timestamp, source_id, source_version, classification, payload")
    .in("mission_id", missionIds)
    .order("event_timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    return { local, cloud: [], cloudContext: { ...cloudContext, error: error.message }, queue };
  }

  return {
    local,
    cloud: ((data ?? []) as CloudEventShape[]).map(cloudRow),
    cloudContext,
    queue,
  };
}

export async function syncRecordedMissionQueue(): Promise<"synced" | "anonymous" | "unavailable" | "configuration_required"> {
  return synchronizeGroundQueueIfAuthenticated();
}
