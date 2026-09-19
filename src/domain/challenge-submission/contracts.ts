export const SUBMISSION_EVIDENCE_STATUSES = ["ready", "pending_human", "pending_external", "blocked"] as const;
export type SubmissionEvidenceStatus = (typeof SUBMISSION_EVIDENCE_STATUSES)[number];

export interface SubmissionEvidence {
  id: string;
  title: string;
  critical: boolean;
  status: SubmissionEvidenceStatus;
  evidence: string;
}

export interface SubmissionSummary {
  ready: number;
  pendingHuman: number;
  pendingExternal: number;
  blocked: number;
  finalSubmissionReady: boolean;
}
