import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/pending/20261020000000_p368a_ground_medical_readonly.sql", "utf8");
describe("P36.8A Ground Medical read-only contract", () => {
  it("requires independent active mission-scoped Ground Medical membership", () => {
    expect(sql.match(/mm\.role\s*=\s*'ground_medical'/g)).toHaveLength(2);
    expect(sql.match(/mm\.active\s*=\s*true/g)).toHaveLength(2);
    expect(sql.match(/mm\.mission_id\s*=\s*p_mission_id/g)).toHaveLength(2);
    expect(sql.match(/submitted_by_user_snapshot\s*<>\s*auth\.uid\(\)/g)).toHaveLength(2);
    expect(sql.match(/for share/g)).toHaveLength(2);
  });
  it("does not add table access or mutations", () => {
    expect(sql).not.toMatch(/\b(insert into|update public\.|delete from|grant (select|insert|update|delete) on table)\b/i);
    expect(sql).toContain("b.status='pending_review'");
    expect(sql).toContain("b.classification='synthetic'");
    expect(sql).toContain("limit 100");
    expect(sql).toContain("revoke all on function public.p368_get_ground_medical_batch(text,uuid) from public, anon");
  });
});
