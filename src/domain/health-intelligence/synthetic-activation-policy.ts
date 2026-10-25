/** USD micro-units. Holds are never refunded, even after usage reconciliation. */
export const SYNTHETIC_ACTIVATION_POLICY = {
  model: "gpt-4.1-mini-2025-04-14",
  attempts: 10,
  budgetMicrousd: 1_000_000,
  holdMicrousd: 100_000,
  windowSeconds: 1800,
  maxRequestBytes: 4096,
  inputOverheadTokens: 2048,
  outputTokens: 1500,
  // Conservative ceilings, not advertised prices: USD 10 / million input AND output.
  inputMicrousdPerToken: 10,
  outputMicrousdPerToken: 10,
} as const;

export function boundedSyntheticPayload(payload: unknown): string {
  const body = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(body).byteLength;
  if (bytes > SYNTHETIC_ACTIVATION_POLICY.maxRequestBytes)
    throw new Error("Synthetic provider payload exceeds reserved input bounds");
  return body;
}

export function syntheticUsageMicrousd(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null;
  const value = usage as Record<string, unknown>;
  const input = value["input_tokens"], output = value["output_tokens"];
  if (typeof input !== "number" || typeof output !== "number" ||
      !Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input < 0 || output < 0 ||
      input > 6144 || output > 1500) return null;
  return input * 10 + output * 10;
}