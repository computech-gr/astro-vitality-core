import { readFileSync } from "node:fs";
import { expect, test } from "bun:test";
const sql = readFileSync(
  "supabase/pending/20261017000000_p36_biomarker_review_foundation.sql",
  "utf8",
);
test("quarantine emits an atomic event tied to immutable reviewer and source", () => {
  expect(sql).toContain("create trigger p36_quarantine_audit after update");
  expect(sql).toContain("old.status = 'pending_review' and new.status = 'quarantined'");
  for (const field of [
    "reviewer_user_snapshot",
    "submitter_user_snapshot",
    "source_fingerprint",
    "decision_note",
    "mission_id",
  ])
    expect(sql).toContain(field);
  expect(sql).toContain("unique (batch_id, event_type)");
});
test("audit events are append-only and inaccessible to browsers", () => {
  expect(sql).toContain("create trigger p36_events_immutable before update or delete");
  expect(sql).toContain("P36 review decision evidence is append-only");
  expect(sql).toContain("alter table public.p36_biomarker_review_events force row level security");
  expect(sql).toContain("create policy p36_events_deny_all");
  expect(sql).toContain(
    "revoke all on public.p36_biomarker_review_events from public, anon, authenticated",
  );
  expect(sql).not.toMatch(/grant\s+(insert|update|execute)/i);
});
test("no appeal workflow, approval or client API is introduced", () => {
  expect(sql).toContain("Appeals and re-review are deliberately NOT implemented");
  expect(sql).toContain("new.status <> 'quarantined'");
  expect(sql).not.toMatch(
    /create\s+(or replace\s+)?function\s+public\.p36_(approve|import|appeal|submit)/i,
  );
});
