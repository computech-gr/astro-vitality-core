import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/pending/20261017000000_p36_biomarker_review_foundation.sql", "utf8");

describe("P36.2B10 database-generated audit receipts", () => {
  it("generates decision correlation and server receipt only after locked membership checks", () => {
    expect(sql).toContain("where id = new.reviewed_by_membership_id for share;");
    expect(sql).toContain("new.decision_request_id := gen_random_uuid()");
    expect(sql).toContain("new.decision_received_at := clock_timestamp()");
    expect(sql).toContain("new.decision_authorization_basis := 'locked_independent_ground_medical_membership'");
    expect(sql).toContain("pending submissions cannot carry decision receipts");
  });
  it("copies and cross-checks the receipt atomically with the event", () => {
    expect(sql).toContain("new.decision_request_id, new.decision_received_at");
    expect(sql).toContain("new.decision_request_id is distinct from v_batch.decision_request_id");
    expect(sql).toContain("new.server_received_at is distinct from v_batch.decision_received_at");
    expect(sql).toContain("new.authorization_basis is distinct from v_batch.decision_authorization_basis");
    expect(sql).toContain("decision_request_id uuid not null unique");
  });
  it("keeps browser access disabled and documents owner limitation", () => {
    expect(sql).toContain("force row level security;");
    expect(sql).toContain("p36_events_deny_all");
    expect(sql).toContain("NOT an HTTP request ID or cryptographic attestation");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|select|execute)\s+on[\s\S]*?to\s+(anon|authenticated)/i);
  });
});
