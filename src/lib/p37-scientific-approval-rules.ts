/**
 * Browser-safe mirror of the P37 scientific approval prerequisites enforced by
 * p37_catalog_approve_v1. The Researcher's SCIENTIFIC APPROVE is the single,
 * final scientific decision; this module only explains which prerequisite is
 * missing so the button never sends a request the database would reject. The
 * database remains the authority (independence of the source verifier and of the
 * submitter is checked only there).
 */
import type { TriageAction } from "./p36-global-triage-rules";

export interface ApprovalReceipt {
  validationReference: string;
  canonicalMetricId: string;
  exactUnit: string;
  specimen: string;
  method: string;
  protocol: string;
}
export interface ApprovalCheckInput {
  canApprove: boolean;
  triageAction: TriageAction | null;
  alreadyApproved: boolean;
  submittedUnit: string;
  receipts: ApprovalReceipt[];
  selectedReference: string | null;
  canonicalName: string;
  domain: string | null;
  qualificationsConfirmed: boolean;
  evidenceReviewed: boolean;
}
export interface ApprovalCheck {
  id: string;
  label: string;
  pass: boolean;
  missing: string;
}

export const EXT_CANONICAL_ID = /^ext:[a-z0-9][a-z0-9-]{2,62}$/;
const DOMAINS = new Set(["bone", "immune", "cardiovascular", "behavioral"]);

export function scientificApprovalChecks(i: ApprovalCheckInput): ApprovalCheck[] {
  const r = i.receipts.find((x) => x.validationReference === i.selectedReference) ?? null;
  const name = i.canonicalName.trim();
  return [
    {
      id: "grant",
      label: "Scientific approver authorization",
      pass: i.canApprove,
      missing: "This account has no owner-granted scientific approver capability.",
    },
    {
      id: "not_approved",
      label: "No earlier scientific approval for this term",
      pass: !i.alreadyApproved,
      missing: "This term already has a final scientific approval; it is never approved twice.",
    },
    {
      id: "triage",
      label: "Accepted for scientific review (triage)",
      pass: i.triageAction === "ACCEPT_FOR_REVIEW",
      missing: i.triageAction
        ? `Latest triage decision is ${i.triageAction}; it must be Accept for Review.`
        : "The term has not been accepted for review yet.",
    },
    {
      id: "receipt",
      label: "Independent source-verification receipt",
      pass: !!r,
      missing: i.receipts.length
        ? "Choose the source-verification receipt this approval cites."
        : "No independently provisioned source-verification receipt exists for this term. Receipts are never created in the app.",
    },
    {
      id: "identity",
      label: "New canonical identity (ext:…)",
      pass: !!r && EXT_CANONICAL_ID.test(r.canonicalMetricId),
      missing: r
        ? `Receipt canonical ID ${r.canonicalMetricId} is not a new ext: identifier.`
        : "Requires a source-verification receipt.",
    },
    {
      id: "unit",
      label: "Validated unit equals submitted unit (no conversion)",
      pass: !!r && r.exactUnit.trim() === i.submittedUnit.trim(),
      missing: r
        ? `Validated unit "${r.exactUnit}" differs from submitted unit "${i.submittedUnit}".`
        : "Requires a source-verification receipt.",
    },
    {
      id: "specimen_method",
      label: "Specimen, method and protocol validated",
      pass: !!r && !!r.specimen.trim() && !!r.method.trim() && !!r.protocol.trim(),
      missing: r
        ? "The receipt is missing a specimen, method or protocol."
        : "Requires a source-verification receipt.",
    },
    {
      id: "name",
      label: "Canonical name (3–120 characters)",
      pass: name.length >= 3 && name.length <= 120,
      missing: "Enter the canonical biomarker name.",
    },
    {
      id: "domain",
      label: "Scientific domain",
      pass: !!i.domain && DOMAINS.has(i.domain),
      missing: "Choose the scientific domain.",
    },
    {
      id: "evidence",
      label: "Scientific evidence and references reviewed",
      pass: i.evidenceReviewed,
      missing: "Confirm you reviewed the evidence and references.",
    },
    {
      id: "qualifications",
      label: "Reviewer qualifications confirmed",
      pass: i.qualificationsConfirmed,
      missing: "Confirm your reviewer qualifications for this decision.",
    },
  ];
}

export function canScientificallyApprove(i: ApprovalCheckInput): boolean {
  return scientificApprovalChecks(i).every((c) => c.pass);
}
