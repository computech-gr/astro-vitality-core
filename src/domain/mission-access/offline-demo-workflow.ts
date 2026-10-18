import { buildSyntheticDemoDataset, type SyntheticDemoDataset } from "./synthetic-demo-dataset";
import { buildOfflineDemoReport } from "./offline-demo-report";

/** Isolated, deterministic, client-only demo; never a canonical medical import. */
export type DemoWorkflowStage = "identity" | "documents" | "devices" | "domains" | "report";
export const DEMO_WORKFLOW_STAGES: readonly { id: DemoWorkflowStage; title: string; route: string; description: string }[] = [
  { id: "identity", title: "Mission identity", route: "/mission/identity", description: "Review mission identity; no role elevation" },
  { id: "documents", title: "Document review", route: "/mission/documents", description: "Open existing role-gated document review" },
  { id: "devices", title: "Device center", route: "/mission/devices", description: "Inspect existing device evidence and readiness" },
  { id: "domains", title: "Four health domains", route: "/mission/intelligence", description: "Explore synthetic cross-domain observations" },
  { id: "report", title: "Offline intelligence report", route: "/mission/operations", description: "Generate an illustrative report without Cloud writes" },
];
export function buildIntegratedDemoBundle(missionCode: string) {
 const dataset = buildSyntheticDemoDataset(missionCode);
 const report = buildOfflineDemoReport(dataset);
 return {
  schema: "mitochondria.integrated-offline-demo.v1" as const,
  missionCode: dataset.missionCode,
  synthetic: true as const,
  localOnly: true as const,
  administratorAccessGranted: false as const,
  canonicalImportAuthorized: false as const,
  clinicalUseAuthorized: false as const,
  stages: DEMO_WORKFLOW_STAGES,
  dataset,
  report,
  governance: ["Synthetic-only offline rehearsal", "MISSION_TEST is never modified", "Backend administrator authorization requires separate owner-approved review", "Independent scientific and security gates remain open"],
 };
}
export function validateOfflineSyntheticDataset(input: unknown): { ok: true; dataset: SyntheticDemoDataset } | { ok: false; reason: string } {
 if (!input || typeof input !== "object" || Array.isArray(input)) return {ok:false,reason:"Invalid document"};
 const value = input as Record<string,unknown>;
 if (value["schema"] !== "mitochondria.synthetic-demo-dataset.v1" || value["synthetic"] !== true || value["exportOnly"] !== true || value["importAuthorized"] !== false || value["subjectId"] !== "FICTIONAL-CREW-01") return {ok:false,reason:"Not an authorized synthetic preview fixture"};
 if (typeof value["missionCode"] !== "string" || value["missionCode"].length > 100 || !Array.isArray(value["observations"]) || value["observations"].length !== 18) return {ok:false,reason:"Unexpected mission or observation count"};
 const expected = buildSyntheticDemoDataset(value["missionCode"]);
 if (JSON.stringify(value["observations"]) !== JSON.stringify(expected.observations)) return {ok:false,reason:"Fixture mismatch: only exact generated demo data are supported"};
 if (!Array.isArray(value["limitations"]) || JSON.stringify(value["limitations"]) !== JSON.stringify(expected.limitations)) return {ok:false,reason:"Required provenance/limitations missing"};
 return {ok:true,dataset:expected};
}
