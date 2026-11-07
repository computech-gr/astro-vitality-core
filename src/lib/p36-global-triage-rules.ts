/** Browser-safe P36 triage rules shared by the review screen and the server core. */
export const TRIAGE_ACTIONS = ["ACCEPT_FOR_REVIEW", "REQUEST_MORE_EVIDENCE", "REJECT_REVIEW_REQUEST"] as const;
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];
export const EVIDENCE_REQUIREMENTS = ["identity", "unit", "method", "specimen", "protocol", "source_validation", "other"] as const;
export type EvidenceRequirement = (typeof EVIDENCE_REQUIREMENTS)[number];

export interface TriageEvent {
  eventId: string;
  submissionId: string;
  termId: string;
  action: TriageAction;
  reason: string | null;
  evidenceRequirements: EvidenceRequirement[];
  previousEventId: string | null;
  recordedAt: string;
  recordedByCaller: boolean;
}

/** Client-side mirror of the database rules, so obviously invalid requests never leave the browser. */
export function triageInputProblem(i: { action: TriageAction; reason: string | null; evidenceRequirements: EvidenceRequirement[] }): string | null {
  const reason = i.reason?.trim() ?? "";
  if (i.action !== "ACCEPT_FOR_REVIEW" && !reason) return "A documented reason is required.";
  if (reason && (reason.length < 8 || reason.length > 2000)) return "The reason must be 8 to 2000 characters.";
  if (i.action === "REQUEST_MORE_EVIDENCE" && !i.evidenceRequirements.length) return "Name at least one missing evidence requirement.";
  if (i.action !== "REQUEST_MORE_EVIDENCE" && i.evidenceRequirements.length) return "Evidence requirements apply only to evidence requests.";
  return null;
}

/** Latest event per submitted term, following the append-only chain. */
export function latestTriageByTerm(events: TriageEvent[]): Map<string, TriageEvent> {
  const superseded = new Set(events.map((e) => e.previousEventId).filter((v): v is string => !!v));
  const out = new Map<string, TriageEvent>();
  for (const e of events) if (!superseded.has(e.eventId)) out.set(`${e.submissionId}:${e.termId}`, e);
  return out;
}
