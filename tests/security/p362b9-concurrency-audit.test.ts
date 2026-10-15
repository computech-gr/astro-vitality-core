import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/pending/20261017000000_p36_biomarker_review_foundation.sql",
  "utf8",
);

describe("P36.2B9 concurrent authorization and audit insert integrity", () => {
  it("locks both submitter and reviewer memberships for the decision", () => {
    expect(sql).toMatch(/where id = new\.submitted_by_membership_id for share;/i);
    expect(sql).toMatch(/where id = new\.reviewed_by_membership_id for share;/i);
  });
  it("rejects direct audit event insertion and validates against locked batch", () => {
    expect(sql).toMatch(
      /create or replace function public\.p36_validate_quarantine_event_insert\(\)/i,
    );
    expect(sql).toMatch(/pg_trigger_depth\(\) <> 2/i);
    expect(sql).toMatch(/where id = new\.batch_id for share;/i);
    expect(sql).toMatch(/v_batch\.status <> 'quarantined'/i);
    expect(sql).toMatch(/create trigger p36_events_insert_guard before insert/i);
  });
  it("preserves forced RLS and no browser grants", () => {
    for (const table of ["batches", "items", "events"]) {
      expect(sql).toContain(`force row level security;`);
      expect(sql).toContain(
        `p36_${table === "batches" ? "batches" : table === "items" ? "items" : "events"}_deny_all`,
      );
    }
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete|select|execute)\s+on[\s\S]*?to\s+(anon|authenticated)/i,
    );
  });
});
