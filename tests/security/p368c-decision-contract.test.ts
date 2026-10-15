import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/pending/20261021000000_p368c_research_decisions.sql", "utf8");
const infra = readFileSync("src/infrastructure/p368b-ground-medical-review.ts", "utf8");
const ui = readFileSync("src/components/p368b-ground-medical-review.tsx", "utf8");

describe("P36.8C governed research decision contract", () => {
  it("governed migration 0010 is byte-identical to the owner-approved staged SQL", () => {
    expect(readFileSync("drizzle/migrations/0010_p368c_research_decisions.sql", "utf8")).toBe(sql);
  });
  it("allows only research-only decisions via a locked, independent, security-definer RPC", () => {
    expect(sql).toContain("p_decision not in ('accepted_for_research','rejected_for_research')");
    expect(sql).toMatch(/role = 'ground_medical' and active\s+order by id limit 1 for share/);
    expect(sql).toContain("for update");
    expect(sql).toContain("self-review is not permitted");
    expect(sql).toContain("security definer set search_path = public, pg_temp");
    expect(sql).toContain("from public, anon;");
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all) on (table )?public\.p36_/i);
    expect(sql).not.toMatch(/insert into public\.(mission_events|crew_health_record_index)/i);
  });
  it("keeps values immutable and evidence append-only with idempotency binding", () => {
    expect(sql).toContain("p36_items_no_delete");
    expect(sql).toContain("p36_events_one_per_batch unique (batch_id)");
    expect(sql).toContain("reused with a different decision");
    expect(sql).toContain("current_setting('p36.decision_rpc', true)");
    expect(sql).not.toMatch(/update public\.p36_biomarker_review_items/i);
  });
  it("audit metadata excludes note text and values", () => {
    const audit = sql.slice(sql.indexOf("'p36.review_decision'"), sql.indexOf("return jsonb_build_object('batch_id', v_batch.id"));
    expect(audit).not.toMatch(/v_note|measured_value|source_excerpt|source_filename/);
  });
  it("UI requires confirmation, single in-flight request and per-view idempotency key", () => {
    expect(infra).toContain("p368_decide_ground_medical_batch");
    expect(infra).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(ui).toContain("AlertDialog");
    expect(ui).toContain("inFlight.current");
    expect(ui).toContain("newDecisionIdempotencyKey()");
    expect(ui).toContain("no clinical meaning");
  });
});
