import type { IntelligencePatternDefinition } from "./contracts";

/**
 * Reviewed relationships from Astronaut Biomarker Matrix v1.1 / 08_BIOLOGIST_REVIEW.
 * These definitions express evidence structure and guardrails, not diagnoses,
 * treatments, flight rules, or universal numeric thresholds.
 */
export const REVIEWED_INTELLIGENCE_PATTERNS_V1_1 = [
  {
    id: "sleep-fatigue-cognition-v1",
    displayName: "Sleep / fatigue / cognitive change",
    summary:
      "Reduced or fragmented sleep with increased sleepiness/fatigue and measurable cognitive slowing warrants review.",
    evidenceLevel: "supported",
    roles: [
      { role: "sleep", anyMetricCodes: ["sleep.duration", "sleep.efficiency", "sleep.waso", "sleep.subjective_quality"], required: true, independentDomain: "sleep_circadian" },
      { role: "fatigue_or_sleepiness", anyMetricCodes: ["behavior.fatigue_state", "behavior.sleepiness_kss"], required: true, independentDomain: "behavioral" },
      { role: "cognition", anyMetricCodes: ["cognition.pvt_median_rt", "cognition.pvt_lapses", "cognition.processing_speed", "cognition.working_memory_accuracy"], required: true, independentDomain: "cognitive" },
      { role: "schedule_or_light_context", anyMetricCodes: ["mission.work_rest_state", "environment.light_exposure", "sleep.light_exposure"], required: false },
      { role: "autonomic_context", anyMetricCodes: ["phys.hrv_rmssd", "phys.heart_rate"], required: false },
    ],
    minimumIndependentDomains: 3,
    sourceIds: ["SRC-01", "SRC-17", "SRC-29", "SRC-33"],
    scientificBaselineVersion: "1.1",
    operationalStatus: "reviewed_non_diagnostic",
    interpretationGuardrails: [
      "Compare repeated measures with time-matched personal baselines and task context.",
      "HRV may corroborate autonomic change but must not be labeled a stress diagnosis.",
      "The pattern is consistent with reduced readiness and warrants review; it is not a diagnosis.",
    ],
  },
  {
    id: "workload-recovery-autonomic-v1",
    displayName: "Workload / recovery / autonomic context",
    summary:
      "Task-linked workload plus sleep/work exposure and recovery signals can identify a coherent workload-recovery pattern.",
    evidenceLevel: "supported",
    roles: [
      { role: "task_workload", anyMetricCodes: ["behavior.workload_tlx_mental_demand", "behavior.workload_tlx_temporal_demand", "behavior.workload_tlx_effort"], required: true, independentDomain: "behavioral" },
      { role: "recovery_context", anyMetricCodes: ["sleep.duration", "sleep.efficiency", "behavior.fatigue_state"], required: true },
      { role: "autonomic_or_heart_rate", anyMetricCodes: ["phys.hrv_rmssd", "phys.heart_rate"], required: true, independentDomain: "physiological" },
      { role: "performance", anyMetricCodes: ["cognition.pvt_median_rt", "cognition.working_memory_accuracy", "performance.mission_task"], required: false, independentDomain: "cognitive" },
    ],
    minimumIndependentDomains: 2,
    sourceIds: ["SRC-16", "SRC-28"],
    scientificBaselineVersion: "1.1",
    operationalStatus: "reviewed_non_diagnostic",
    interpretationGuardrails: [
      "Do not derive a single opaque stress index.",
      "HRV, EDA and cortisol are nonspecific correlates rather than validators of subjective stress.",
      "Preserve each contributing component and its context in the explanation.",
    ],
  },
  {
    id: "hydration-volume-orthostatic-v1",
    displayName: "Hydration / volume / orthostatic context",
    summary:
      "Hydration and cardiovascular status require corroboration across intake, mass, laboratory/urine and posture-aware signals.",
    evidenceLevel: "supported",
    roles: [
      { role: "hydration_exposure", anyMetricCodes: ["hydration.fluid_intake", "body.mass"], required: true, independentDomain: "nutrition_hydration" },
      { role: "urine_or_osmotic_context", anyMetricCodes: ["hydration.urine_specific_gravity", "renal.urine_volume", "lab.sodium"], required: true },
      { role: "cardiovascular_context", anyMetricCodes: ["phys.heart_rate", "phys.bp_systolic", "phys.bp_diastolic", "symptom.self_report"], required: true, independentDomain: "physiological" },
      { role: "gravity_or_posture_context", anyMetricCodes: ["mission.gravity_regime", "mission.phase"], required: false },
    ],
    minimumIndependentDomains: 2,
    sourceIds: ["SRC-21", "SRC-30"],
    scientificBaselineVersion: "1.1",
    operationalStatus: "reviewed_non_diagnostic",
    interpretationGuardrails: [
      "No single hydration marker is sufficient.",
      "Microgravity fluid redistribution and plasma-volume adaptation can confound terrestrial interpretation.",
      "Mission medical rules override personal-baseline analytics.",
    ],
  },
  {
    id: "co2-cognition-context-v1",
    displayName: "Cabin CO2 with symptoms or cognitive change",
    summary:
      "A concurrent CO2 rise and symptom/cognitive change is contextual evidence that may warrant review, not proof of causation.",
    evidenceLevel: "limited",
    roles: [
      { role: "co2", anyMetricCodes: ["environment.co2"], required: true, independentDomain: "environmental" },
      { role: "symptom_or_cognition", anyMetricCodes: ["symptom.self_report", "cognition.pvt_median_rt", "cognition.pvt_lapses", "cognition.working_memory_accuracy"], required: true, independentDomain: "cognitive" },
    ],
    minimumIndependentDomains: 2,
    sourceIds: ["SRC-31"],
    scientificBaselineVersion: "1.1",
    operationalStatus: "contextual_only",
    interpretationGuardrails: [
      "NASA evidence for cognition effects at spacecraft-relevant CO2 levels is conflicting.",
      "Do not state that CO2 caused the cognitive or symptom change.",
      "Describe the association as concurrent/contextual only.",
    ],
  },
  {
    id: "bone-unloading-renal-stone-v1",
    displayName: "Bone unloading / renal-stone context",
    summary:
      "Bone turnover, mechanical loading and urinary stone-risk context can form a long-horizon cross-system pattern.",
    evidenceLevel: "supported",
    roles: [
      { role: "bone_resorption", anyMetricCodes: ["lab.ctx"], required: true, independentDomain: "laboratory" },
      { role: "bone_formation", anyMetricCodes: ["lab.p1np"], required: true },
      { role: "mechanical_loading", anyMetricCodes: ["activity.exercise_load", "function.strength"], required: true, independentDomain: "activity_performance" },
      { role: "stone_risk_context", anyMetricCodes: ["renal.urine_volume", "hydration.urine_specific_gravity", "hydration.fluid_intake"], required: true, independentDomain: "nutrition_hydration" },
    ],
    minimumIndependentDomains: 3,
    sourceIds: ["SRC-19", "SRC-20", "SRC-22"],
    scientificBaselineVersion: "1.1",
    operationalStatus: "reviewed_non_diagnostic",
    interpretationGuardrails: [
      "Evaluate over weeks or months rather than as a real-time alert.",
      "Hydration, diet and urine collection quality modify stone-risk interpretation.",
      "Do not infer fracture or kidney-stone diagnosis from this pattern.",
    ],
  },
  {
    id: "microbiome-immune-research-v1",
    displayName: "Microbiome / immune association",
    summary:
      "Longitudinal microbiome and immune associations remain research-only without a validated strain/function relationship.",
    evidenceLevel: "research_only",
    roles: [],
    minimumIndependentDomains: 0,
    sourceIds: ["SRC-24", "SRC-25"],
    scientificBaselineVersion: "1.1",
    operationalStatus: "research_only",
    interpretationGuardrails: [
      "No generic dysbiosis score or alpha-diversity alarm.",
      "Do not classify bacteria as generically good or bad.",
      "Exclude this pattern from operational alert logic by default.",
    ],
  },
] as const satisfies readonly IntelligencePatternDefinition[];
