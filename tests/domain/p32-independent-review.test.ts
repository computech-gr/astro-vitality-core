import { describe, expect, it } from "bun:test";
import { P32_REVIEW_LEDGER, scientificReviewReadiness, validateIndependentReviewLedger } from "../../src/domain/validation/independent-review";

describe("P32 independent scientific review", () => {
  it("fails closed with all eight gates pending", () => { const result = scientificReviewReadiness(); expect(result.total).toBe(8); expect(result.pending).toBe(8); expect(result.approved).toBe(false); expect(result.errors).toEqual([]); });
  it("does not present any reviewer or signed evidence", () => { for (const gate of P32_REVIEW_LEDGER.gates) { expect(gate.reviewer).toBeNull(); expect(gate.signedEvidence).toBeNull(); expect(gate.reviewedAt).toBeNull(); } });
  it("rejects forged scientific approval flags", () => { const forged = {...P32_REVIEW_LEDGER, independentApproval:true}; expect(validateIndependentReviewLedger(forged)).toContain("Unverified scientific approval flag"); });
  it("rejects forged signoff evidence", () => { const forged = {...P32_REVIEW_LEDGER, gates: P32_REVIEW_LEDGER.gates.map((g,i)=>i===0?{...g, reviewer:"unknown"}:g)}; expect(validateIndependentReviewLedger(forged).some(x=>x.includes("Unsupported independent approval"))).toBe(true); });
});
