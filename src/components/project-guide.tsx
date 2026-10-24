import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

const NASA_URL = "https://www.spaceappschallenge.org/2026/";
const CHALLENGE_URL =
  "https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/";
const GITHUB_URL = "https://github.com/computech-gr/astro-vitality-core";

const DOCS_URL = GITHUB_URL + "/blob/main/docs/";

/** Phase history taken strictly from repository documentation file names; status is documentation-only. */
const roadmapPhases: readonly { phase: string; title: string; doc: string }[] = [
  { phase: "P4", title: "Canonical health data", doc: "CANONICAL_HEALTH_DATA.md" },
  { phase: "P5", title: "Device adapter SDK", doc: "DEVICE_ADAPTER_SDK.md" },
  { phase: "P6", title: "Wearables integration", doc: "WEARABLES_INTEGRATION.md" },
  { phase: "P7", title: "Medical & laboratory integration", doc: "MEDICAL_LAB_INTEGRATION.md" },
  { phase: "P8", title: "Environmental & radiation telemetry", doc: "ENVIRONMENTAL_RADIATION_TELEMETRY.md" },
  { phase: "P9", title: "Astronaut live dashboard", doc: "LIVE_DASHBOARD.md" },
  { phase: "P10", title: "Personal baseline engine", doc: "PERSONAL_BASELINE_ENGINE.md" },
  { phase: "P11", title: "Cognitive & behavioral module", doc: "COGNITIVE_BEHAVIORAL_MODULE.md" },
  { phase: "P12", title: "Health intelligence v1", doc: "HEALTH_INTELLIGENCE_V1.md" },
  { phase: "P13", title: "Action & protocol guidance", doc: "ACTION_PROTOCOL_GUIDANCE.md" },
  { phase: "P14", title: "Offline mission mode", doc: "OFFLINE_MISSION_MODE.md" },
  { phase: "P16", title: "Security & safety hardening", doc: "SECURITY_MODEL.md" },
  { phase: "P17", title: "Simulation & synthetic dataset", doc: "SIMULATION_SYNTHETIC_DATASET.md" },
  { phase: "P18", title: "Validation & usability", doc: "VALIDATION_USABILITY.md" },
  { phase: "P19", title: "Open-source release candidate", doc: "RELEASE_CANDIDATE.md" },
  { phase: "P20", title: "Real-device evidence", doc: "P20_REAL_DEVICE_EVIDENCE.md" },
  { phase: "P24", title: "Multi-mission crew reuse", doc: "P24_MULTI_MISSION_CREW_REUSE.md" },
  { phase: "P25", title: "Unified scientific evidence", doc: "P25_UNIFIED_SCIENTIFIC_EVIDENCE.md" },
  { phase: "P26", title: "Four integrated health domains", doc: "P26_FOUR_INTEGRATED_HEALTH_DOMAINS.md" },
  { phase: "P27", title: "Self-assessment & action guidance", doc: "P27_ASTRONAUT_SELF_ASSESSMENT_ACTION_GUIDANCE.md" },
  { phase: "P28", title: "Research privacy workspace", doc: "P28_RESEARCH_PRIVACY_WORKSPACE.md" },
  { phase: "P29", title: "Autonomous offline operations", doc: "P29_AUTONOMOUS_OFFLINE_MISSION_OPERATIONS.md" },
  { phase: "P30", title: "NASA scientific evidence", doc: "P30_NASA_SCIENTIFIC_EVIDENCE_INTEGRATION.md" },
  { phase: "P31", title: "Multi-astronaut simulation", doc: "P31_MULTI_ASTRONAUT_MISSION_SIMULATION.md" },
  { phase: "P32", title: "Scientific validation & independent review", doc: "P32_SCIENTIFIC_VALIDATION_INDEPENDENT_REVIEW.md" },
  { phase: "P33", title: "Astronaut experience UX", doc: "P33_ASTRONAUT_EXPERIENCE_MISSION_CONTROL_UX.md" },
  { phase: "P34", title: "Real-device end-to-end acceptance", doc: "P34_REAL_DEVICE_END_TO_END_ACCEPTANCE.md" },
  { phase: "P35", title: "Global submission package", doc: "P35_GLOBAL_SUBMISSION_PACKAGE.md" },
];

export const ROADMAP_DOCS = roadmapPhases.map((phase) => phase.doc);

type GuideItem = {
  id: string;
  title: string;
  summary: string;
  href?: string;
  hrefLabel?: string;
  external?: boolean;
  links?: readonly GuideLink[];
  noAction?: string;
};

type GuideLink = {
  href: string;
  label: string;
  kind: "learn" | "technology" | "evidence" | "console" | "roadmap";
  external?: boolean;
};

type GuideGroup = {
  id: string;
  title: string;
  intro: string;
  items: readonly GuideItem[];
};

const groups: readonly GuideGroup[] = [
  {
    id: "mission-guide",
    title: "Mission",
    intro: "Why autonomous, context-aware health support matters during long-duration human spaceflight.",
    items: [
      { id: "our-mission", title: "Our Mission", summary: "Support astronaut autonomy with explainable, human-in-the-loop health intelligence that continues to function when Earth connectivity is delayed or absent.", links: [{ href: "/#mission", label: "Learn More", kind: "learn" }] },
      { id: "why-autonomous-health", title: "Why Autonomous Health", summary: "The astronaut-side health loop must remain useful without a cloud round trip: local sensing, local interpretation, local protocols, and later synchronization.", links: [{ href: "/technology/offline-first-architecture", label: "Explore Technology", kind: "technology" }] },
      { id: "long-duration-spaceflight", title: "Long-Duration Spaceflight", summary: "The system treats physiology, cognition, workload, habitat conditions, radiation and mission phase as one longitudinal context rather than isolated measurements.", links: [{ href: "/mission/nasa-evidence", label: "View Scientific Evidence", kind: "evidence" }] },
      { id: "mission-scenario", title: "Mission Scenario", summary: "Mission Day 127 is the deterministic synthetic challenge story used to exercise missing data, artifacts, CO₂ context, radiation context, fatigue and reconnect behavior.", href: "/mission/simulation", hrefLabel: "Open Mission Scenario" },
      { id: "challenge", title: "The Challenge", summary: "The Mitochondria is an independent open-source response to the 2026 NASA Space Apps astronaut health-monitoring challenge.", href: CHALLENGE_URL, hrefLabel: "Official challenge page", external: true },
    ],
  },
  {
    id: "science-guide",
    title: "Science",
    intro: "Scientific governance is explicit: personal baselines, data quality, provenance, uncertainty and reviewed evidence remain distinct from diagnosis.",
    items: [
      { id: "scientific-foundation", title: "Scientific Foundation", summary: "The reviewed v1.1 biomarker matrix is the controlled scientific baseline for metric meaning, confounders, evidence and operational-vs-research classification.", links: [{ href: "/mission/nasa-evidence", label: "View Scientific Evidence", kind: "evidence" }, { href: GITHUB_URL + "/blob/main/docs/SCIENTIFIC_BASELINE_V1_1.md", label: "Read baseline v1.1 document", kind: "learn", external: true }] },
      { id: "spaceflight-health-risks", title: "Spaceflight Health Risks", summary: "The model spans cardiovascular, musculoskeletal, immune/inflammatory, metabolic/hydration, cognitive/behavioral, environmental and radiation-related context.", links: [{ href: GITHUB_URL + "/blob/main/docs/P26_FOUR_INTEGRATED_HEALTH_DOMAINS.md", label: "Learn More", kind: "learn", external: true }] },
      { id: "biomarkers-signals", title: "Biomarkers & Signals", summary: "Canonical observations preserve units, timestamps, source provenance, quality, uncertainty and context instead of reducing health to a single score.", links: [{ href: "/technology/canonical-health-data-model", label: "Explore Technology", kind: "technology" }] },
      { id: "personal-baselines", title: "Personal Baselines", summary: "Preflight and mission-phase baselines are versioned distributions. Clinical reference intervals and mission operational limits remain separate concepts.", href: "/mission/live", hrefLabel: "View baseline-aware live console" },
      { id: "cognitive-behavioral-health", title: "Cognitive & Behavioral Health", summary: "Short cognitive tasks, fatigue, sleepiness, stress and workload are treated longitudinally and privately, without psychiatric diagnosis.", href: "/mission/readiness", hrefLabel: "Open Readiness Assessment" },
      { id: "environment-radiation", title: "Environment & Radiation", summary: "CO₂, O₂, pressure, temperature, humidity, light, noise and radiation share the mission timeline while causal claims remain evidence-governed.", links: [{ href: "/technology/environmental-telemetry", label: "Explore Technology", kind: "technology" }] },
      { id: "scientific-safety-boundaries", title: "Scientific Safety Boundaries", summary: "Research-only findings cannot become operational alerts; missing context lowers confidence; medical escalation requires governed authority and explicit protocol logic.", href: "/mission/validation", hrefLabel: "Review validation & limitations" },
    ],
  },
  {
    id: "platform-guide",
    title: "Platform",
    intro: "Operational surfaces expose the implemented health loop without inventing values when a feed is absent.",
    items: [
      { id: "platform-overview", title: "Platform Overview", summary: "The platform combines device ingestion, canonical data, personal baselines, explainable intelligence, protocol guidance, offline operation and ground/research review.", links: [{ href: "/technology/system-architecture", label: "Explore Technology", kind: "technology" }] },
      { id: "astronaut-health-twin", title: "Astronaut Health Twin", summary: "The health twin is a longitudinal mission context assembled from validated observations, baselines, environment and mission state; it is not a diagnostic digital clone.", links: [{ href: "/mission/experience", label: "Open Mission Workspace", kind: "console" }] },
      { id: "live-monitoring", title: "Live Monitoring", summary: "Live sensor values update locally with explicit LIVE, STALE, DISCONNECTED and WAITING states.", href: "/mission/live", hrefLabel: "Open Live Monitoring" },
      { id: "personalization", title: "Personalization", summary: "Interpretation is anchored to validated crew-specific baseline profiles and mission phase rather than universal one-size-fits-all thresholds.", href: "/mission/live", hrefLabel: "View personalized deltas" },
      { id: "health-intelligence", title: "Health Intelligence", summary: "Reviewed trends and multi-signal patterns expose contributing evidence, confidence, uncertainty, confounders and missing context.", href: "/mission/intelligence", hrefLabel: "Open Health Intelligence" },
      { id: "explainable-alerts", title: "Explainable Alerts", summary: "Operational findings are evidence-bearing and fail closed when data quality or scientific classification does not support an operational conclusion.", href: "/mission/intelligence", hrefLabel: "Review explainable findings" },
      { id: "action-guidance", title: "Action Guidance", summary: "Versioned protocol guidance supports repeat measurement, quality review, recovery/workload review, environmental review and governed escalation.", href: "/mission/guidance", hrefLabel: "Open Action Guidance" },
      { id: "offline-mission-mode", title: "Offline Mission Mode", summary: "Encrypted local persistence, append-only events, protocol cache and an idempotent sync queue keep the astronaut-side loop operating during network loss.", href: "/mission/offline", hrefLabel: "Open Offline Mission Mode" },
      { id: "ground-research-console", title: "Ground & Research Console", summary: "Mission-scoped roles separate identified medical oversight from de-identified research exports, with audit logging and RLS-backed authorization.", href: "/mission/ground", hrefLabel: "Open Ground Console" },
    ],
  },
  {
    id: "technology-guide",
    title: "Technology",
    intro: "The architecture is adapter-based, canonical-data-first, offline-first and intentionally vendor-neutral.",
    items: [
      { id: "system-architecture", title: "System Architecture", summary: "Presentation, application, domain, integrations and infrastructure boundaries keep health meaning independent from vendor APIs and UI concerns.", links: [{ href: "/technology/system-architecture", label: "Explore Technology", kind: "technology" }] },
      { id: "device-integration", title: "Device Integration", summary: "The adapter lifecycle covers discovery, connection, capabilities, streaming, quality, normalization, sync cursors, health and disconnect.", links: [{ href: "/technology/device-integration", label: "Explore Technology", kind: "technology" }] },
      { id: "wearables", title: "Wearables", summary: "Web Bluetooth, Android Health Connect, Apple HealthKit bridge contracts and vendor-cloud adapters converge on the same canonical metric model.", href: "/mission/live", hrefLabel: "Open device-aware live console", links: [{ href: "/technology/wearables", label: "Explore Technology", kind: "technology" }] },
      { id: "medical-laboratory-data", title: "Medical & Laboratory Data", summary: "FHIR, CSV, manual entry and medical-device inputs retain specimen, assay/method and reference-context provenance while unmapped codes fail closed.", links: [{ href: "/technology/medical-laboratory-data", label: "Explore Technology", kind: "technology" }] },
      { id: "environmental-telemetry", title: "Environmental Telemetry", summary: "Habitat and radiation adapters preserve location, detector/source metadata, units and quality on the same mission timeline.", links: [{ href: "/technology/environmental-telemetry", label: "Explore Technology", kind: "technology" }] },
      { id: "canonical-health-data-model", title: "Canonical Health Data Model", summary: "Metrics are normalized through a reviewed registry with deterministic serialization, unit safety, provenance and explicit research/operational classification.", links: [{ href: "/technology/canonical-health-data-model", label: "Explore Technology", kind: "technology" }] },
      { id: "offline-first-architecture", title: "Offline-First Architecture", summary: "The critical sensor-to-astronaut path does not depend on cloud availability; synchronization is store-and-forward and conflict-aware.", href: "/mission/offline", hrefLabel: "Inspect offline runtime", links: [{ href: "/technology/offline-first-architecture", label: "Explore Technology", kind: "technology" }] },
      { id: "security-privacy", title: "Security & Privacy", summary: "Forced RLS, mission-scoped roles, restricted pseudonymization keys, authenticated SECURITY DEFINER RPCs with internal authorization, audit trails and encrypted local storage form the current security boundary.", href: "/mission/ground", hrefLabel: "Open governed ground surface", links: [{ href: "/technology/security-privacy", label: "Explore Technology", kind: "technology" }] },
    ],
  },
  {
    id: "open-source-guide",
    title: "Open Source",
    intro: "The release candidate is designed to be inspectable, reproducible and self-hostable rather than dependent on one proprietary builder.",
    items: [
      { id: "open-source-mission", title: "Open-Source Mission", summary: "Apache-2.0 licensing, reproducible science, transparent decisions and vendor-neutral adapters are first-class project requirements.", links: [{ href: GITHUB_URL + "/blob/main/docs/OPEN_SOURCE.md", label: "Learn More", kind: "learn", external: true }] },
      { id: "github-repository", title: "GitHub Repository", summary: "Source, migrations, tests, documentation, synthetic data and release tooling are version controlled.", href: GITHUB_URL, hrefLabel: "Open GitHub repository", external: true },
      { id: "documentation", title: "Documentation", summary: "The repository contains architecture, scientific governance, data model, device, offline, security, validation, release and submission documentation.", href: GITHUB_URL + "/tree/main/docs", hrefLabel: "Browse repository docs", external: true },
      { id: "device-adapter-sdk", title: "Device Adapter SDK", summary: "A common adapter contract lets new sensors and platforms integrate without changing canonical health meaning.", links: [{ href: "/technology/device-integration", label: "Explore Technology", kind: "technology" }, { href: GITHUB_URL + "/blob/main/docs/DEVICE_ADAPTER_SDK.md", label: "Read SDK document", kind: "learn", external: true }] },
      { id: "data-interoperability", title: "Data & Interoperability", summary: "FHIR/lab ingestion, canonical metric identifiers, unit normalization and explicit provenance provide the interoperability boundary.", links: [{ href: "/technology/medical-laboratory-data", label: "Explore Technology", kind: "technology" }] },
      { id: "contributing", title: "Contributing", summary: "Contributions are governed by evidence traceability, no-real-medical-data rules, tests and security requirements.", href: GITHUB_URL + "/blob/main/CONTRIBUTING.md", hrefLabel: "Read contributing guide", external: true },
      { id: "security-policy", title: "Security Policy", summary: "Security issues follow responsible disclosure and must not be reported with real astronaut or medical data.", href: GITHUB_URL + "/blob/main/SECURITY.md", hrefLabel: "Read security policy", external: true },
      { id: "license", title: "License", summary: "The project is released under Apache License 2.0.", href: GITHUB_URL + "/blob/main/LICENSE", hrefLabel: "Read license", external: true },
    ],
  },
  {
    id: "about-guide",
    title: "About",
    intro: "Challenge context, scientific governance, validation evidence and submission materials are kept explicit and traceable.",
    items: [
      { id: "the-mitochondria", title: "The Mitochondria", summary: "An independent open-source astronaut health-intelligence project built by the team for NASA Space Apps Challenge 2026.", links: [{ href: GITHUB_URL + "#readme", label: "Learn More", kind: "learn", external: true }] },
      { id: "nasa-space-apps-2026", title: "NASA Space Apps 2026", summary: "The project participates in the 2026 NASA International Space Apps Challenge and does not imply NASA endorsement.", href: NASA_URL, hrefLabel: "Visit NASA Space Apps 2026", external: true },
      { id: "team", title: "Team", summary: "Meet The Mitochondria team participating in NASA Space Apps Challenge 2026 at the Nicosia, Cyprus local event.", href: "/competition/team", hrefLabel: "Our Team — NASA Space Apps 2026" },
      { id: "scientific-approach", title: "Scientific Approach", summary: "Biological review, controlled evidence, uncertainty, personal baselines, context and human oversight are built into the software architecture.", links: [{ href: "/mission/nasa-evidence", label: "View Scientific Evidence", kind: "evidence" }, { href: GITHUB_URL + "/blob/main/docs/SCIENTIFIC_GOVERNANCE.md", label: "Read scientific governance", kind: "learn", external: true }] },
      { id: "roadmap", title: "Roadmap", summary: "The phased roadmap progressed from challenge thesis and scientific foundation through adapters, live monitoring, intelligence, offline mode, ground/research security, validation and release readiness.", links: [{ href: "#roadmap-detail", label: "View Roadmap", kind: "roadmap" }] },
      { id: "validation-limitations", title: "Validation & Limitations", summary: "Engineering and usability evidence is separated from clinical validation claims; known limitations remain visible.", href: "/mission/validation", hrefLabel: "Open validation evidence" },
      { id: "challenge-submission", title: "Challenge Submission", summary: "The submission surface tracks the 3-minute story, evidence gates, attribution and final challenge materials without marking human/external gates ready by assumption.", href: "/mission/submission", hrefLabel: "Open submission status" },
      { id: "resources-references", title: "Resources & References", summary: "NASA, standards and scientific resources are maintained in the repository citation and attribution documents.", href: GITHUB_URL + "/blob/main/CITATIONS.md", hrefLabel: "Open citations", external: true },
    ],
  },
];

export function ProjectGuidePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[94rem] px-5 py-14 lg:px-8 lg:py-20">
        <p className="section-kicker">Project guide</p>
        <h1 className="mt-3 max-w-5xl font-display text-4xl font-semibold leading-tight sm:text-6xl">Every navigation item now has a meaningful destination.</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
          This guide separates public project explanations from the operational mission consoles. It does not invent unimplemented functionality; where a working console exists, the relevant section links directly to it.
        </p>

        <nav aria-label="Project guide sections" className="mt-10 flex flex-wrap gap-2">
          {groups.map((group) => (
            <a key={group.id} href={`#${group.id}`} className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary">
              {group.title}
            </a>
          ))}
        </nav>

        <div className="mt-16 space-y-20">
          {groups.map((group) => (
            <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className="scroll-mt-28">
              <div className="grid gap-7 lg:grid-cols-[0.32fr_0.68fr]">
                <div>
                  <p className="section-kicker">{group.title}</p>
                  <h2 id={`${group.id}-title`} className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{group.title}</h2>
                  <p className="mt-4 leading-7 text-muted-foreground">{group.intro}</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.items.map((item) => (
                    <article key={item.id} id={item.id} className="scroll-mt-28 border border-border bg-surface p-5 sm:p-6">
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                      {item.noAction && <p className="mt-4 text-xs leading-5 text-muted-foreground">{item.noAction}</p>}
                      {item.links && (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {item.links.map((link) => (
                            <Button key={link.href} asChild variant={link.kind === "learn" && link.external ? "ghost" : "outline"} size="sm">
                              <a href={link.href} aria-label={`${link.label}: ${item.title}${link.external ? " (opens GitHub in a new tab)" : ""}`} target={link.external ? "_blank" : undefined} rel={link.external ? "noopener noreferrer" : undefined}>
                                {link.label}
                                {link.external && <ExternalLink aria-hidden="true" className="size-3.5" />}
                              </a>
                            </Button>
                          ))}
                        </div>
                      )}
                      {item.href && (
                        <Button asChild variant="outline" size="sm" className="mt-3">
                          <a href={item.href} aria-label={`${item.hrefLabel ?? "Open"}: ${item.title}${item.external ? " (external, opens in a new tab)" : ""}`} target={item.external ? "_blank" : undefined} rel={item.external ? "noopener noreferrer" : undefined}>
                            {item.hrefLabel ?? "Open"}
                            {item.external && <ExternalLink aria-hidden="true" className="size-3.5" />}
                          </a>
                        </Button>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
        <section id="roadmap-detail" aria-labelledby="roadmap-detail-title" className="mt-20 scroll-mt-28">
          <p className="section-kicker">About</p>
          <h2 id="roadmap-detail-title" className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Roadmap</h2>
          <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
            Phase history as documented in the repository. A listed phase means its document exists; it does not mean real-device, clinical or independent scientific validation is complete. See Validation &amp; Limitations for open gates.
          </p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {roadmapPhases.map((phase) => (
              <li key={phase.phase} className="border border-border bg-surface p-4">
                <p className="text-xs font-medium text-primary">{phase.phase}</p>
                <a href={DOCS_URL + phase.doc} target="_blank" rel="noopener noreferrer" aria-label={`${phase.phase} ${phase.title} document (opens GitHub in a new tab)`} className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium hover:text-primary hover:underline">
                  {phase.title}
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
