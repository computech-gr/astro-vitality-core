import { describe, expect, test } from "bun:test";
import { canScientificallyApprove, scientificApprovalChecks, type ApprovalCheckInput } from "../../src/lib/p37-scientific-approval-rules";

const receipt = { validationReference: "SYN-VAL-0001", canonicalMetricId: "ext:synthetic-marker-x", exactUnit: "pg/mL", specimen: "serum", method: "ELISA", protocol: "SYN-PROTO" };
const ready: ApprovalCheckInput = {
  canApprove: true, triageAction: "ACCEPT_FOR_REVIEW", alreadyApproved: false, submittedUnit: "pg/mL", receipts: [receipt],
  selectedReference: "SYN-VAL-0001", canonicalName: "Synthetic Marker X", domain: "immune", qualificationsConfirmed: true, evidenceReviewed: true,
};
const missing = (i: ApprovalCheckInput) => scientificApprovalChecks(i).filter((c) => !c.pass).map((c) => c.id);

describe("P37 single final scientific approval prerequisites", () => {
  test("one authorized Researcher can approve when every prerequisite is met (no second reviewer)", () => {
    expect(canScientificallyApprove(ready)).toBe(true);
    expect(missing(ready)).toEqual([]);
  });
  test("triage acceptance alone is not scientific approval permission", () => {
    expect(missing({ ...ready, canApprove: false })).toEqual(["grant"]);
  });
  test("term must be accepted for review", () => {
    expect(missing({ ...ready, triageAction: null })).toEqual(["triage"]);
    expect(missing({ ...ready, triageAction: "REQUEST_MORE_EVIDENCE" })).toEqual(["triage"]);
  });
  test("no source-verification receipt blocks approval with an explicit reason", () => {
    const i = { ...ready, receipts: [], selectedReference: null };
    expect(canScientificallyApprove(i)).toBe(false);
    const c = scientificApprovalChecks(i).find((x) => x.id === "receipt")!;
    expect(c.missing).toContain("No independently provisioned source-verification receipt");
  });
  test("unit mismatch is rejected, never converted", () => {
    expect(missing({ ...ready, submittedUnit: "ng/mL" })).toEqual(["unit"]);
  });
  test("base-catalog style identifiers are not new entries", () => {
    expect(missing({ ...ready, receipts: [{ ...receipt, canonicalMetricId: "cv-001" }] })).toEqual(["identity"]);
  });
  test("missing specimen or method blocks approval", () => {
    expect(missing({ ...ready, receipts: [{ ...receipt, method: " " }] })).toEqual(["specimen_method"]);
    expect(missing({ ...ready, receipts: [{ ...receipt, specimen: "" }] })).toEqual(["specimen_method"]);
  });
  test("qualifications and evidence review must be confirmed", () => {
    expect(missing({ ...ready, qualificationsConfirmed: false, evidenceReviewed: false })).toEqual(["evidence", "qualifications"]);
  });
  test("an approved term is never approved twice", () => {
    expect(missing({ ...ready, alreadyApproved: true })).toEqual(["not_approved"]);
  });
});
