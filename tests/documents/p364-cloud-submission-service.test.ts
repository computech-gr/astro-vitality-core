import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fn = readFileSync("src/lib/p36-cloud-submission.functions.ts", "utf8");
const sql = readFileSync("supabase/pending/20261018000000_p364_synthetic_submission.sql", "utf8");
const ui = readFileSync("src/components/mission-document-review-workbench.tsx", "utf8");

describe("P36.4 synthetic cloud submission service (staged)", () => {
  it("runs server-side as the signed-in user, never with the service role", () => {
    expect(fn).toContain(".middleware([attachSessionBearer, requireSupabaseAuth])");
    expect(fn).not.toContain("client.server");
    expect(fn).not.toContain("SERVICE_ROLE");
    expect(fn).toContain('process.env["P36_CLOUD_SUBMISSION_ENABLED"] !== "true"');
  });
  it("never sends original documents from the browser", () => {
    expect(ui).not.toMatch(/FormData|storage\.from\(|supabase\.from\(/);
    expect(ui).toContain('crypto.subtle.digest("SHA-256", await file.arrayBuffer())');
  });
  it("derives identity from auth.uid() and requires active crew_self scope", () => {
    expect(sql).toContain("v_uid uuid := auth.uid();");
    expect(sql).toContain("and user_id = v_uid and role = 'crew_self' and active");
    expect(sql).toContain("for share;");
    expect(sql).not.toMatch(/p_user_id/);
  });
  it("enforces exact catalog, idempotency, duplicates and audit in one transaction", () => {
    expect(sql).toContain("c.metric_id = v_item->>'metricId' and c.unit = v_item->>'unit'");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("P36 duplicate synthetic submission for this source and date");
    expect(sql).toContain("'p36_synthetic_batch_submitted'");
    expect((sql.match(/\('cv-|\('bh-|\('[a-z]+-\d+',/g) ?? []).length).toBeGreaterThanOrEqual(96);
  });
  it("grants only function execute to authenticated; no table grants or approvals", () => {
    expect(sql).toMatch(/grant execute on function public\.p36_submit_synthetic_review_batch\([^)]*\) to authenticated;/);
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.p36/i);
    expect(sql).not.toMatch(/status\s*=\s*'approved'/);
  });
});
