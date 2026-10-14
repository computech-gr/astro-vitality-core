import p34 from "../../../data/validation/p34-real-device-acceptance.v1.json";
import p32 from "../../../data/validation/p32-independent-review-gates.v1.json";

export type ManualOutcome = "not_executed" | "pass_observed" | "fail_observed" | "blocked";
export type ManualResult = { outcome: ManualOutcome; evidenceRef: string; operatorNote: string };
export const P35_EXTRA_CASES = [
  { id: "P35-NASA-01", title: "OSDR public study and species separation", route: "/mission/nasa-evidence", procedure: "Retrieve OSD-48 from NASA; verify Mus musculus remains research-only, no crew binding, no clinical activation." },
  { id: "P35-NASA-02", title: "NASA outage and malformed input", route: "/mission/nasa-evidence", procedure: "Reject malformed accession, handle NASA errors without fabricated data or leaked details." },
  { id: "P35-LIVE-01", title: "Live readiness and encrypted write acknowledgement", route: "/mission/live", procedure: "Use real permitted hardware and Crew Self; verify physical sample freshness and confirmed write only after successful encrypted save." },
  { id: "P35-LIVE-02", title: "Persistence failure is visible", route: "/mission/live", procedure: "In a controlled non-production session simulate a save failure and verify clear unsaved warning; no false confirmation." },
  { id: "P35-ALERT-01", title: "Crew Self evidence access and isolation", route: "/mission/alerts", procedure: "With authorized Crew Self verify own mission evidence, mission switching, stale/empty/load failure; deny Operator and other missions." },
  { id: "P35-ALERT-02", title: "Clinical activation stays disabled", route: "/mission/alerts", procedure: "Verify descriptive means never become clinical thresholds or autonomous diagnosis; no operational alerts." },
  { id: "P35-SEC-01", title: "Independent RLS and role boundary review", route: "/mission/identity", procedure: "Independent reviewer tests cross-role/cross-mission server denials, token expiry, least privilege and audit trail." },
  { id: "P35-SEC-02", title: "Fresh security scan and disclosure review", route: "/mission/submission", procedure: "Record dated security scan, dependency findings, risk disposition and independent signoff; do not close FV-01-13 by UI action." },
  { id: "P35-UX-01", title: "Mobile submission viewport", route: "/mission/submission", procedure: "At 390px verify P20 evidence cards, long IDs and all acceptance controls do not overflow horizontally." },
] as const;

export function p35FinalAcceptanceCatalog() {
  return {
    schemaVersion: "p35-final-acceptance-handoff-v1" as const,
    source: "Repository checklist; not proof of execution",
    cases: [
      ...p34.cases.map(c => ({ id: c.id, title: c.title, route: c.route, procedure: c.procedure, category: "P34 physical" })),
      ...P35_EXTRA_CASES.map(c => ({ ...c, category: "P35 integration" })),
    ],
    science: p32.gates.map(g => ({ id: g.id, title: g.title, acceptance: g.acceptance, status: g.status })),
    finalSecurityGate: "BLOCKED" as const,
    fv0113: "OPEN" as const,
    p32: "PENDING" as const,
    p34: "PENDING" as const,
    clinicalActivation: false as const,
    finalAcceptance: false as const,
    nikolasP355: "AWAITING_THREE_DOCUMENTS" as const,
  };
}
export function p35FinalAcceptanceHandoff(results: Record<string, ManualResult>, exportedAt: string) {
  const catalog = p35FinalAcceptanceCatalog();
  return {
    ...catalog,
    exportedAt,
    evidenceScope: "Self-reported manual worksheet only; evidence references must be independently verified",
    cases: catalog.cases.map(c => ({ ...c, manual: results[c.id] ?? { outcome: "not_executed", evidenceRef: "", operatorNote: "" } })),
    // UI worksheets cannot grant approval or mutate authoritative ledgers.
    finalSecurityGate: "BLOCKED" as const,
    finalAcceptance: false as const,
    clinicalActivation: false as const,
  };
}
