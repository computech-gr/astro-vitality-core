import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const foundation = readFileSync("drizzle/migrations/0006_p36_biomarker_review_foundation.sql", "utf8");
const submission = readFileSync("drizzle/migrations/0007_p364_synthetic_submission.sql", "utf8");
const readOnly = readFileSync("drizzle/migrations/0009_p368a_ground_medical_readonly.sql", "utf8");

describe("P36.8C preflight: existing restrictions must be explicitly redesigned", () => {
  it("does not mistake status enum for permission to approve or reject", () => {
    expect(foundation).toContain("new.status <> 'quarantined'");
    expect(foundation).toContain("old.status <> 'pending_review'");
    expect(foundation).toContain("only pending-to-quarantined is staged");
  });
  it("requires a separately governed decision-event extension", () => {
    expect(foundation).toContain("event_type text not null check (event_type = 'quarantined')");
    expect(foundation).toContain("p36_reject_review_event_mutation");
  });
  it("preserves immutable submitted values and read-only P36.8A", () => {
    expect(submission).toContain("p36_items_immutable");
    expect(readOnly).toContain("b.status='pending_review'");
    expect(readOnly).toContain("b.submitted_by_user_snapshot <> auth.uid()");
  });
});
