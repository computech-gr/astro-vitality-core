import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const ui = readFileSync("src/components/mission-document-review-workbench.tsx", "utf8");
const server = readFileSync("src/lib/p36-cloud-submission.functions.ts", "utf8");
const sql = readFileSync(
  "supabase/pending/20261019000000_p365_synthetic_review_history.sql",
  "utf8",
);
describe("P36.5 select all and crew-scoped saved reviews", () => {
  it("resets human confirmation when toggling all", () => {
    expect(ui).toContain("setAllReviewed(!allSelected)");
    expect(ui).toContain("setReviewerConfirmed(false)");
    expect(ui).toContain("Deselect All");
  });
  it("does not misrepresent save or unlock while cloud is disabled", () => {
    expect(ui).toContain("Save reviewed synthetic measurements to Cloud");
    expect(ui).toContain("Cloud history pending owner-approved activation");
    expect(server).toContain("P36_CLOUD_SUBMISSION_ENABLED");
  });
  it("enforces per-user crew scope and metadata-only history", () => {
    expect(sql).toContain("mm.user_id = auth.uid()");
    expect(sql).toContain("mm.role = 'crew_self'");
    expect(sql).toContain("b.submitted_by_user_snapshot = auth.uid()");
    expect(sql).toContain("limit 100");
    expect(sql).toContain("revoke all");
    expect(sql).not.toContain("source_excerpt");
  });
});
