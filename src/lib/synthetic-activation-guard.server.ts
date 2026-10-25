import { SYNTHETIC_ACTIVATION_POLICY } from "@/domain/health-intelligence/synthetic-activation-policy";

export type GuardRpc = (name: string, args: Record<string, unknown>) =>
  Promise<{ data: unknown; error: unknown }>;

export async function reserveSyntheticAttempt(rpc: GuardRpc, sha: string): Promise<string> {
  const result = await rpc("medical_demo_reserve", { p_sha: sha });
  const data = result.data as { allowed?: boolean; attemptId?: string } | null;
  if (result.error || data?.allowed !== true || typeof data.attemptId !== "string")
    throw new Error("Synthetic authorization, concurrency, quota or budget denied");
  return data.attemptId;
}

export async function permitSyntheticTransmission(rpc: GuardRpc, attempt: string, sha: string) {
  const result = await rpc("medical_demo_dispatch", { p_attempt: attempt, p_sha: sha });
  if (result.error || result.data !== true)
    throw new Error("Synthetic authorization expired, disabled or already dispatched");
}

export async function finishSyntheticAttempt(rpc: GuardRpc, attempt: string, usage: number | null) {
  const result = await rpc("medical_demo_finish", { p_attempt: attempt, p_usage: usage });
  if (result.error || result.data !== true)
    throw new Error("Synthetic completion could not be confirmed; hold retained");
}

export const syntheticProviderModel = SYNTHETIC_ACTIVATION_POLICY.model;