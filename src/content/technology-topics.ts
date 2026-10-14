/**
 * P21 — Structured educational content for the eight Technology topics.
 *
 * Source of truth: the repository documentation listed in each topic's
 * `references` (docs/ARCHITECTURE.md, docs/KNOWN_LIMITATIONS.md and the
 * per-boundary documents). Status text must describe what is implemented in
 * this repository today; planned or host-dependent integrations are labelled
 * as such and never presented as operational.
 */

export const GITHUB_URL = "https://github.com/computech-gr/astro-vitality-core";
const doc = (name: string) => `${GITHUB_URL}/blob/main/docs/${name}`;

export const TECHNOLOGY_TOPIC_SLUGS = [
  "system-architecture",
  "device-integration",
  "wearables",
  "medical-laboratory-data",
  "environmental-telemetry",
  "canonical-health-data-model",
  "offline-first-architecture",
  "security-privacy",
] as const;

export type TechnologyTopicSlug = (typeof TECHNOLOGY_TOPIC_SLUGS)[number];

/** Implementation status vocabulary. Never upgrade a status by assumption. */
export type StatusLevel = "implemented" | "partial" | "requires-host" | "not-validated";

export const STATUS_LABEL: Record<StatusLevel, string> = {
  implemented: "Implemented in repository",
  partial: "Partially implemented",
  "requires-host": "Requires external host or hardware",
  "not-validated": "Not clinically or flight validated",
};

export type TopicLink = { label: string; href: string; external?: boolean };

export type TechnologyTopic = {
  slug: TechnologyTopicSlug;
  title: string;
  kicker: string;
  summary: string;
  intro: string;
  whyItMatters: readonly string[];
  approach: readonly string[];
  diagram: { caption: string; nodes: readonly string[] };
  technical: readonly { heading: string; body: string }[];
  status: readonly { level: StatusLevel; text: string }[];
  limitations: readonly string[];
  related: readonly TopicLink[];
  references: readonly TopicLink[];
};

export const TECHNOLOGY_TOPICS: readonly TechnologyTopic[] = [
  {
    slug: "system-architecture",
    title: "System Architecture",
    kicker: "Layered, vendor-neutral design",
    summary: "Presentation, application, domain, integration and infrastructure boundaries keep health meaning independent from vendor APIs and screens.",
    intro: "The Mitochondria separates what a health signal means from how it arrives and how it is displayed. Each layer depends only on the layer below it, so devices, transports and interfaces can change without rewriting scientific meaning.",
    whyItMatters: [
      "Long-duration missions outlive individual devices and vendors; health meaning must survive hardware changes.",
      "Crews cannot rely on a cloud round trip, so the critical sensor-to-astronaut path must run locally.",
      "Reviewers need to trace any displayed value back through a stable, inspectable chain.",
    ],
    approach: [
      "Routes and components present results but never own sensor normalization, thresholds or alert reasoning.",
      "The domain layer holds the reviewed metric registry, baselines, health intelligence and action guidance.",
      "Integrations (device SDK, wearables, laboratory, environment) translate external data into the canonical model.",
      "Infrastructure owns configuration, encrypted local storage, synchronization and the canonical-origin rule.",
    ],
    diagram: { caption: "Dependency direction from presentation down to integrations and infrastructure.", nodes: ["Routes & screens", "Application workflows", "Domain (canonical meaning)", "Integrations & infrastructure"] },
    technical: [
      { heading: "Dependency direction", body: "Code flows routes → components → application → domain → integrations/infrastructure. The domain stays independent of any concrete provider, persistence schema or transport." },
      { heading: "Local critical path", body: "Live observations reach the astronaut interface directly from local adapters. Cloud persistence sits behind a transport contract and is never required to display a reading." },
      { heading: "Governed safety separation", body: "Deterministic reviewed rules are kept apart from experimental analytics. Research-only relationships cannot produce operational actions." },
    ],
    status: [
      { level: "implemented", text: "Layer boundaries, domain registry, adapters, local runtime and mission-scoped backend exist in the repository." },
      { level: "not-validated", text: "The system is a challenge prototype; it is not a certified medical device or flight-qualified software." },
    ],
    limitations: ["The dependency direction is an enforced convention and review rule, not a compiler-enforced module boundary.", "No autonomous diagnosis, treatment or flight-rule decision is part of the architecture."],
    related: [
      { label: "Offline-First Architecture", href: "/technology/offline-first-architecture" },
      { label: "Canonical Health Data Model", href: "/technology/canonical-health-data-model" },
      { label: "Mission Workspace", href: "/mission/experience" },
    ],
    references: [
      { label: "docs/ARCHITECTURE.md", href: doc("ARCHITECTURE.md"), external: true },
      { label: "docs/REPOSITORY_STRUCTURE.md", href: doc("REPOSITORY_STRUCTURE.md"), external: true },
      { label: "docs/KNOWN_LIMITATIONS.md", href: doc("KNOWN_LIMITATIONS.md"), external: true },
    ],
  },
  {
    slug: "device-integration",
    title: "Device Integration",
    kicker: "Universal device adapter SDK",
    summary: "One adapter lifecycle — discovery, connection, capabilities, streaming, quality, normalization, cursors, health and disconnect — for every source.",
    intro: "Every sensor, platform or data transport connects through the same adapter contract. New devices can be added without changing how the platform understands a heart rate, a temperature or a dose.",
    whyItMatters: [
      "Spacecraft carry mixed hardware from different eras and suppliers.",
      "Disconnections, clock drift and artifacts are normal in flight and must be visible, not hidden.",
      "Unknown vendor metrics must never silently become health facts.",
    ],
    approach: [
      "Adapters expose discover, connect, capabilities, stream/import, quality, normalization, resume cursors, clock metadata, health and disconnect.",
      "All vendor values pass through the reviewed canonical metric registry and unit normalization.",
      "Unknown metrics fail closed and are rejected rather than guessed.",
    ],
    diagram: { caption: "Every source converges on the same governed ingestion boundary.", nodes: ["Device or transport", "Adapter lifecycle", "Quality & normalization", "Canonical observation"] },
    technical: [
      { heading: "Lifecycle contract", body: "A shared TypeScript contract defines the adapter lifecycle so conformance can be tested identically for every source class." },
      { heading: "Resume and clocks", body: "Sync cursors allow resumable imports, and clock metadata records device time versus receipt time so ordering problems stay explicit." },
      { heading: "Reference adapter", body: "A deterministic reference adapter serves as a conformance fixture. It is not a real-device integration or a product simulator." },
    ],
    status: [
      { level: "implemented", text: "The adapter SDK, conformance fixture and ingestion boundary are implemented and tested." },
      { level: "implemented", text: "The Device Integration Center exposes browser-available sources such as phone camera PPG, motion context and Web Bluetooth where supported." },
      { level: "requires-host", text: "Additional hardware classes require target devices or native hosts that are not part of the public web deployment." },
    ],
    limitations: ["Browser device access varies by platform; Web Bluetooth is not available in every browser.", "Phone camera PPG is a pulse estimate, not ECG or a clinically validated measurement."],
    related: [
      { label: "Device Integration Center", href: "/mission/devices" },
      { label: "Wearables", href: "/technology/wearables" },
      { label: "Live Monitoring", href: "/mission/live" },
    ],
    references: [
      { label: "docs/DEVICE_ADAPTER_SDK.md", href: doc("DEVICE_ADAPTER_SDK.md"), external: true },
      { label: "docs/API_ADAPTER_REFERENCE.md", href: doc("API_ADAPTER_REFERENCE.md"), external: true },
      { label: "docs/ZERO_INSTALL_LIVE_DEVICE_DEMO.md", href: doc("ZERO_INSTALL_LIVE_DEVICE_DEMO.md"), external: true },
    ],
  },
  {
    slug: "wearables",
    title: "Wearables",
    kicker: "Wearable source classes",
    summary: "Web Bluetooth, Android Health Connect and Apple HealthKit bridge contracts and vendor-cloud imports converge on one canonical metric model.",
    intro: "Wearables give continuous context on heart rate, sleep and activity. The Mitochondria treats each wearable path as a source class above the device SDK, so different products produce comparable, provenance-tagged observations.",
    whyItMatters: [
      "Continuous low-burden monitoring is essential when crew time is scarce.",
      "Personal trends matter more than single readings, so sources must be consistent over months.",
      "Vendor scores are proprietary and must not be mistaken for reviewed physiological measures.",
    ],
    approach: [
      "Standard Web Bluetooth Heart Rate Service ingestion runs directly in supported browsers.",
      "Android Health Connect and Apple HealthKit are reached through host/native bridge contracts.",
      "Vendor-cloud history import uses an injected, separately authorized client; the adapter never owns credentials.",
    ],
    diagram: { caption: "Three wearable paths, one canonical model.", nodes: ["Web Bluetooth / native bridge / vendor cloud", "Wearable source class", "Device SDK", "Canonical observation"] },
    technical: [
      { heading: "Browser honesty", body: "Browser code does not pretend to access Health Connect or HealthKit directly; those require a native host application implementing the bridge contract." },
      { heading: "Credential ownership", body: "OAuth tokens and vendor credentials stay outside the adapter, supplied by an authorized host, so the open-source code never embeds secrets." },
    ],
    status: [
      { level: "implemented", text: "Web Bluetooth Heart Rate Service ingestion works in browsers that support it." },
      { level: "requires-host", text: "Health Connect and HealthKit bridges are contracts; a native host app is required and is not shipped with the web deployment." },
      { level: "requires-host", text: "Vendor-cloud import requires an authorized client and credentials that are not configured in the public deployment." },
    ],
    limitations: ["No specific commercial wearable is certified or endorsed.", "Battery drain on target hardware has not been measured."],
    related: [
      { label: "Device Integration", href: "/technology/device-integration" },
      { label: "Live Monitoring", href: "/mission/live" },
      { label: "Device Integration Center", href: "/mission/devices" },
    ],
    references: [
      { label: "docs/WEARABLES_INTEGRATION.md", href: doc("WEARABLES_INTEGRATION.md"), external: true },
      { label: "docs/KNOWN_LIMITATIONS.md", href: doc("KNOWN_LIMITATIONS.md"), external: true },
    ],
  },
  {
    slug: "medical-laboratory-data",
    title: "Medical & Laboratory Data",
    kicker: "Periodic biomarker ingestion",
    summary: "CSV, explicitly mapped FHIR Observations, manual entry and medical-device readings keep specimen, method and reference-context provenance.",
    intro: "Blood, urine and medical-device results arrive periodically rather than continuously. The platform ingests them with full provenance so a value is always shown with where, when and how it was produced.",
    whyItMatters: [
      "Bone, immune and metabolic changes in spaceflight are tracked largely through periodic biomarkers.",
      "A laboratory value without its method or specimen context can be misread.",
      "Imported reference intervals are not the same as a personal baseline or a mission limit.",
    ],
    approach: [
      "CSV import requires a canonical metric code, numeric value, unit and observation time.",
      "FHIR Observation/Bundle import uses an explicit code map; unknown terminology fails closed.",
      "Manual entry is a fallback that keeps the original source label and marks provenance as manual.",
      "SpO2 and blood-pressure device readings pass through the same canonical validation.",
    ],
    diagram: { caption: "Periodic inputs keep provenance through to the canonical model.", nodes: ["CSV / FHIR / manual / device", "Explicit code mapping", "Unit & provenance checks", "Canonical biomarker result"] },
    technical: [
      { heading: "Three separate layers", body: "Personal baseline, laboratory reference interval and mission operational limit are stored as separate structures and never merged automatically." },
      { heading: "No guessed semantics", body: "The importer does not infer LOINC or other clinical codes. Only reviewed mappings are accepted." },
    ],
    status: [
      { level: "implemented", text: "CSV, mapped FHIR, manual entry and the medical-device bridge are implemented and tested with synthetic data." },
      { level: "partial", text: "Bone health document import and offline OCR exist; offline OCR readiness still requires real-device airplane-mode validation." },
      { level: "requires-host", text: "No live connection to a laboratory information system is configured." },
    ],
    limitations: ["Only synthetic or cleared demo data belong in the public project.", "Clinical thresholds and escalation wording require qualified clinical governance."],
    related: [
      { label: "Bone Health", href: "/mission/bone-health" },
      { label: "Recorded Mission Data", href: "/mission/records" },
      { label: "Canonical Health Data Model", href: "/technology/canonical-health-data-model" },
    ],
    references: [
      { label: "docs/MEDICAL_LAB_INTEGRATION.md", href: doc("MEDICAL_LAB_INTEGRATION.md"), external: true },
      { label: "docs/P22_8_OFFLINE_OCR_DEVICE_VALIDATION.md", href: doc("P22_8_OFFLINE_OCR_DEVICE_VALIDATION.md"), external: true },
    ],
  },
  {
    slug: "environmental-telemetry",
    title: "Environmental Telemetry",
    kicker: "Habitat and radiation context",
    summary: "Habitat and dosimetry adapters keep compartment, detector, unit and quality context on the same mission timeline as physiology.",
    intro: "Crew health cannot be read in isolation from the spacecraft. CO₂, oxygen, pressure, temperature, humidity, noise, light and radiation share the mission timeline with physiological data.",
    whyItMatters: [
      "Elevated CO₂, noise and light disruption are recognised factors around sleep and performance.",
      "Radiation exposure accumulates across deep-space missions.",
      "Context explains signals — but correlation must not be presented as cause.",
    ],
    approach: [
      "An environmental adapter accepts habitat gateway data through MQTT, WebSocket or REST clients injected by the host.",
      "A dosimeter adapter preserves detector and radiation-field context.",
      "Only reviewed canonical environmental metrics are exposed; unreviewed vendor scores fail closed.",
    ],
    diagram: { caption: "Spacecraft context joins the crew health timeline.", nodes: ["Habitat gateway / dosimeter", "Environmental adapter", "Reviewed registry", "Shared mission timeline"] },
    technical: [
      { heading: "Radiation quantities stay separate", body: "Absorbed dose (mGy), dose equivalent (mSv) and dose rate (µSv/h) are kept distinct and never numerically merged." },
      { heading: "Location context", body: "Environmental observations keep compartment or location so readings from different modules are not confused." },
    ],
    status: [
      { level: "implemented", text: "Environmental and dosimetry adapter contracts and normalization are implemented and tested." },
      { level: "requires-host", text: "No live habitat gateway or physical dosimeter is connected in the public deployment; scenarios use synthetic data." },
    ],
    limitations: ["Radiation telemetry does not produce an autonomous biological risk score.", "CO₂ and cognition remain contextual and non-causal unless stronger evidence is approved."],
    related: [
      { label: "Mission Scenario", href: "/mission/simulation" },
      { label: "Health Intelligence", href: "/mission/intelligence" },
      { label: "Environment & Radiation", href: "/project/guide#environment-radiation" },
    ],
    references: [
      { label: "docs/ENVIRONMENTAL_RADIATION_TELEMETRY.md", href: doc("ENVIRONMENTAL_RADIATION_TELEMETRY.md"), external: true },
      { label: "docs/NASA_RESOURCE_ATTRIBUTION.md", href: doc("NASA_RESOURCE_ATTRIBUTION.md"), external: true },
    ],
  },
  {
    slug: "canonical-health-data-model",
    title: "Canonical Health Data Model",
    kicker: "One reviewed meaning per metric",
    summary: "Metrics are normalized through a reviewed registry with deterministic serialization, unit safety, provenance and research/operational classification.",
    intro: "Every observation — from a wearable, a laboratory, a habitat sensor or a questionnaire — becomes the same structured envelope. That shared meaning is what makes personal baselines and explainable findings possible.",
    whyItMatters: [
      "Comparing values across devices requires one unit and one definition per metric.",
      "Provenance and quality must travel with every value so reviewers can trust or discount it.",
      "Research-only measures must be clearly separated from operational ones.",
    ],
    approach: [
      "A reviewed metric registry derived from the v1.1 biomarker matrix defines code, unit and classification.",
      "The observation envelope carries subject, mission, source provenance, timestamp, sampling, quality and sync state.",
      "High-frequency signals such as ECG use a separate raw-series chunk contract.",
    ],
    diagram: { caption: "From raw value to a governed canonical observation.", nodes: ["Raw value + unit", "Registry lookup", "Unit normalization & quality", "Canonical observation envelope"] },
    technical: [
      { heading: "Deterministic serialization", body: "Observations round-trip through deterministic serialization so the same input always produces the same stored record." },
      { heading: "Interchange-ready", body: "Optional external coding metadata allows later FHIR-compatible exchange without making FHIR the internal model." },
    ],
    status: [
      { level: "implemented", text: "The registry, ingestion pipeline, unit normalization and serialization are implemented and tested." },
      { level: "not-validated", text: "Biomarker Matrix v1.1 is a team scientific implementation review, not clinical validation." },
    ],
    limitations: ["Missing or poor-quality safety-relevant values are never silently imputed.", "Independent scientific review remains pending and is not marked approved."],
    related: [
      { label: "NASA Scientific Evidence", href: "/mission/nasa-evidence" },
      { label: "Biomarkers & Signals", href: "/project/guide#biomarkers-signals" },
      { label: "Medical & Laboratory Data", href: "/technology/medical-laboratory-data" },
    ],
    references: [
      { label: "docs/CANONICAL_HEALTH_DATA.md", href: doc("CANONICAL_HEALTH_DATA.md"), external: true },
      { label: "docs/SCIENTIFIC_BASELINE_V1_1.md", href: doc("SCIENTIFIC_BASELINE_V1_1.md"), external: true },
      { label: "docs/DOMAIN_MODEL.md", href: doc("DOMAIN_MODEL.md"), external: true },
    ],
  },
  {
    slug: "offline-first-architecture",
    title: "Offline-First Architecture",
    kicker: "The health loop continues without Earth",
    summary: "Encrypted local storage, append-only events, a protocol cache and an idempotent sync queue keep the astronaut-side loop working during network loss.",
    intro: "Communication delays to Mars can reach many minutes each way, with blackouts. The platform is designed so capture, display, interpretation and protocol guidance keep working locally and synchronize later.",
    whyItMatters: [
      "Real-time ground support is not possible on deep-space missions.",
      "Losing data during an outage would break personal baselines.",
      "Duplicate or conflicting records after reconnection must be resolved predictably.",
    ],
    approach: [
      "AES-GCM encrypted events in IndexedDB with a non-extractable device-local key.",
      "Append-only mission-health events; conflicting reuse of an identity fails closed.",
      "A versioned protocol cache with SHA-256 integrity metadata.",
      "A store-and-forward queue with idempotency keys and deterministic conflict resolution.",
    ],
    diagram: { caption: "Local first, synchronize when a link is available.", nodes: ["Local capture", "Encrypted local store", "Store-and-forward queue", "Authorized ground sync"] },
    technical: [
      { heading: "Service worker scope", body: "The service worker caches the public application shell and assets only. It never caches health API responses." },
      { heading: "Conflict resolution", body: "Conflicts resolve by payload identity, source version, event time and source priority; ambiguous ties require manual review." },
    ],
    status: [
      { level: "implemented", text: "Encrypted local store, protocol cache, sync queue and the Offline Mission Mode status page are implemented." },
      { level: "partial", text: "Offline OCR readiness is not claimed until real-device airplane-mode testing is completed." },
      { level: "not-validated", text: "Browser storage is not flight-qualified storage." },
    ],
    limitations: ["Browser storage can be cleared by the user or operating system.", "Measured latency is environment-specific engineering evidence."],
    related: [
      { label: "Offline Mission Mode", href: "/mission/offline" },
      { label: "Daily Readiness Check-in", href: "/mission/readiness" },
      { label: "Security & Privacy", href: "/technology/security-privacy" },
    ],
    references: [
      { label: "docs/OFFLINE_MISSION_MODE.md", href: doc("OFFLINE_MISSION_MODE.md"), external: true },
      { label: "docs/P29_AUTONOMOUS_OFFLINE_MISSION_OPERATIONS.md", href: doc("P29_AUTONOMOUS_OFFLINE_MISSION_OPERATIONS.md"), external: true },
    ],
  },
  {
    slug: "security-privacy",
    title: "Security & Privacy",
    kicker: "Mission-scoped access, audited",
    summary: "Forced row-level security, mission-scoped roles, pseudonymized research export, audit trails and encrypted local storage form the current security boundary.",
    intro: "Astronaut health data is among the most sensitive information on a mission. Access is decided by mission membership and role in the database itself, every sensitive action is audited, and research receives de-identified data only.",
    whyItMatters: [
      "Small crews make individuals easy to identify, so privacy must be designed in.",
      "Medical oversight, research and operations need different, separated access.",
      "Security failures must fail closed and never be turned into medical conclusions.",
    ],
    approach: [
      "Forced row-level security with mission-scoped roles: Crew Self, Ground Medical, Researcher and Mission Operator.",
      "Authenticated database functions with internal authorization checks and append-only audit events.",
      "Pseudonymized research export with restricted keys.",
      "Encrypted local storage on the astronaut device.",
    ],
    diagram: { caption: "Access is evaluated per mission and per role, then audited.", nodes: ["Authenticated user", "Mission membership & role", "Row-level security", "Audited, scoped data"] },
    technical: [
      { heading: "Role separation", body: "Identified medical oversight and de-identified research are separate roles. Mission Operators see operational totals rather than medical detail." },
      { heading: "Threat model", body: "The connected path is threat-modeled from sensor collection through local storage, synchronization, ground access and research export." },
    ],
    status: [
      { level: "implemented", text: "Row-level security, mission-scoped roles, audit events and pseudonymized export are implemented in production." },
      { level: "partial", text: "Additional multi-role hardening is prepared and awaiting owner-authorized deployment." },
      { level: "partial", text: "An open platform-level finding (FV-01-13) keeps the overall final security gate blocked." },
    ],
    limitations: ["No independent penetration test has been completed.", "The platform does not yet offer multi-factor or directory-backed identity assurance."],
    related: [
      { label: "Mission Identity & Sign-in", href: "/mission/identity" },
      { label: "Ground & Research Console", href: "/mission/ground" },
      { label: "Mission & Crew Operations", href: "/mission/operations" },
    ],
    references: [
      { label: "docs/SECURITY_MODEL.md", href: doc("SECURITY_MODEL.md"), external: true },
      { label: "docs/security/THREAT_MODEL.md", href: doc("security/THREAT_MODEL.md"), external: true },
      { label: "docs/P28_RESEARCH_PRIVACY_WORKSPACE.md", href: doc("P28_RESEARCH_PRIVACY_WORKSPACE.md"), external: true },
    ],
  },
];

export function technologyTopicPath(slug: TechnologyTopicSlug) {
  return `/technology/${slug}` as const;
}

export function findTechnologyTopic(slug: string): TechnologyTopic | undefined {
  return TECHNOLOGY_TOPICS.find((topic) => topic.slug === slug);
}
