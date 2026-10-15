import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
const sql = readFileSync("supabase/pending/20261017000000_p36_biomarker_review_foundation.sql", "utf8");
test("revoked submitter is allowed only on historical quarantine transition", () => {
  expect(sql).toContain("tg_op = 'INSERT' and (not v_submit.active or v_submit.role <> 'crew_self')");
  expect(sql).toContain("new.status <> 'quarantined'");
  expect(sql).toContain("quarantine requires revoked or disqualified submitter");
});
test("no privileged API, no approval transition, no browser grants", () => {
  expect(sql).toContain("old.status <> 'pending_review'");
  expect(sql).toContain("new.status <> 'quarantined'");
  expect(sql).toContain("new.reviewed_by_membership_id is null");
  expect(sql).not.toMatch(/grant\s+(insert|update|execute)/i);
  expect((sql.match(/force row level security/g) ?? []).length).toBe(3);
});
test("immutable scope and source survive revocation", () => {
  for (const field of ["mission_id","crew_member_id","source_fingerprint","observation_date","submitted_by_user_snapshot","created_at"]) {
    expect(sql).toContain(`new.${field} is distinct from old.${field}`);
  }
  expect(sql).toContain("historical reviewer/submitter provenance is immutable");
});
