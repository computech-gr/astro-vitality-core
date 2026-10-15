import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";

const sql = readFileSync("supabase/pending/20261017000000_p36_biomarker_review_foundation.sql", "utf8");

test("P36.2B4 records membership-based submitter and reviewer identities", () => {
  expect(sql).toContain("submitted_by_membership_id uuid not null references public.mission_memberships(id)");
  expect(sql).toContain("reviewed_by_membership_id uuid references public.mission_memberships(id)");
  expect(sql).not.toMatch(/references\s+auth\.users/i);
  expect(sql).toContain("reviewed_by_membership_id <> submitted_by_membership_id");
});

test("P36.2B4 retains synthetic-only and source integrity constraints", () => {
  expect(sql).toContain("check (classification = 'synthetic')");
  expect(sql).toContain("source_fingerprint");
  expect(sql).toContain("unique (mission_id, crew_member_id, source_fingerprint, observation_date)");
  expect(sql).toContain("unique (batch_id, metric_id)");
});

test("P36.2B4 stays deny-all without a client write or approval path", () => {
  expect((sql.match(/force row level security/g) ?? []).length).toBe(2);
  expect((sql.match(/as restrictive for all to public using \(false\) with check \(false\)/g) ?? []).length).toBe(2);
  expect(sql).toContain("from public, anon, authenticated");
  expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)/i);
  expect(sql).not.toMatch(/create\s+(or replace\s+)?function/i);
});
