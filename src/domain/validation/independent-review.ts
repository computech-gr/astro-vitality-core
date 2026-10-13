import ledger from "../../../data/validation/p32-independent-review-gates.v1.json";

export const P32_REVIEW_LEDGER = ledger;
export type ReviewGate = (typeof ledger.gates)[number];
export function validateIndependentReviewLedger(input: typeof ledger = ledger): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  if (input.independentApproval || input.clinicalValidation) errors.push("Unverified scientific approval flag");
  for (const gate of input.gates) {
    if (!gate.id || ids.has(gate.id)) errors.push(`Duplicate review gate: ${gate.id}`);
    ids.add(gate.id);
    if (gate.status !== "pending_independent_review") errors.push(`Unverified status: ${gate.id}`);
    if (gate.reviewer || gate.reviewedAt || gate.signedEvidence) errors.push(`Unsupported independent approval evidence: ${gate.id}`);
    if (!gate.sourceFile.startsWith("docs/")) errors.push(`Missing repository evidence path: ${gate.id}`);
  }
  if (input.gates.length !== 8) errors.push("Unexpected independent review gate count");
  return errors;
}
export function scientificReviewReadiness(input: typeof ledger = ledger) {
  const errors = validateIndependentReviewLedger(input);
  return { total: input.gates.length, pending: input.gates.filter(g => g.status === "pending_independent_review").length, approved: false, errors };
}
