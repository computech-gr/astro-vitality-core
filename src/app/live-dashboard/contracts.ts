import type { DataQuality, ObservationEnvelope, PersonalBaselineComparison, PersonalBaselineProfile } from "../../domain";

export const DASHBOARD_DATA_STATES = ["live", "stale", "disconnected", "waiting"] as const;
export type DashboardDataState = (typeof DASHBOARD_DATA_STATES)[number];

export const DASHBOARD_CONNECTION_STATES = [
  "disconnected",
  "discovering",
  "connecting",
  "connected",
  "degraded",
  "error",
] as const;
export type DashboardConnectionState = (typeof DASHBOARD_CONNECTION_STATES)[number];

export interface DashboardSourceState {
  sourceId: string;
  displayName: string;
  transport: string;
  connection: DashboardConnectionState;
  lastSampleAt?: string;
  message?: string;
}

export interface DashboardObservationSeries {
  metricCode: string;
  latest: ObservationEnvelope;
  history: ObservationEnvelope[];
  receivedAt: string;
}

export interface DashboardTimelineEvent {
  id: string;
  occurredAt: string;
  kind: "connection" | "measurement" | "self_check" | "system";
  label: string;
  detail?: string;
}

export interface DashboardSelfCheck {
  id: string;
  recordedAt: string;
  state: "nominal" | "monitor" | "request_support";
  note?: string;
}

export interface LiveDashboardState {
  observations: Record<string, DashboardObservationSeries>;
  sources: Record<string, DashboardSourceState>;
  timeline: DashboardTimelineEvent[];
  selfChecks: DashboardSelfCheck[];
  baselines: Record<string, PersonalBaselineProfile>;
}

export interface DashboardMetricView {
  metricCode: string;
  label: string;
  unit?: string;
  value?: number | string | boolean;
  state: DashboardDataState;
  quality?: DataQuality;
  observedAt?: string;
  sourceId?: string;
  history: number[];
  baseline?: PersonalBaselineComparison;
  baselineStatus: "available" | "not_established" | "context_mismatch" | "not_applicable";
}
