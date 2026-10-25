import { z } from 'zod';
export const RESEARCH_POLICY_VERSION = 'synthetic-research-v2';
export const OPENAI_BILLING_URL = 'https://platform.openai.com/settings/organization/billing/overview';
export const researchStatusSchema = z.object({
 version: z.literal(RESEARCH_POLICY_VERSION), owner: z.boolean(), enabled: z.boolean(), eligible: z.boolean(),
 attempts: z.number().int().nonnegative(), heldMicrousd: z.number().int().nonnegative(), budgetMicrousd: z.number().int().nonnegative(), remainingMicrousd: z.number().int().nonnegative(),
 recordedMicrousd: z.number().int().nonnegative().nullable(), synchronizedAt: z.string().nullable(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(), failures: z.number().int().nonnegative(), rollingLimit: z.number().int().nullable(), rollingSeconds: z.number().int().nullable(), providerProject: z.string().nullable(), syncRequired: z.boolean().nullable(), activeAttempt: z.string().nullable(), revision: z.number().int().nullable(), month: z.string(),
}).strict();
export type ResearchStatus = z.infer<typeof researchStatusSchema>;
export function budgetAlerts(budget: number, remaining: number): number[] {
 if (budget <= 0) return [100];
 const used = (budget - remaining) / budget * 100;
 return [50,80,90,100].filter(level => used >= level);
}
export type ProviderFailure = 'credit_exhausted' | 'spend_limit' | 'rate_limit' | 'provider_outage';
export function classifyProviderFailure(status: number, code: unknown): ProviderFailure {
 if (code === 'credit_balance_exhausted' || code === 'insufficient_quota') return 'credit_exhausted';
 if (typeof code === 'string' && ['organization_usage_limit_exceeded','organization_spend_limit_exceeded','project_spend_limit_exceeded','billing_hard_limit_reached'].includes(code)) return 'spend_limit';
 return status === 429 ? 'rate_limit' : 'provider_outage';
}
export const providerFailureMessages: Record<ProviderFailure,string> = {
 credit_exhausted: 'OpenAI credits or billing quota exhausted. Check OpenAI Billing; no automatic retry.',
 spend_limit: 'OpenAI spending limit reached. Check provider limits; no automatic retry.',
 rate_limit: 'OpenAI rate limit reached. Request not retried.',
 provider_outage: 'OpenAI unavailable or request outcome unknown. Research AI paused pending owner review.',
};
