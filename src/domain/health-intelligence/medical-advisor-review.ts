/** Research-only AI drafting and human medical-advisor review contract. No external transmission. */
import type { HealthHistoryReport } from "./health-history-report";
export const MEDICAL_ADVISOR_NOTICE = "AI-generated draft: unverified. A qualified medical advisor must independently assess source data before any clinical use.";
export type AdvisorDecision = "draft" | "returned" | "approved";
export interface AdvisorReview {
  schema: "mitochondria.advisor-review.v1";
  id: string;
  missionId: string;
  crewMemberId: string;
  provenance: "real" | "synthetic";
  evidenceIds: string[];
  evidenceFingerprint: string;
  generatedAt: string;
  draftText: string;
  finalText: string;
  decision: AdvisorDecision;
  advisorIdentity: string | null;
  reviewedAt: string | null;
  rationale: string;
  source: "manual-ai-transfer" | "human-authored";
}
export function canonicalEvidence(report: HealthHistoryReport): string {
  return JSON.stringify({ missionId: report.missionId, crewMemberId: report.crewMemberId, provenance: report.provenance,
    observations: report.observations.map(o => [o.id,o.metricId,o.value,o.originalUnit,o.observedAt,o.reviewState,o.status,o.supersedesId]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))) });
}
/** A deterministic snapshot identifier, not a cryptographic signature. */
export function evidenceFingerprint(report: HealthHistoryReport): string {
  const s=canonicalEvidence(report); let h=2166136261;
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
  return `fnv1a32-${(h>>>0).toString(16).padStart(8,"0")}`;
}
export function createAdvisorDraft(report: HealthHistoryReport, text: string, source: AdvisorReview["source"]): AdvisorReview {
  if(!report.observations.length) throw new Error("No reviewer-accepted evidence available.");
  if(!text.trim()) throw new Error("Draft text is required.");
  if(text.length>12000) throw new Error("Draft exceeds 12,000 characters.");
  return {schema:"mitochondria.advisor-review.v1",id:crypto.randomUUID(),missionId:report.missionId,crewMemberId:report.crewMemberId,
    provenance:report.provenance,evidenceIds:report.observations.map(o=>o.id),evidenceFingerprint:evidenceFingerprint(report),
    generatedAt:new Date().toISOString(),draftText:text.trim(),finalText:text.trim(),decision:"draft",advisorIdentity:null,reviewedAt:null,rationale:"",source};
}
export function approveAdvisorDraft(draft: AdvisorReview, report: HealthHistoryReport, reviewer: string, finalText: string, rationale: string, authorizedMedicalRole: boolean): AdvisorReview {
  if(!authorizedMedicalRole) throw new Error("Ground-medical membership is required.");
  if(draft.decision!=="draft" && draft.decision!=="returned") throw new Error("This review is already finalized.");
  if(draft.missionId!==report.missionId || draft.crewMemberId!==report.crewMemberId || draft.provenance!==report.provenance || draft.evidenceFingerprint!==evidenceFingerprint(report)) throw new Error("Evidence changed. Generate a new draft.");
  if(!reviewer.trim() || !finalText.trim() || !rationale.trim()) throw new Error("Advisor identity, reviewed text and rationale are required.");
  return {...draft,finalText:finalText.trim(),decision:"approved",advisorIdentity:reviewer.trim(),reviewedAt:new Date().toISOString(),rationale:rationale.trim()};
}
export function isApprovedForReport(review: AdvisorReview | null, report: HealthHistoryReport): boolean {
  return Boolean(review && review.decision==="approved" && review.missionId===report.missionId && review.crewMemberId===report.crewMemberId && review.provenance===report.provenance && review.evidenceFingerprint===evidenceFingerprint(report));
}
export function buildAIDraftingPrompt(report: HealthHistoryReport): string {
  const safe = report.observations.map(o=>({id:o.id,domain:o.domain,metric:o.metricId,value:o.value,unit:o.originalUnit,time:o.observedAt}));
  return ["RESEARCH-ONLY DRAFT FOR INDEPENDENT MEDICAL ADVISOR REVIEW.","Do not diagnose, prescribe, invent clinical thresholds or assert causality. Distinguish observed facts, tentative hypotheses, and missing data. Cite observation IDs for every claim. Output English only. Do not treat reviewer acceptance as clinical validation.",`Data provenance: ${report.provenance}.`,"OBSERVATIONS:",JSON.stringify(safe,null,2)].join("\n\n");
}
