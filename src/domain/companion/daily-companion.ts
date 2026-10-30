/**
 * P45 Daily Health Companion — pure, browser-safe presentation rules.
 * No medical thresholds, schedules or diagnoses: environments are illustrative
 * context, routine cadences defer to approved mission protocols, and colors
 * describe DATA QUALITY only.
 */
import type { ScientificObservation } from "@/domain/health-intelligence/live-evidence";

export type CompanionEnvironment = "spacecraft" | "station" | "rover" | "lunar" | "planetary";

export const COMPANION_ENVIRONMENTS: Record<CompanionEnvironment, { name: string; note: string }> = {
  spacecraft: {
    name: "Spacecraft",
    note: "Confined cabin; follow the vehicle's approved medical and operational procedures.",
  },
  station: {
    name: "Space station",
    note: "Long-duration microgravity operations; use the mission's approved monitoring schedule.",
  },
  rover: {
    name: "Rover",
    note: "Mobile operations; account for connectivity, workload and the approved EVA/vehicle plan.",
  },
  lunar: {
    name: "Lunar base",
    note: "Surface operations; consider dust, habitat constraints and the approved mission plan.",
  },
  planetary: {
    name: "Planetary base",
    note: "Remote habitat; consider communications delay and mission-approved protocols.",
  },
};

export type CompanionRoutineItem = {
  id: string;
  label: string;
  cadence: string;
  detail: string;
  href: "/mission/readiness" | "/mission/intake" | "/mission/devices" | "/mission/guidance";
};

export const COMPANION_ROUTINE: readonly CompanionRoutineItem[] = [
  {
    id: "readiness",
    label: "Daily readiness check-in",
    cadence: "Daily · suggested",
    detail: "Record subjective readiness and relevant context. This is not a medical clearance.",
    href: "/mission/readiness",
  },
  {
    id: "measurements",
    label: "Review scheduled measurements",
    cadence: "Per approved mission protocol",
    detail: "Check which measurements are due; do not invent thresholds or measurement frequency.",
    href: "/mission/intake",
  },
  {
    id: "devices",
    label: "Check device and data quality",
    cadence: "Before data collection",
    detail: "Confirm device status, provenance, timestamp and quality before interpretation.",
    href: "/mission/devices",
  },
  {
    id: "guidance",
    label: "Read approved guidance",
    cadence: "When needed",
    detail:
      "Review existing action guidance and contact the designated medical authority for concerns.",
    href: "/mission/guidance",
  },
];

export function qualityPresentation(quality: string): {
  label: string;
  tone: "good" | "degraded" | "neutral";
} {
  if (quality === "good") return { label: "Good data quality", tone: "good" };
  if (quality === "degraded") return { label: "Degraded data quality", tone: "degraded" };
  if (quality === "poor") return { label: "Poor data quality — needs review", tone: "neutral" };
  return { label: "Unknown data quality — needs review", tone: "neutral" };
}

/** Participation counts only known routine items; never a health score. */
export function participation(completed: readonly string[], total: number) {
  const known = new Set(COMPANION_ROUTINE.map((r) => r.id));
  const done = new Set(completed.filter((id) => known.has(id))).size;
  return { done, total, percent: total ? Math.round((100 * done) / total) : 0 };
}

const MAX_POINTS = 30;

/**
 * Chronological, time-proportional chart geometry for the latest 30 samples.
 * Returns null when fewer than two observations exist (no trend from one point).
 * The y-range is the observed min/max only — never a reference range.
 */
export function chartGeometry(items: readonly ScientificObservation[]) {
  const sorted = [...items]
    .filter((o) => Number.isFinite(o.value) && Number.isFinite(Date.parse(o.observedAt)))
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const truncated = sorted.length > MAX_POINTS;
  const pts = sorted.slice(-MAX_POINTS);
  if (pts.length < 2) return null;
  const values = pts.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const t0 = Date.parse(pts[0]!.observedAt);
  const span = Date.parse(pts[pts.length - 1]!.observedAt) - t0;
  const points = pts.map((item, i) => {
    const fraction = span > 0 ? (Date.parse(item.observedAt) - t0) / span : i / (pts.length - 1);
    return {
      item,
      x: Math.round((48 + fraction * 528) * 100) / 100,
      y: Math.round((132 - ((item.value - min) / range) * 108) * 100) / 100,
    };
  });
  return { points, min, max, truncated };
}
