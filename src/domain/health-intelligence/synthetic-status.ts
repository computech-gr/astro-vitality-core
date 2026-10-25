/** Presentation diagnostics only; never grants permission or changes admission. */
export type SyntheticStatusFailure = "access_denied" | "service_failure" | "invalid_response";

export function classifySyntheticStatusError(error: unknown): SyntheticStatusFailure {
  if (typeof error !== "object" || error === null) return "service_failure";
  const value = error as Record<string, unknown>;
  if (
    value["code"] === "42501" ||
    value["code"] === "PGRST301" ||
    value["code"] === "PGRST302" ||
    (value["code"] === "P0001" && value["message"] === "scope denied")
  ) return "access_denied";
  return "service_failure";
}

export function syntheticStatusFailure(error: unknown, valid: boolean): SyntheticStatusFailure | null {
  if (error) return classifySyntheticStatusError(error);
  return valid ? null : "invalid_response";
}

export function operatorDeploymentRevision(value: string | undefined): string | null {
  return value && /^[a-f0-9]{40}$/.test(value) ? value : null;
}

export const SYNTHETIC_STATUS_MESSAGES: Record<SyntheticStatusFailure, string> = {
  access_denied: "Status access denied: this account is not authorized for the requested scope.",
  service_failure: "Status service unavailable. Authorization cannot be confirmed.",
  invalid_response: "Status response could not be validated. Authorization cannot be confirmed.",
};