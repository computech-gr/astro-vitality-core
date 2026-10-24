/**
 * Centralized, browser-safe development roadmap registry.
 *
 * Every entry is derived from a document, data record or verifier present in the
 * repository. Statuses describe documentation/implementation evidence only.
 * Passing automated checks never implies independent scientific approval,
 * real-device/flight validation, clinical validation or submission authorization.
 */

export const ROADMAP_GITHUB_DOCS_URL = "https://github.com/computech-gr/astro-vitality-core/blob/main/";

export type RoadmapCategory = "foundation" | "science" | "data-devices" | "mission" | "security-cloud" | "validation" | "submission";

export const ROADMAP_CATEGORIES: readonly { id: RoadmapCategory; label: string }[] = [
  { id: "foundation", label: "Foundation" },
  { id: "science", label: "Science & evidence" },
  { id: "data-devices", label: "Data & devices" },
  { id: "mission", label: "Mission experience" },
  { id: "security-cloud", label: "Security, identity & cloud" },
  { id: "validation", label: "Validation & acceptance" },
  { id: "submission", label: "Competition submission" },
];

/**
 * - implemented: documented and present in the repository.
 * - review_only: research/scientific material that remains unapproved and non-operational.
 * - gate_open: implementation present but a human, device, scientific or external gate remains open.
 * - referenced_only: phase is referenced by other documents but has no dedicated record.
 */
export type RoadmapStatus = "implemented" | "review_only" | "gate_open" | "referenced_only";

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  implemented: "Implemented (documented)",
  review_only: "Review-only — not approved",
  gate_open: "Implemented — acceptance gate open",
  referenced_only: "Referenced only — no dedicated record",
};

export type RoadmapSubphase = { id: string; title: string; doc: string };

export type RoadmapPhase = {
  /** Numbered phase identifier, e.g. "P21". */
  id: string;
  number: number;
  title: string;
  category: RoadmapCategory;
  status: RoadmapStatus;
  summary: string;
  /** Repository-relative primary document. */
  doc: string;
  /** Repository-relative automated verifier script, when one exists. */
  verifier?: string;
  subphases?: readonly RoadmapSubphase[];
};

/** Numbered records that the repository does not contain; shown explicitly rather than invented. */
export const ROADMAP_UNVERIFIED_ENTRIES: readonly { id: string; note: string }[] = [
  { id: "P0", note: "Referenced as the controlled baseline in SUBMISSION_PACKAGE.md and SIMULATION_SYNTHETIC_DATASET.md; no dedicated P0 document exists in the repository." },
  { id: "P21.1–P21.2", note: "No numbered P21.1 or P21.2 records exist; the unnumbered P21 intake, bone handbook, mapping and navigation documents precede P21.3." },
  { id: "P23B", note: "No P23B document or verifier exists; the P23 sequence moves from P23A to P23C." },
  { id: "P41.1", note: "No P41.1 record exists; P41 (review workbook) is followed by P41.2." },
];

const d = (file: string) => `docs/${file}`;

export const ROADMAP_PHASES: readonly RoadmapPhase[] = [
  { id: "P0", number: 0, title: "Controlled challenge baseline", category: "foundation", status: "referenced_only", summary: "Challenge thesis and Mission Day 127 story referenced by later documents; no dedicated record.", doc: d("SUBMISSION_PACKAGE.md") },
  { id: "P1", number: 1, title: "Scientific review dependency", category: "science", status: "implemented", summary: "Team-biologist review dependency closed by the reviewed v1.1 biomarker matrix for the challenge baseline only.", doc: d("SCIENTIFIC_BASELINE_V1_1.md") },
  { id: "P2", number: 2, title: "Repository & PWA foundation", category: "foundation", status: "implemented", summary: "Minimal TypeScript/React/Vite PWA shell, security boundaries and environment discipline; no health features.", doc: d("SECURITY_MODEL.md"), verifier: "scripts/verify-foundation.mjs" },
  { id: "P3", number: 3, title: "Domain contracts & scientific governance", category: "foundation", status: "implemented", summary: "Vendor-neutral identity, mission, crew and observation contracts plus the governance boundary.", doc: d("DOMAIN_MODEL.md"), verifier: "scripts/verify-p3.mjs" },
  { id: "P4", number: 4, title: "Canonical health data", category: "data-devices", status: "implemented", summary: "Reviewed metric registry, unit normalization, ingestion and deterministic serialization.", doc: d("CANONICAL_HEALTH_DATA.md"), verifier: "scripts/verify-p4.mjs" },
  { id: "P5", number: 5, title: "Device adapter SDK", category: "data-devices", status: "implemented", summary: "Vendor-neutral adapter lifecycle with a deterministic conformance fixture.", doc: d("DEVICE_ADAPTER_SDK.md"), verifier: "scripts/verify-p5.mjs" },
  { id: "P6", number: 6, title: "Wearables integration", category: "data-devices", status: "implemented", summary: "Web Bluetooth heart rate, Health Connect/HealthKit bridge and vendor-cloud adapter boundaries.", doc: d("WEARABLES_INTEGRATION.md"), verifier: "scripts/verify-p6.mjs" },
  { id: "P7", number: 7, title: "Medical & laboratory integration", category: "data-devices", status: "implemented", summary: "Governed CSV/FHIR lab import, manual entry and medical-device normalization without clinical thresholds.", doc: d("MEDICAL_LAB_INTEGRATION.md"), verifier: "scripts/verify-p7.mjs" },
  { id: "P8", number: 8, title: "Environmental & radiation telemetry", category: "data-devices", status: "implemented", summary: "Habitat and dosimetry adapters on the canonical model; no radiation-risk scoring.", doc: d("ENVIRONMENTAL_RADIATION_TELEMETRY.md"), verifier: "scripts/verify-p8.mjs" },
  { id: "P9", number: 9, title: "Astronaut live dashboard", category: "mission", status: "implemented", summary: "Session-local live console with explicit quality, freshness and source states.", doc: d("LIVE_DASHBOARD.md"), verifier: "scripts/verify-p9.mjs" },
  { id: "P10", number: 10, title: "Personal baseline engine", category: "science", status: "implemented", summary: "Versioned, phase-aware personal baselines; no invented baselines or thresholds.", doc: d("PERSONAL_BASELINE_ENGINE.md"), verifier: "scripts/verify-p10.mjs" },
  { id: "P11", number: 11, title: "Cognitive & behavioral module", category: "mission", status: "implemented", summary: "Private readiness check-in; the vigilance task is a software demo protocol, not a validated test.", doc: d("COGNITIVE_BEHAVIORAL_MODULE.md"), verifier: "scripts/verify-p11.mjs" },
  { id: "P12", number: 12, title: "Health intelligence v1", category: "science", status: "implemented", summary: "Non-diagnostic, evidence-weighted trends and reviewed multi-signal patterns.", doc: d("HEALTH_INTELLIGENCE_V1.md"), verifier: "scripts/verify-p12.mjs" },
  { id: "P13", number: 13, title: "Action & protocol guidance", category: "mission", status: "implemented", summary: "Versioned, bounded protocol library; research-only findings are blocked from action.", doc: d("ACTION_PROTOCOL_GUIDANCE.md"), verifier: "scripts/verify-p13.mjs" },
  { id: "P14", number: 14, title: "Offline mission mode", category: "mission", status: "implemented", summary: "Encrypted IndexedDB, append-only event log and store-and-forward queue.", doc: d("OFFLINE_MISSION_MODE.md"), verifier: "scripts/verify-p14.mjs" },
  { id: "P15", number: 15, title: "Ground / research console", category: "security-cloud", status: "implemented", summary: "Mission-scoped roles, authenticated persistence, audit events and de-identified research export.", doc: d("GROUND_RESEARCH_CONSOLE.md"), verifier: "scripts/verify-p15.mjs" },
  { id: "P16", number: 16, title: "Security & safety hardening", category: "security-cloud", status: "implemented", summary: "Threat model, misuse cases, security headers and RLS/RPC hardening.", doc: d("security/THREAT_MODEL.md"), verifier: "scripts/verify-p16.mjs" },
  { id: "P17", number: 17, title: "Simulation & synthetic dataset", category: "validation", status: "implemented", summary: "Deterministic synthetic Mission Day 127 scenarios, always tagged synthetic.", doc: d("SIMULATION_SYNTHETIC_DATASET.md"), verifier: "scripts/verify-p17.mjs" },
  { id: "P18", number: 18, title: "Validation & usability", category: "validation", status: "gate_open", summary: "Validation ledger and usability checks; target-hardware battery characterization remains a limitation.", doc: d("VALIDATION_USABILITY.md"), verifier: "scripts/verify-p18.mjs" },
  { id: "P19", number: 19, title: "Open-source release candidate", category: "foundation", status: "gate_open", summary: "Docker/local reproduction path; independent-machine reproduction is tracked as a separate gate.", doc: d("RELEASE_CANDIDATE.md"), verifier: "scripts/verify-p19.mjs" },
  { id: "P20", number: 20, title: "Challenge demo & real-device evidence", category: "submission", status: "gate_open", summary: "Judge narrative, zero-install device demo and evidence ledger; official-rules confirmation remains pending.", doc: d("P20_REAL_DEVICE_EVIDENCE.md"), verifier: "scripts/verify-p20.mjs" },
  {
    id: "P21", number: 21, title: "Scientific knowledge intake (bone health)", category: "science", status: "review_only",
    summary: "Non-operational bone-health handbook intake, evidence appraisal chain and scientific baseline freeze awaiting independent review.",
    doc: d("P21_SCIENTIFIC_KNOWLEDGE_INTAKE.md"), verifier: "scripts/verify-p21-scientific-freeze.mjs",
    subphases: [
      { id: "P21 (bone handbook)", title: "Bone health handbook v7 integration", doc: d("P21_BONE_HEALTH_HANDBOOK_V7_INTEGRATION.md") },
      { id: "P21 (mapping)", title: "Bone health mapping review", doc: d("P21_BONE_HEALTH_MAPPING_REVIEW.md") },
      { id: "P21 (navigation)", title: "Navigation knowledge", doc: d("P21_NAVIGATION_KNOWLEDGE.md") },
      { id: "P21.3", title: "Typecheck governance gate", doc: d("P21_3_TYPECHECK_GOVERNANCE_GATE.md") },
      { id: "P21.4", title: "Scientific review evidence traceability", doc: d("P21_4_SCIENTIFIC_REVIEW_EVIDENCE_TRACEABILITY.md") },
      { id: "P21.5", title: "Biological interpretation explainability", doc: d("P21_5_BIOLOGICAL_INTERPRETATION_EXPLAINABILITY.md") },
      { id: "P21.6", title: "Scientific evidence appraisal", doc: d("P21_6_SCIENTIFIC_EVIDENCE_APPRAISAL.md") },
      { id: "P21.7", title: "Independent evidence retrieval plan", doc: d("P21_7_INDEPENDENT_EVIDENCE_RETRIEVAL_PLAN.md") },
      { id: "P21.8", title: "Scientific literature screening", doc: d("P21_8_SCIENTIFIC_LITERATURE_SCREENING.md") },
      { id: "P21.9", title: "Primary study abstract extraction", doc: d("P21_9_PRIMARY_STUDY_ABSTRACT_EXTRACTION.md") },
      { id: "P21.10", title: "Full-text appraisal readiness", doc: d("P21_10_FULL_TEXT_APPRAISAL_READINESS.md") },
      { id: "P21.11", title: "Limited full-text extraction", doc: d("P21_11_LIMITED_FULLTEXT_EXTRACTION.md") },
      { id: "P21.12", title: "Quantitative evidence integrity", doc: d("P21_12_QUANTITATIVE_EVIDENCE_INTEGRITY.md") },
      { id: "P21.13", title: "Relationship decision matrix", doc: d("P21_13_RELATIONSHIP_DECISION_MATRIX.md") },
      { id: "P21.14", title: "Independent scientific review handoff", doc: d("P21_14_INDEPENDENT_SCIENTIFIC_REVIEW_HANDOFF.md") },
      { id: "P21.15", title: "Scientific baseline freeze", doc: d("P21_15_SCIENTIFIC_BASELINE_FREEZE.md") },
    ],
  },
  {
    id: "P22", number: 22, title: "Bone health documents & offline OCR", category: "data-devices", status: "gate_open",
    summary: "Bone entry, document import, mapping review and OCR asset provisioning; airplane-mode device OCR evidence is still required.",
    doc: d("P22_1_BONE_HEALTH_ENTRY_HISTORY.md"), verifier: "scripts/verify-p22-8.mjs",
    subphases: [
      { id: "P22.1", title: "Bone health entry history", doc: d("P22_1_BONE_HEALTH_ENTRY_HISTORY.md") },
      { id: "P22.2", title: "Bone health document import", doc: d("P22_2_BONE_HEALTH_DOCUMENT_IMPORT.md") },
      { id: "P22.3", title: "Bone document extraction", doc: d("P22_3_BONE_DOCUMENT_EXTRACTION.md") },
      { id: "P22.3A", title: "CSV format guide", doc: d("P22_3A_CSV_FORMAT_GUIDE.md") },
      { id: "P22.3B", title: "English-only CSV UI", doc: d("P22_3B_ENGLISH_ONLY_CSV_UI.md") },
      { id: "P22.3C", title: "Bone handbook coverage audit", doc: d("P22_3C_BONE_HANDBOOK_COVERAGE_AUDIT.md") },
      { id: "P22.4", title: "Medical report mapping review", doc: d("P22_4_MEDICAL_REPORT_MAPPING_REVIEW.md") },
      { id: "P22.5", title: "Cross-browser OCR fallback", doc: d("P22_5_CROSS_BROWSER_OCR_FALLBACK.md") },
      { id: "P22.6", title: "Offline OCR asset readiness", doc: d("P22_6_OFFLINE_OCR_ASSET_READINESS.md") },
      { id: "P22.7", title: "Verified OCR asset provisioning", doc: d("P22_7_VERIFIED_OCR_ASSET_PROVISIONING.md") },
      { id: "P22.8", title: "Offline OCR device validation (gate open)", doc: d("P22_8_OFFLINE_OCR_DEVICE_VALIDATION.md") },
      { id: "P22.9", title: "OCR human approval handoff", doc: d("P22_9_OCR_HUMAN_APPROVAL_HANDOFF.md") },
    ],
  },
  {
    id: "P23", number: 23, title: "Unified persistence & first mission activation", category: "security-cloud", status: "gate_open",
    summary: "Astronaut data persistence, sync quarantine/review and owner-gated first-operator activation.",
    doc: d("P23A_UNIFIED_ASTRONAUT_DATA_PERSISTENCE.md"), verifier: "scripts/verify-p23l.mjs",
    subphases: [
      { id: "P23A", title: "Unified astronaut data persistence", doc: d("P23A_UNIFIED_ASTRONAUT_DATA_PERSISTENCE.md") },
      { id: "P23C", title: "Persistence bridges", doc: d("P23C_PERSISTENCE_BRIDGES.md") },
      { id: "P23D", title: "Sync quarantine & ground roster metric", doc: d("P23D_SYNC_QUARANTINE_GROUND_ROSTER_METRIC.md") },
      { id: "P23E", title: "Sync rejection & review", doc: d("P23E_SYNC_REJECTION_AND_REVIEW.md") },
      { id: "P23F", title: "Browser evidence & review", doc: d("P23F_BROWSER_EVIDENCE_AND_REVIEW.md") },
      { id: "P23G", title: "Authenticated validation", doc: d("P23G_AUTHENTICATED_VALIDATION.md") },
      { id: "P23H", title: "First mission activation", doc: d("P23H_FIRST_MISSION_ACTIVATION.md") },
      { id: "P23I", title: "Privileged bootstrap handoff", doc: d("P23I_PRIVILEGED_BOOTSTRAP_HANDOFF.md") },
      { id: "P23J", title: "First operator owner handoff", doc: d("P23J_FIRST_OPERATOR_OWNER_HANDOFF.md") },
      { id: "P23K", title: "Owner activation execution gate", doc: d("P23K_OWNER_ACTIVATION_EXECUTION_GATE.md") },
      { id: "P23L", title: "Activation acceptance gate", doc: d("P23L_ACTIVATION_ACCEPTANCE_GATE.md") },
    ],
  },
  { id: "P24", number: 24, title: "Multi-mission crew reuse", category: "security-cloud", status: "implemented", summary: "Crew identities reused across missions with mission-scoped isolation.", doc: d("P24_MULTI_MISSION_CREW_REUSE.md"), verifier: "scripts/verify-p24-multi-mission.mjs" },
  { id: "P25", number: 25, title: "Unified scientific evidence", category: "science", status: "review_only", summary: "Unified evidence surface; evidence remains reference material, not clinical approval.", doc: d("P25_UNIFIED_SCIENTIFIC_EVIDENCE.md"), verifier: "scripts/verify-p25-scientific-evidence.mjs" },
  { id: "P26", number: 26, title: "Four integrated health domains", category: "science", status: "implemented", summary: "Cardiovascular, bone, immune and behavioral domain workspaces.", doc: d("P26_FOUR_INTEGRATED_HEALTH_DOMAINS.md"), verifier: "scripts/verify-p26-health-domains.mjs" },
  { id: "P27", number: 27, title: "Self-assessment & action guidance", category: "mission", status: "implemented", summary: "Astronaut self-assessment linked to bounded, non-diagnostic guidance.", doc: d("P27_ASTRONAUT_SELF_ASSESSMENT_ACTION_GUIDANCE.md"), verifier: "scripts/verify-p27-self-assessment.mjs" },
  { id: "P28", number: 28, title: "Research privacy workspace", category: "security-cloud", status: "implemented", summary: "Pseudonymized research workspace separated from identified medical review.", doc: d("P28_RESEARCH_PRIVACY_WORKSPACE.md"), verifier: "scripts/verify-p28-research-privacy.mjs" },
  { id: "P29", number: 29, title: "Autonomous offline operations", category: "mission", status: "implemented", summary: "Offline mission operations without a cloud round trip.", doc: d("P29_AUTONOMOUS_OFFLINE_MISSION_OPERATIONS.md"), verifier: "scripts/verify-p29-offline-autonomy.mjs" },
  { id: "P30", number: 30, title: "NASA scientific evidence integration", category: "science", status: "review_only", summary: "Public NASA resources referenced as evidence context; no endorsement implied.", doc: d("P30_NASA_SCIENTIFIC_EVIDENCE_INTEGRATION.md"), verifier: "scripts/verify-p30-nasa-evidence.mjs" },
  { id: "P31", number: 31, title: "Multi-astronaut simulation", category: "validation", status: "implemented", summary: "Synthetic multi-crew mission simulation.", doc: d("P31_MULTI_ASTRONAUT_MISSION_SIMULATION.md"), verifier: "scripts/verify-p31-multi-crew.mjs" },
  { id: "P32", number: 32, title: "Scientific validation & independent review gates", category: "science", status: "gate_open", summary: "Independent review gates defined; no independent approval recorded.", doc: d("P32_SCIENTIFIC_VALIDATION_INDEPENDENT_REVIEW.md"), verifier: "scripts/verify-p32-independent-review.mjs" },
  { id: "P33", number: 33, title: "Astronaut experience UX", category: "mission", status: "implemented", summary: "Mission workspace and mission-control experience.", doc: d("P33_ASTRONAUT_EXPERIENCE_MISSION_CONTROL_UX.md"), verifier: "scripts/verify-p33-mission-experience.mjs" },
  { id: "P34", number: 34, title: "Real-device end-to-end acceptance", category: "validation", status: "gate_open", summary: "Real-device acceptance checklist; open items stay pending without device evidence.", doc: d("P34_REAL_DEVICE_END_TO_END_ACCEPTANCE.md"), verifier: "scripts/verify-p34-real-device-acceptance.mjs" },
  {
    id: "P35", number: 35, title: "Global submission package & integrated demo", category: "submission", status: "gate_open",
    summary: "Submission package, live crew monitoring, handbook intake and the governed synthetic demo chain.",
    doc: d("P35_GLOBAL_SUBMISSION_PACKAGE.md"), verifier: "scripts/verify-p35-submission-readiness.mjs",
    subphases: [
      { id: "P35.1", title: "NASA research dataset import", doc: d("P35_1_NASA_RESEARCH_DATASET_IMPORT.md") },
      { id: "P35.2", title: "Live crew monitoring", doc: d("P35_2_LIVE_CREW_MONITORING.md") },
      { id: "P35.3", title: "Health intelligence review", doc: d("P35_3_HEALTH_INTELLIGENCE_REVIEW.md") },
      { id: "P35.4", title: "Cardiovascular handbook intake", doc: d("P35_4_CARDIOVASCULAR_HANDBOOK_INTAKE.md") },
      { id: "P35.4 (readiness)", title: "Integration mission readiness", doc: d("P35_4_INTEGRATION_MISSION_READINESS.md") },
      { id: "P35.4.1", title: "Unified handbook localization", doc: d("P35_4_1_UNIFIED_HANDBOOK_LOCALIZATION.md") },
      { id: "P35.4.2", title: "Device controls & password", doc: d("P35_4_2_DEVICE_CONTROLS_AND_PASSWORD.md") },
      { id: "P35.5", title: "Scientific draft integration", doc: d("P35_5_SCIENTIFIC_DRAFT_INTEGRATION.md") },
      { id: "P35.6", title: "Document domain routing preview", doc: d("P35_6_DOCUMENT_DOMAIN_ROUTING_PREVIEW.md") },
      { id: "P35.7", title: "Bone unit pending hints", doc: d("P35_7_BONE_UNIT_PENDING_HINTS.md") },
      { id: "P35.8", title: "Domain research evidence summary", doc: d("P35_8_DOMAIN_RESEARCH_EVIDENCE_SUMMARY.md") },
      { id: "P35.9", title: "Bone local evidence summary", doc: d("P35_9_BONE_LOCAL_EVIDENCE_SUMMARY.md") },
      { id: "P35.10", title: "Navigation reorganization", doc: d("P35_10_NAVIGATION_REORGANIZATION.md") },
      { id: "P35.11", title: "Synthetic demo launchpad", doc: d("P35_11_SYNTHETIC_DEMO_LAUNCHPAD.md") },
      { id: "P35.12", title: "Navigation & demo access readiness", doc: d("P35_12_NAVIGATION_DEMO_ACCESS_READINESS.md") },
      { id: "P35.13", title: "Guided demo navigation", doc: d("P35_13_GUIDED_DEMO_NAVIGATION.md") },
      { id: "P35.14", title: "Demo execution tracker", doc: d("P35_14_DEMO_EXECUTION_TRACKER.md") },
      { id: "P35.15", title: "Operational demo runbook", doc: d("P35_15_OPERATIONAL_DEMO_RUNBOOK.md") },
      { id: "P35.16", title: "Synthetic multi-domain dataset", doc: d("P35_16_SYNTHETIC_MULTI_DOMAIN_DATASET.md") },
      { id: "P35.17", title: "Interactive synthetic health preview", doc: d("P35_17_INTERACTIVE_SYNTHETIC_HEALTH_PREVIEW.md") },
      { id: "P35.18", title: "Offline synthetic intelligence report", doc: d("P35_18_OFFLINE_SYNTHETIC_INTELLIGENCE_REPORT.md") },
      { id: "P35.19", title: "Integrated offline demo", doc: d("P35_19_INTEGRATED_OFFLINE_DEMO.md") },
      { id: "P35.20", title: "Integrated demo acceptance", doc: d("P35_20_INTEGRATED_DEMO_ACCEPTANCE.md") },
      { id: "P35.21", title: "Governed demo mission activation", doc: d("P35_21_GOVERNED_DEMO_MISSION_ACTIVATION.md") },
      { id: "P35.22", title: "Final integrated demo handoff", doc: d("P35_22_FINAL_INTEGRATED_DEMO_HANDOFF.md") },
      { id: "P35 (acceptance)", title: "Final integrated acceptance", doc: d("P35_FINAL_INTEGRATED_ACCEPTANCE.md") },
      { id: "P35 (identity fix)", title: "Live identity initialization fix", doc: d("P35_LIVE_IDENTITY_INITIALIZATION_FIX.md") },
    ],
  },
  {
    id: "P36", number: 36, title: "Document-to-biomarker pipeline & ground medical review", category: "security-cloud", status: "gate_open",
    summary: "Mission document review, synthetic Cloud submission foundation and Ground Medical read-only review; P36.8D awaits independent live acceptance.",
    doc: d("P36_DOCUMENT_TO_BIOMARKER_PIPELINE.md"), verifier: "scripts/verify-p366-cloud-release.mjs",
    subphases: [
      { id: "P36.1", title: "Implementation sequence & canonical registry", doc: d("P36_IMPLEMENTATION_SEQUENCE.md") },
      { id: "P36.2A", title: "Local document review", doc: d("P36_2A_LOCAL_DOCUMENT_REVIEW.md") },
      { id: "P36.2B1", title: "Mission review & sign-in", doc: d("P36_2B1_MISSION_REVIEW_AND_SIGNIN.md") },
      { id: "P36.2B2", title: "Synthetic review handoff", doc: d("P36_2B2_SYNTHETIC_REVIEW_HANDOFF.md") },
      { id: "P36.2B3", title: "Fail-closed persistence foundation", doc: d("P36_2B3_FAIL_CLOSED_PERSISTENCE_FOUNDATION.md") },
      { id: "P36.2B4", title: "Membership identity alignment", doc: d("P36_2B4_MEMBERSHIP_IDENTITY_ALIGNMENT.md") },
      { id: "P36.2B5", title: "Review integrity", doc: d("P36_2B5_REVIEW_INTEGRITY.md") },
      { id: "P36.2B6", title: "Emergency revocation provenance", doc: d("P36_2B6_EMERGENCY_REVOCATION_PROVENANCE.md") },
      { id: "P36.2B7", title: "Pending review resolution", doc: d("P36_2B7_PENDING_REVIEW_RESOLUTION.md") },
      { id: "P36.2B8", title: "Review audit governance", doc: d("P36_2B8_REVIEW_AUDIT_GOVERNANCE.md") },
      { id: "P36.2B9", title: "Concurrent auth audit", doc: d("P36_2B9_CONCURRENT_AUTH_AUDIT.md") },
      { id: "P36.2B10", title: "Audit origin service evidence", doc: d("P36_2B10_AUDIT_ORIGIN_SERVICE_EVIDENCE.md") },
      { id: "P36.3", title: "Synthetic local research preview", doc: d("P36_3_SYNTHETIC_LOCAL_RESEARCH_PREVIEW.md") },
      { id: "P36.3A", title: "Mission documents navigation", doc: d("P36_3A_MISSION_DOCUMENTS_NAVIGATION.md") },
      { id: "P36.4", title: "Cloud submission foundation", doc: d("P36_4_CLOUD_SUBMISSION_FOUNDATION.md") },
      { id: "P36.5", title: "Select-all saved review history", doc: d("P36_5_SELECT_ALL_SAVED_REVIEW_HISTORY.md") },
      { id: "P36.6", title: "Cloud activation & GitHub release", doc: d("P36_6_CLOUD_ACTIVATION_GITHUB_RELEASE.md") },
      { id: "P36.6 (CI)", title: "CI security recovery", doc: d("P36_6_CI_SECURITY_RECOVERY.md") },
      { id: "P36.6.1", title: "Security dependency remediation", doc: d("P36_6_1_SECURITY_DEPENDENCY_REMEDIATION.md") },
      { id: "P36.6.2", title: "Activation handoff", doc: d("P36_6_2_ACTIVATION_HANDOFF.md") },
      { id: "P36.6.3", title: "Governed activation (blocked by design)", doc: d("P36_6_3_GOVERNED_ACTIVATION.md") },
      { id: "P36.6.4", title: "Owner-managed activation", doc: d("P36_6_4_OWNER_MANAGED_ACTIVATION.md") },
      { id: "P36.7", title: "Sign-in inline feedback", doc: d("P36_7_SIGNIN_INLINE_FEEDBACK.md") },
      { id: "P36.8A", title: "Ground Medical read-only", doc: d("P36_8A_GROUND_MEDICAL_READONLY.md") },
      { id: "P36.8A.1", title: "Invite acceptance feedback", doc: d("P36_8A_1_INVITE_ACCEPTANCE_FEEDBACK.md") },
      { id: "P36.8B", title: "Ground Medical review dashboard", doc: d("P36_8B_GROUND_MEDICAL_REVIEW_DASHBOARD.md") },
      { id: "P36.8C", title: "Research decision implementation", doc: d("P36_8C_IMPLEMENTATION.md") },
      { id: "P36.8C (0010)", title: "0010 deployment record", doc: d("P36_8C_0010_DEPLOYMENT_RECORD.md") },
      { id: "P36.8D", title: "Independent acceptance gate (open)", doc: d("P36_8D_INDEPENDENT_ACCEPTANCE_GATE.md") },
      { id: "P36.8D (handoff)", title: "Final handoff", doc: d("P36_8D_FINAL_HANDOFF.md") },
    ],
  },
  { id: "P37", number: 37, title: "Immune & behavioral scientific intake", category: "science", status: "review_only", summary: "Handbook intake: 117 immune and 99 behavioral source records, pending independent review.", doc: d("NIKOLAS_SCIENTIFIC_INTAKE_P37.md"), verifier: "scripts/verify-nikolas-scientific-intake.mjs" },
  { id: "P38", number: 38, title: "Catalog reconciliation", category: "science", status: "review_only", summary: "Reconciliation of intake against existing catalogs without merges.", doc: d("P38_NIKOLAS_CATALOG_RECONCILIATION.md"), verifier: "scripts/verify-p38-nikolas-reconciliation.mjs" },
  { id: "P39", number: 39, title: "Scientific semantic mapping", category: "science", status: "review_only", summary: "54 semantic mapping candidates; none approved or activated.", doc: d("P39_SCIENTIFIC_SEMANTIC_MAPPING.md"), verifier: "scripts/verify-p39-semantic-review.mjs" },
  { id: "P40", number: 40, title: "Independent scientific review handoff", category: "science", status: "review_only", summary: "Handoff package for a qualified independent reviewer.", doc: d("P40_INDEPENDENT_SCIENTIFIC_REVIEW_HANDOFF.md"), verifier: "scripts/verify-p40-independent-review.mjs" },
  {
    id: "P41", number: 41, title: "Independent review workbook", category: "science", status: "review_only",
    summary: "Reviewer workbook and complete validation handoff; no signed decisions recorded.",
    doc: d("P41_INDEPENDENT_SCIENTIFIC_REVIEW_WORKBOOK.md"), verifier: "scripts/verify-p41-review-workbook.mjs",
    subphases: [{ id: "P41.2", title: "Complete validation handoff", doc: d("P41_2_COMPLETE_VALIDATION_HANDOFF.md") }],
  },
  { id: "P42", number: 42, title: "Scientific review triage", category: "science", status: "review_only", summary: "Triage of candidates for reviewer attention.", doc: d("P42_SCIENTIFIC_REVIEW_TRIAGE.md"), verifier: "scripts/verify-p42-semantic-triage.mjs" },
  { id: "P43", number: 43, title: "Semantic decision proposals", category: "science", status: "review_only", summary: "54 decision proposals; 0 independent approvals and 0 operational activations.", doc: d("P43_SCIENTIFIC_SEMANTIC_DECISIONS.md"), verifier: "scripts/verify-p43-semantic-decisions.mjs" },
  { id: "P44", number: 44, title: "Health intelligence research explorer", category: "science", status: "review_only", summary: "Searchable research-only explorer inside Health Intelligence.", doc: d("P44_HEALTH_INTELLIGENCE_RESEARCH_EXPLORER.md"), verifier: "scripts/verify-p44-research-explorer.mjs" },
  { id: "P45", number: 45, title: "Final application UX gate", category: "validation", status: "implemented", summary: "Final UX validation; browser acceptance is Lovable-reported, not independently reproduced.", doc: d("P45_FINAL_APPLICATION_UX_GATE.md"), verifier: "scripts/verify-p45-final-ux.mjs" },
  { id: "P46", number: 46, title: "Final acceptance evidence freeze", category: "validation", status: "gate_open", summary: "Evidence freeze recording open device-OCR, crew-isolation, scientific-review and submission gates.", doc: d("P46_FINAL_ACCEPTANCE_EVIDENCE_FREEZE.md"), verifier: "scripts/verify-p46-evidence-freeze.mjs" },
  { id: "P47", number: 47, title: "NASA competition handoff", category: "submission", status: "gate_open", summary: "Competition handoff; submission is not confirmed and publication is not authorized.", doc: d("P47_NASA_COMPETITION_HANDOFF.md"), verifier: "scripts/verify-p47-competition-handoff.mjs" },
];

/**
 * Validation dimensions that must never be conflated. Values reflect the
 * repository's recorded evidence (data/submission/p46-acceptance-evidence.v1.json,
 * data/submission/p47-competition-handoff.v1.json).
 */
export const ROADMAP_VALIDATION_DIMENSIONS: readonly { id: string; label: string; state: string; note: string }[] = [
  { id: "implementation", label: "Implementation", state: "Documented per phase", note: "A phase document and code exist in the repository." },
  { id: "automated", label: "Automated verification", state: "Verifiers and tests in repository", note: "Engineering checks only. Passing tests is not scientific, clinical or flight validation." },
  { id: "scientific", label: "Independent scientific approval", state: "Not granted — 0 approvals", note: "54 proposals remain review-only with 0 operational activations." },
  { id: "device", label: "Real-device acceptance", state: "Partial — gates open", note: "One zero-install phone session recorded (P20); airplane-mode OCR and crew-isolation gates remain open." },
  { id: "submission", label: "Competition submission authorization", state: "Not confirmed", note: "Official-rules confirmation and final submission remain pending; no NASA endorsement is claimed." },
];

export const ROADMAP_DOCS: readonly string[] = [
  ...new Set(ROADMAP_PHASES.flatMap((p) => [p.doc, ...(p.subphases ?? []).map((s) => s.doc)])),
];
