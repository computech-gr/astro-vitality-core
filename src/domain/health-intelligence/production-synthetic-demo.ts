/** Explicit production scope; never derived from local observations or browser flags. */
export const PRODUCTION_SYNTHETIC_MISSION = "mission-9d8ce8f3e5554509a0885461f9ad2e1c";
export const PRODUCTION_SYNTHETIC_CREW = "crew-9806e7e611f44dc38dac5e23f7740f1a";
export const SYNTHETIC_DEMO_QUESTIONS = [
  "What values were recorded in the two synthetic heart-rate observations?",
  "What was recorded in synthetic-v3-hr-001?",
  "What was recorded in synthetic-v3-hr-002?",
] as const;
export function syntheticDemoMode(flags: {
  production?: string;
  isolated?: string;
  environment?: string;
}): "production-synthetic" | "disposable" | "disabled" {
  if (flags.production === "true") return "production-synthetic";
  if (flags.isolated === "true" && flags.environment === "disposable") return "disposable";
  return "disabled";
}
export function assertProductionSyntheticRequest(
  mission: unknown,
  crew: unknown,
  question: string,
) {
  if (mission !== PRODUCTION_SYNTHETIC_MISSION || crew !== PRODUCTION_SYNTHETIC_CREW)
    throw new Error("Production synthetic scope mismatch");
  if (!SYNTHETIC_DEMO_QUESTIONS.some((q) => q === question))
    throw new Error("Only predefined synthetic evidence questions are permitted");
}
