import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
const sql = readFileSync("supabase/pending/20261017000000_p36_biomarker_review_foundation.sql", "utf8");
test("revocation is not blocked by a review membership change trigger", () => {
  expect(sql).not.toMatch(/create trigger p36_review_membership_change_guard/i);
  expect(sql).not.toMatch(/after update of mission_id, crew_member_id, user_id, role, active/i);
});
test("immutable user snapshots are tied to current membership on write", () => {
  expect(sql).toContain("submitted_by_user_snapshot uuid not null");
  expect(sql).toContain("reviewed_by_user_snapshot uuid");
  expect(sql).toContain("new.submitted_by_user_snapshot is distinct from v_submit.user_id");
  expect(sql).toContain("new.reviewed_by_user_snapshot is distinct from v_review.user_id");
  expect(sql).toContain("historical reviewer/submitter provenance is immutable");
});
test("review requires active independent medical reviewer", () => {
  expect(sql).toContain("not v_review.active");
  expect(sql).toContain("v_review.user_id = v_submit.user_id");
  expect(sql).toContain("v_review.role <> 'ground_medical'");
});
test("no browser privileges or approval endpoint", () => {
  expect((sql.match(/force row level security/g) ?? []).length).toBe(3);
  expect(sql).toContain("revoke all on public.p36_biomarker_review_batches, public.p36_biomarker_review_items from public, anon, authenticated");
  expect(sql).not.toMatch(/grant\s+execute/i);
});
