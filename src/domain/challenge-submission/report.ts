import type { SubmissionEvidence, SubmissionSummary } from "./contracts";

export function summarizeSubmissionEvidence(evidence: readonly SubmissionEvidence[]): SubmissionSummary {
  const summary: SubmissionSummary = {
    ready: 0,
    pendingHuman: 0,
    pendingExternal: 0,
    blocked: 0,
    finalSubmissionReady: false,
  };
  for (const item of evidence) {
    if (item.status === "ready") summary.ready += 1;
    if (item.status === "pending_human") summary.pendingHuman += 1;
    if (item.status === "pending_external") summary.pendingExternal += 1;
    if (item.status === "blocked") summary.blocked += 1;
  }
  summary.finalSubmissionReady = evidence.every((item) => !item.critical || item.status === "ready");
  return summary;
}
