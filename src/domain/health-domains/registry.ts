/** P26: navigation and evidence mapping, not a medical decision system. */
export type HealthDomainId = "bone" | "immune" | "cardiovascular" | "behavioral";
export interface HealthDomainDefinition {
  id: HealthDomainId;
  title: string;
  path: string;
  reviewState: "handbook_mapping_available" | "scientific_review_pending";
  scope: string;
  metricCodes: readonly string[];
  patternIds: readonly string[];
  limitations: readonly string[];
}
export const HEALTH_DOMAINS: readonly HealthDomainDefinition[] = [
  { id: "bone", title: "Bone Health", path: "/mission/bone-health", reviewState: "handbook_mapping_available", scope: "Bone turnover, unloading, strength and renal-stone context over long timeframes.", metricCodes: ["lab.ctx", "lab.p1np", "activity.exercise_load", "function.strength", "renal.urine_volume", "hydration.urine_specific_gravity"], patternIds: ["bone-unloading-renal-stone-v1"], limitations: ["Bone measurements require provenance, assay and collection context.", "Short-term variation is not a fracture or kidney-stone prediction."] },
  { id: "immune", title: "Immune Changes", path: "/mission/immune-health", reviewState: "scientific_review_pending", scope: "Immune and microbiome observations with contextual longitudinal review.", metricCodes: [], patternIds: ["microbiome-immune-research-v1"], limitations: ["Nikolas's immune scientific review is pending; no metric-to-diagnosis mappings are approved.", "Microbiome associations remain research-only and cannot trigger alerts."] },
  { id: "cardiovascular", title: "Cardiovascular Health", path: "/mission/cardiovascular-health", reviewState: "scientific_review_pending", scope: "Heart rate, blood pressure and hydration/posture context; observational only.", metricCodes: ["phys.heart_rate", "phys.hrv_rmssd", "phys.bp_systolic", "phys.bp_diastolic", "hydration.fluid_intake", "hydration.urine_specific_gravity"], patternIds: ["hydration-volume-orthostatic-v1", "workload-recovery-autonomic-v1"], limitations: ["Signals are contextual and not a cardiovascular event detector.", "Camera PPG is not an arrhythmia diagnostic device; posture and measurement method matter."] },
  { id: "behavioral", title: "Behavioral Health", path: "/mission/behavioral-health", reviewState: "scientific_review_pending", scope: "Sleep, fatigue, cognitive task performance and workload context.", metricCodes: ["sleep.duration", "sleep.efficiency", "behavior.fatigue_state", "behavior.sleepiness_kss", "cognition.pvt_median_rt", "cognition.pvt_lapses", "behavior.workload_tlx_mental_demand"], patternIds: ["sleep-fatigue-cognition-v1", "workload-recovery-autonomic-v1"], limitations: ["No psychiatric diagnosis or mental-health classification.", "Changes require individual context, repeated observations and independent review."] },
] as const;
export function getHealthDomain(id: HealthDomainId): HealthDomainDefinition {
  const found = HEALTH_DOMAINS.find((domain) => domain.id === id);
  if (!found) throw new Error("Unknown health domain");
  return found;
}
export function projectDomainEvidence(domain: HealthDomainDefinition, codes: readonly string[]) {
  const available = domain.metricCodes.filter((code) => codes.includes(code));
  return { available, missing: domain.metricCodes.filter((code) => !codes.includes(code)) };
}
