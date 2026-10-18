/** Explicitly authorized demo-mission creation; no privilege escalation. */
export const DEMO_MISSION_CODE = "MITO_DEMO_2026";
export const DEMO_MISSION_NAME = "MITOCHONDRIA 2026 - Synthetic Demonstration";
export const DEMO_APPROVAL_PHRASE = "CREATE MITO_DEMO_2026";

export function evaluateDemoMissionActivation(input: {
  signedIn: boolean;
  hasOperatorMembership: boolean;
  approval: string;
  confirmed: boolean;
  existingMissionCodes: readonly string[];
}): { allowed: boolean; reason: string } {
  if (!input.signedIn) return { allowed: false, reason: "Sign-in required" };
  if (!input.hasOperatorMembership) return { allowed: false, reason: "Active Mission Operator membership required" };
  if (input.existingMissionCodes.includes(DEMO_MISSION_CODE)) return { allowed: false, reason: "Dedicated demo mission already exists" };
  if (!input.confirmed || input.approval !== DEMO_APPROVAL_PHRASE) return { allowed: false, reason: "Explicit owner confirmation required" };
  return { allowed: true, reason: "Ready for backend authorization check" };
}
