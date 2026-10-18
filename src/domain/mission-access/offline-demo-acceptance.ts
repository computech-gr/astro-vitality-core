import { buildIntegratedDemoBundle, validateOfflineSyntheticDataset } from "./offline-demo-workflow";

export type OfflineAcceptanceResult =
  | { ok: true; kind: "integrated_bundle" | "synthetic_dataset"; missionCode: string; observationCount: number }
  | { ok: false; reason: string };

/** Verifies exact, locally generated fixtures. No import, network, privileges or clinical approval. */
export function inspectOfflineDemoArtifact(input: unknown, expectedMissionCode: string): OfflineAcceptanceResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, reason: "Invalid document" };
  const value = input as Record<string, unknown>;
  if (value["missionCode"] !== expectedMissionCode.trim()) return { ok: false, reason: "Mission mismatch: artifact belongs to another mission" };
  if (value["schema"] === "mitochondria.synthetic-demo-dataset.v1") {
    const checked = validateOfflineSyntheticDataset(input);
    return checked.ok
      ? { ok: true, kind: "synthetic_dataset", missionCode: checked.dataset.missionCode, observationCount: checked.dataset.observations.length }
      : { ok: false, reason: checked.reason };
  }
  if (value["schema"] !== "mitochondria.integrated-offline-demo.v1") return { ok: false, reason: "Unsupported artifact schema" };
  const expected = buildIntegratedDemoBundle(expectedMissionCode);
  // Reject missing, added, altered or reordered content; all fields are deterministic.
  if (JSON.stringify(value) !== JSON.stringify(expected)) return { ok: false, reason: "Integrated bundle mismatch: expected exact synthetic demo export" };
  return { ok: true, kind: "integrated_bundle", missionCode: expected.missionCode, observationCount: expected.dataset.observations.length };
}

export type DemoAcceptanceGate = { id: string; label: string; status: "verified_local" | "requires_owner_approval" | "requires_independent_acceptance"; detail: string };
export function getDemoAcceptanceGates(): readonly DemoAcceptanceGate[] {
  return [
    { id: "offline", label: "Offline synthetic demonstration", status: "verified_local", detail: "Deterministic generated fixture; local exports only. Browser and CI acceptance remain separate." },
    { id: "mission", label: "Isolated synthetic demo mission", status: "requires_owner_approval", detail: "Must be provisioned with governed Cloud writes; never use MISSION_TEST for mutations." },
    { id: "admin", label: "Administrator backend authorization", status: "requires_owner_approval", detail: "Requires explicit server-side authorization and RLS review; Mission Operator does not imply Administrator." },
    { id: "pipeline", label: "Canonical document/device data integration", status: "requires_independent_acceptance", detail: "Existing ingestion, provenance, unit and role controls need integrated end-to-end evidence." },
    { id: "medical", label: "Independent Ground Medical acceptance", status: "requires_independent_acceptance", detail: "Independent reviewer and governed decision workflow must be tested without impersonation." },
    { id: "science", label: "Scientific and security gates", status: "requires_independent_acceptance", detail: "Nikolas scientific review and standing FV/P32/P34/security gates remain open." },
  ];
}
