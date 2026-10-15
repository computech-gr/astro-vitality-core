import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
const sql = readFileSync("supabase/pending/20261017000000_p36_biomarker_review_foundation.sql", "utf8");
test("P36.2B5 enforces submitter scope and crew_self", () => {
  expect(sql).toContain("v_submit.role <> 'crew_self'");
  expect(sql).toContain("v_submit.mission_id is distinct from new.mission_id");
  expect(sql).toContain("v_submit.crew_member_id is distinct from new.crew_member_id");
  expect(sql).toContain("not v_submit.active");
});
test("P36.2B5 enforces different real user and active ground_medical in same mission", () => {
  expect(sql).toContain("v_review.user_id = v_submit.user_id");
  expect(sql).toContain("v_review.role <> 'ground_medical'");
  expect(sql).toContain("v_review.mission_id is distinct from new.mission_id");
  expect(sql).toContain("not v_review.active");
});
test("P36.2B6 does not block emergency membership deactivation", () => {
  expect(sql).not.toContain("create trigger p36_review_membership_change_guard");
  expect(sql).not.toContain("p36_guard_membership_changes");
});
test("P36.2B5 retains deny-all and exposes no write or approval RPC", () => {
  expect((sql.match(/force row level security/g) ?? []).length).toBe(3);
  expect((sql.match(/as restrictive for all to public using \(false\) with check \(false\)/g) ?? []).length).toBe(2);
  expect(sql).not.toMatch(/grant\s+execute/i);
  expect(sql).not.toMatch(/create\s+(or replace\s+)?function\s+public\.(?:ingest|approve|submit)/i);
});
