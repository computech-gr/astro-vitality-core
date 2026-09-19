import type { KnownLimitation, ValidationCriterion } from "./contracts";

export const P18_VALIDATION_PLAN: readonly ValidationCriterion[] = [
  {
    id: "SCI-001",
    area: "scientific_review",
    title: "Biologist-reviewed scientific baseline",
    method: "automated",
    critical: true,
    acceptance:
      "Scientific implementation baseline is Biomarker Matrix v1.1 and remains non-diagnostic.",
    source: "SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.1.xlsx",
  },
  {
    id: "SCN-001",
    area: "scenario_review",
    title: "Deterministic synthetic mission replay",
    method: "automated",
    critical: true,
    acceptance:
      "Same P17 scenario and seed reproduce the same fingerprint without silent imputation.",
    source: "P17 synthetic mission dataset",
  },
  {
    id: "SCN-002",
    area: "scenario_review",
    title: "Mission Day 127 end-to-end browser review",
    method: "manual_browser",
    critical: true,
    acceptance:
      "Critical story can be followed from live monitoring through explainability, guidance, offline mode and ground sync without broken navigation.",
    source: "Master Roadmap demonstration package",
  },
  {
    id: "A11Y-001",
    area: "accessibility",
    title: "Keyboard-only critical workflow review",
    method: "manual_browser",
    critical: true,
    acceptance:
      "All critical routes, menus, controls and dialogs are reachable and operable by keyboard with visible focus.",
    source: "Master Roadmap testing strategy",
  },
  {
    id: "A11Y-002",
    area: "accessibility",
    title: "Touch and responsive critical workflow review",
    method: "manual_browser",
    critical: true,
    acceptance:
      "Critical routes remain usable on narrow/touch layouts without horizontal overflow or inaccessible controls.",
    source: "Master Roadmap testing strategy",
  },
  {
    id: "COG-001",
    area: "cognitive_load",
    title: "Daily readiness flow time budget",
    method: "automated",
    critical: true,
    acceptance: "The required P11 daily demo assessment remains below three minutes.",
    source: "P11 roadmap exit gate",
  },
  {
    id: "LAT-001",
    area: "latency",
    title: "Local critical-path latency observation",
    method: "manual_browser",
    critical: true,
    acceptance:
      "Browser validation records sample-to-visible-update timing for the local live path; no cloud round-trip is required.",
    source: "Offline-first architecture and P18 latency test requirement",
  },
  {
    id: "BAT-001",
    area: "battery",
    title: "Target-hardware battery impact measurement",
    method: "hardware",
    critical: false,
    acceptance:
      "Measure software/device battery impact on target wearable hardware when hardware is available.",
    source: "P18 battery-test requirement",
  },
  {
    id: "WF-001",
    area: "critical_workflow",
    title: "Offline disconnect/reconnect and sync",
    method: "automated",
    critical: true,
    acceptance:
      "Encrypted local capture survives transport failure and later synchronizes idempotently.",
    source: "P14/P15 critical workflow",
  },
  {
    id: "WF-002",
    area: "critical_workflow",
    title: "Role separation and research de-identification",
    method: "automated",
    critical: true,
    acceptance: "Ground/research authorization and de-identification gates remain enforced.",
    source: "P15/P16 critical workflow",
  },
  {
    id: "WF-003",
    area: "critical_workflow",
    title: "Poor/missing data remains visible",
    method: "automated",
    critical: true,
    acceptance: "Artifact/dropout scenarios never silently fill safety-relevant values.",
    source: "Scientific Architecture data-quality boundary",
  },
] as const;

export const P18_KNOWN_LIMITATIONS: readonly KnownLimitation[] = [
  {
    id: "LIM-001",
    title: "No clinical validation or medical-device certification",
    impact: "high",
    statement:
      "The Mitochondria is not clinically validated: it is a challenge prototype and decision-support platform; P18 does not establish clinical validation, diagnosis, treatment efficacy or medical-device certification.",
    mitigation:
      "Keep all medical conclusions human-governed and seek qualified clinical review before operational medical use.",
    blocksCriticalWorkflow: false,
  },
  {
    id: "LIM-002",
    title: "Target-hardware battery drain is not yet characterized",
    impact: "moderate",
    statement:
      "Battery impact depends on the selected wearable, radio path, sampling cadence and mobile/edge host. The repository cannot truthfully infer this from synthetic data.",
    mitigation:
      "Run an instrumented hardware session before final submission when the target wearable is available and attach measured evidence.",
    blocksCriticalWorkflow: false,
  },
  {
    id: "LIM-003",
    title: "Not every adapter path is backed by physical hardware",
    impact: "moderate",
    statement:
      "The direct Web Bluetooth heart-rate path is implemented; several Health Connect, HealthKit, vendor, environmental and radiation paths still depend on host bridges, credentials or target hardware.",
    mitigation:
      "Use the canonical adapter contracts and P17 synthetic fixtures for reproducible demonstration while preserving clear source labels.",
    blocksCriticalWorkflow: false,
  },
  {
    id: "LIM-004",
    title: "Synthetic scenarios are validation fixtures, not physiological truth",
    impact: "moderate",
    statement:
      "Mission Day 127 and other P17 scenarios test software behavior and narrative reproducibility; they do not establish expected astronaut physiology or causal relationships.",
    mitigation:
      "Keep all synthetic records explicitly classified and retain the v1.1 scientific guardrails.",
    blocksCriticalWorkflow: false,
  },
  {
    id: "LIM-005",
    title: "Clinical threshold and escalation wording remain separately governed",
    impact: "high",
    statement:
      "The reviewed biological baseline does not authorize autonomous clinical thresholds, diagnosis, treatment or flight-rule decisions.",
    mitigation:
      "Require qualified clinical/flight-medicine governance for any future safety-critical threshold or escalation wording.",
    blocksCriticalWorkflow: false,
  },
] as const;
