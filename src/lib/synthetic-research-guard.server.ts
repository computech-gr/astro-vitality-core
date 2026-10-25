import type { GuardRpc } from './synthetic-activation-guard.server';
import { researchStatusSchema } from '@/domain/health-intelligence/synthetic-research-policy';
export async function researchStatus(rpc: GuardRpc) {
 const result = await rpc('medical_research_status', {});
 if (result.error) throw new Error('Research policy unavailable');
 return researchStatusSchema.parse(result.data);
}
export async function reserveResearch(rpc: GuardRpc, sha: string, nonce: string) {
 const result = await rpc('medical_research_reserve', {p_sha:sha,p_nonce:nonce});
 const data = result.data as {allowed?:boolean;attemptId?:string}|null;
 if (result.error || data?.allowed !== true || typeof data.attemptId !== 'string') throw new Error('Research budget, rolling quota or authorization denied');
 return data.attemptId;
}
export async function dispatchResearch(rpc: GuardRpc, attempt: string, sha: string, nonce: string) {
 const result = await rpc('medical_research_dispatch', {p_attempt:attempt,p_sha:sha,p_nonce:nonce});
 if (result.error || result.data !== true) throw new Error('Dispatch denied');
}
export async function finishResearch(rpc: GuardRpc, attempt: string, usage: number|null, tokens: {input:number;output:number}|null, outcome:string, request:string|null, nonce:string) {
 const result = await rpc('medical_research_finish', {p_attempt:attempt,p_usage:usage,p_input:tokens?.input??null,p_output:tokens?.output??null,p_outcome:outcome,p_request:request,p_nonce:nonce});
 if (result.error || result.data !== true) throw new Error('Reconciliation unavailable; hold retained');
}
