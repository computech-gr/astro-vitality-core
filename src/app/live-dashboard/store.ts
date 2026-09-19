import type { ObservationEnvelope } from "../../domain";
import type {
  DashboardConnectionState,
  DashboardMetricView,
  DashboardSelfCheck,
  DashboardSourceState,
  DashboardTimelineEvent,
  LiveDashboardState,
} from "./contracts";

const MAX_HISTORY = 60;
const MAX_TIMELINE = 80;

/**
 * Technical freshness only. These windows describe UI/data recency, not health
 * thresholds and not physiological interpretation.
 */
export const DASHBOARD_FRESHNESS_MS: Readonly<Record<string, number>> = {
  "phys.heart_rate": 90_000,
  "phys.respiratory_rate": 90_000,
  "phys.spo2": 90_000,
  "environment.co2": 180_000,
  "environment.oxygen_fraction": 180_000,
  "environment.cabin_pressure": 180_000,
  "environment.temperature": 180_000,
  "environment.relative_humidity": 180_000,
  "radiation.dose_rate": 180_000,
};

export function createLiveDashboardState(): LiveDashboardState {
  return { observations: {}, sources: {}, timeline: [], selfChecks: [] };
}

function pushTimeline(
  state: LiveDashboardState,
  event: DashboardTimelineEvent,
): DashboardTimelineEvent[] {
  return [event, ...state.timeline].slice(0, MAX_TIMELINE);
}

export function setDashboardSourceState(
  state: LiveDashboardState,
  source: Omit<DashboardSourceState, "connection"> & { connection: DashboardConnectionState },
  occurredAt: string,
): LiveDashboardState {
  const previous = state.sources[source.sourceId];
  const changed = previous?.connection !== source.connection || previous?.message !== source.message;
  return {
    ...state,
    sources: { ...state.sources, [source.sourceId]: { ...previous, ...source } },
    timeline: changed
      ? pushTimeline(state, {
          id: `source:${source.sourceId}:${occurredAt}:${source.connection}`,
          occurredAt,
          kind: "connection",
          label: `${source.displayName}: ${source.connection}`,
          ...(source.message ? { detail: source.message } : {}),
        })
      : state.timeline,
  };
}

export function ingestDashboardObservation(
  state: LiveDashboardState,
  envelope: ObservationEnvelope,
  receivedAt: string,
): LiveDashboardState {
  const metricCode = envelope.observation.metric.code;
  const existing = state.observations[metricCode];
  const history = [...(existing?.history ?? []), envelope].slice(-MAX_HISTORY);
  const sourceId = envelope.observation.source.sourceId;
  const source = state.sources[sourceId];
  return {
    ...state,
    observations: {
      ...state.observations,
      [metricCode]: { metricCode, latest: envelope, history, receivedAt },
    },
    sources: source
      ? { ...state.sources, [sourceId]: { ...source, lastSampleAt: envelope.observation.observedAt } }
      : state.sources,
    timeline: pushTimeline(state, {
      id: `measurement:${envelope.observation.id}:${receivedAt}`,
      occurredAt: envelope.observation.observedAt,
      kind: "measurement",
      label: envelope.observation.metric.displayName,
      detail: `Quality: ${envelope.observation.quality.level}`,
    }),
  };
}

export function recordDashboardSelfCheck(
  state: LiveDashboardState,
  selfCheck: DashboardSelfCheck,
): LiveDashboardState {
  return {
    ...state,
    selfChecks: [selfCheck, ...state.selfChecks].slice(0, 20),
    timeline: pushTimeline(state, {
      id: `self-check:${selfCheck.id}`,
      occurredAt: selfCheck.recordedAt,
      kind: "self_check",
      label: "Simple self-check recorded",
      detail: selfCheck.state.replaceAll("_", " "),
    }),
  };
}

function scalarValue(envelope?: ObservationEnvelope): number | string | boolean | undefined {
  if (!envelope) return undefined;
  const value = envelope.observation.value;
  return value.number ?? value.category ?? value.text ?? value.boolean;
}

export function deriveDashboardMetricView(
  state: LiveDashboardState,
  metricCode: string,
  label: string,
  now: string,
): DashboardMetricView {
  const series = state.observations[metricCode];
  const latest = series?.latest;
  const source = latest ? state.sources[latest.observation.source.sourceId] : undefined;
  const freshnessMs = DASHBOARD_FRESHNESS_MS[metricCode] ?? 180_000;
  const ageMs = latest ? new Date(now).getTime() - new Date(latest.observation.observedAt).getTime() : undefined;
  let dataState: DashboardMetricView["state"] = "disconnected";
  if (latest && source?.connection === "connected") {
    dataState = ageMs !== undefined && ageMs > freshnessMs ? "stale" : "live";
  } else if (latest) {
    dataState = "stale";
  } else if (Object.values(state.sources).some((candidate) => candidate.connection === "connected")) {
    dataState = "waiting";
  }

  const history = (series?.history ?? [])
    .map((item) => item.observation.value.number)
    .filter((value): value is number => typeof value === "number");

  const value = scalarValue(latest);

  return {
    metricCode,
    label,
    ...(latest?.observation.metric.unit ? { unit: latest.observation.metric.unit } : {}),
    ...(value !== undefined ? { value } : {}),
    state: dataState,
    ...(latest ? { quality: latest.observation.quality, observedAt: latest.observation.observedAt, sourceId: latest.observation.source.sourceId } : {}),
    history,
  };
}
