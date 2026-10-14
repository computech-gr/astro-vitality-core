import p34 from "../../../data/validation/p34-real-device-acceptance.v1.json";
import p32 from "../../../data/validation/p32-independent-review-gates.v1.json";

/** Repository evidence only. This is not a runtime sensor test, security audit or release approval. */
export const P354_PATHWAYS = [
  { id: "nasa", title: "P35.1 · NASA public research", route: "/mission/nasa-evidence", expected: "Search public study, inspect organism and research-only provenance; never bind samples to crew", boundary: "Public research metadata only; not a crew biometric feed" },
  { id: "live", title: "P35.2 · Live sensor & persistence", route: "/mission/live", expected: "Verify authenticated membership, permission, physical sample, encrypted write acknowledgement and offline failure", boundary: "LOCAL FALLBACK is not authenticated crew; visible sample is not proof of saved data" },
  { id: "alerts", title: "P35.3 · Crew evidence review", route: "/mission/alerts", expected: "Use authorized Crew Self to check mission isolation, empty, stale and failed-load states", boundary: "Read-only; descriptive mean is not an approved baseline; operational alerts disabled" },
  { id: "offline", title: "Offline mission continuity", route: "/mission/offline", expected: "Exercise disconnected recording, reconnect and governed synchronization with no cross-mission leakage", boundary: "Pending sync is not confirmed server persistence" },
] as const;

export function p354IntegrationReadiness() {
  const physical = p34.cases.map(c => ({ id: c.id, title: c.title, route: c.route, status: c.status, evidenceRecorded: Boolean(c.evidence) }));
  const scientific = p32.gates.map(g => ({ id: g.id, title: g.title, status: g.status }));
  return {
    schemaVersion: "p35.4-integration-readiness-v1" as const,
    basis: "repository evidence ledgers only; not live production status",
    generatedAt: null,
    pathways: P354_PATHWAYS,
    physical,
    scientific,
    physicalAcceptance: "PENDING" as const,
    independentScientificReview: "PENDING" as const,
    finalSecurityGate: "BLOCKED" as const,
    fv0113: "OPEN" as const,
    clinicalActivation: false as const,
    finalAcceptance: false as const,
    nextStep: "Execute documented end-to-end and human-operated physical acceptance after P35.4 integration; P35.5 scientific documents follow later",
  };
}
