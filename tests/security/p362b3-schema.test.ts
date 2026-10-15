import { readFileSync } from "node:fs";
import { test, expect } from "bun:test";
const sql = readFileSync(
  "supabase/pending/20261017000000_p36_biomarker_review_foundation.sql",
  "utf8",
);
test("P36.2B3 schema defaults to synthetic and requires provenance", () => {
  expect(sql).toContain("check (classification = 'synthetic')");
  expect(sql).toContain("source_fingerprint");
  expect(sql).toContain(
    "unique (mission_id, crew_member_id, source_fingerprint, observation_date)",
  );
  expect(sql).toContain("unique (batch_id, metric_id)");
});
test("P36.2B3 denies browser role access", () => {
  expect((sql.match(/force row level security/g) ?? []).length).toBe(2);
  expect(
    (sql.match(/as restrictive for all to public using \(false\) with check \(false\)/g) ?? [])
      .length,
  ).toBe(2);
  expect(sql).toContain("from public, anon, authenticated");
  expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)/i);
});
test("P36.2B3 does not expose an import or approval RPC", () => {
  expect(sql).not.toMatch(/create\s+(or replace\s+)?function/i);
  expect(sql).not.toContain("crew_health_record_index");
  expect(sql).not.toContain("mission_events");
});
