import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_MEMBERSHIP_KEY,
  clearActiveSelection,
  readActiveSelection,
  shouldClearSelection,
  writeActiveSelection,
} from "../../src/infrastructure/mission-selection-storage";
import { classifyMissionSyncError } from "../../src/infrastructure/ground-research/supabase-transport";

const SQL_PATH = join(process.cwd(), "supabase/proposed/20261014000000_fv01_security_privacy_remediation.sql");
const sql = readFileSync(SQL_PATH, "utf8").toLowerCase().replace(/\s+/g, " ");

function memoryStore() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("FV-01 proposed migration (static contract; not live proof)", () => {
  test("FV-01-01/08 policies require active membership", () => {
    expect(sql).toContain("mm.role = 'crew_self' and mm.active and mm.crew_member_id = mission_events.crew_member_id");
    expect(sql).toContain("(mm.user_id = auth.uid() and mm.active)");
  });
  test("FV-01-02 never discloses out-of-scope metadata and is race-safe", () => {
    expect(sql).toContain("pg_advisory_xact_lock(hashtext('mitochondria:event-id:'");
    expect(sql).toContain("'reason','identifier_unavailable'");
    expect(sql).toContain("exception when unique_violation");
    const scopeCheck = sql.indexOf("v_existing.mission_id <> v_mission");
    const remote = sql.indexOf("'remote',jsonb_build_object");
    expect(scopeCheck).toBeGreaterThan(0);
    expect(remote).toBeGreaterThan(scopeCheck);
  });
  test("FV-01-03 validates assignment and lifecycle after duplicate detection", () => {
    const dup = sql.indexOf("'status','duplicate'");
    expect(sql.indexOf("crew assignment inactive for mission")).toBeGreaterThan(dup);
    expect(sql.indexOf("mission closed for new events")).toBeGreaterThan(dup);
    expect(sql).toContain("v_event_ts > v_mission_ends");
  });
  test("FV-01-04 operator snapshot is operational-only", () => {
    expect(sql).toContain("'scope','operational'");
    expect(sql).toContain("'finding_count',null");
  });
  test("FV-01-05/12 revokes browser write privileges and grants nothing to anon", () => {
    expect(sql).toContain("revoke insert, update, delete, truncate, references, trigger on public.crew_members, public.mission_memberships, public.missions from authenticated, anon");
    expect(sql).not.toMatch(/grant [^;]* to (public|anon)\b/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)/);
  });
  test("FV-01-06 export is frozen, rate limited and fails closed", () => {
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("'reason','mission_not_closed'");
    expect(sql).toContain("e.ingested_at <= v_ends");
    expect(sql).toContain("v_crew < 3");
    expect(sql).toContain("v_bucket < 10");
  });
  test("FV-01-10 refuses Crew Self binding replacement", () => {
    expect(sql).toContain("existing crew-self binding differs; operator review required");
  });
  test("every SECURITY DEFINER pins search_path", () => {
    const definers = sql.match(/security definer/g) ?? [];
    const pinned = sql.match(/security definer set search_path/g) ?? [];
    expect(definers.length).toBe(pinned.length);
  });
});

describe("FV-01-11 mission selection storage", () => {
  test("selection is bound to its account", () => {
    const s = memoryStore();
    writeActiveSelection(s, "user-a", "m1::crew_self::c1");
    expect(readActiveSelection(s, "user-a")).toBe("m1::crew_self::c1");
    expect(readActiveSelection(s, "user-b")).toBeUndefined();
    expect(s.map.has(ACTIVE_MEMBERSHIP_KEY)).toBe(false);
  });
  test("signed-out read and legacy keys are cleared", () => {
    const s = memoryStore();
    s.setItem("mitochondria.active-mission-membership.v1", "m1::crew_self::c1");
    writeActiveSelection(s, "user-a", "k");
    expect(readActiveSelection(s, undefined)).toBeUndefined();
    expect(s.map.size).toBe(0);
    writeActiveSelection(s, "user-a", "k");
    clearActiveSelection(s);
    expect(s.map.size).toBe(0);
  });
  test("sign-out and account switch invalidate", () => {
    expect(shouldClearSelection("SIGNED_OUT", "a", undefined)).toBe(true);
    expect(shouldClearSelection("SIGNED_IN", "a", "b")).toBe(true);
    expect(shouldClearSelection("TOKEN_REFRESHED", "a", "a")).toBe(false);
  });
});

describe("FV-01 sync classification", () => {
  test("new deterministic refusals are not retried forever", () => {
    expect(classifyMissionSyncError("crew assignment inactive for mission")).toBe("rejected");
    expect(classifyMissionSyncError("mission closed for new events")).toBe("rejected");
    expect(classifyMissionSyncError("network timeout")).toBe("retryable");
  });
});
