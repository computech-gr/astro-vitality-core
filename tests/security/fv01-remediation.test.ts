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
    expect(sql).not.toMatch(/grant (insert|update|delete|all)\b[^;]*\bto [^;]*\b(authenticated|anon|public)\b/);
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

const fn = (name: string) => {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const end = sql.indexOf("$function$;", start);
  return sql.slice(start, end);
};

describe("FV-01.1 pre-migration corrections (static; live verification still required)", () => {
  test("invite binding conflict persists audit by returning, not raising", () => {
    const body = fn("accept_mission_invite");
    const audit = body.indexOf("'mission_invite_binding_conflict'");
    const ret = body.indexOf("'reason','crew_self_binding_conflict'");
    expect(audit).toBeGreaterThan(0);
    expect(ret).toBeGreaterThan(audit);
    const between = body.slice(audit, ret);
    expect(between).not.toContain("raise exception");
    // membership must not be touched on the rejection path
    expect(between).not.toContain("insert into public.mission_memberships");
    expect(body.slice(0, ret)).toContain("update public.mission_invites set active=false where id=v_invite.id");
  });
  test("concurrent exports: lock precedes the rate-limit read, per user across roles", () => {
    const body = fn("export_research_mission");
    const lock = body.indexOf("pg_advisory_xact_lock");
    const check = body.indexOf("interval '24 hours'");
    expect(lock).toBeGreaterThan(0);
    expect(check).toBeGreaterThan(lock);
    expect(body).toContain("actor_user_id=auth.uid()");
    expect(body).toContain("action in ('research_export_aggregate','research_export_suppressed')");
  });
  test("export cohort no longer depends on mutable assignment status", () => {
    const body = fn("export_research_mission");
    expect(body).not.toContain("a.status");
    expect(body).toContain("e.ingested_at <= v_ends");
  });
  test("audit_events is append-only and ends_at immutable after close", () => {
    expect(sql).toContain("before update or delete on public.audit_events");
    expect(sql).toContain("before truncate on public.audit_events");
    expect(sql).toContain("mission end is immutable after close");
    expect(fn("reject_audit_mutation")).not.toContain("security definer");
  });
  test("no SECURITY DEFINER routine in the migration updates or deletes audit rows", () => {
    expect(sql).not.toMatch(/(update|delete from) public\.audit_events/);
  });
});

describe("FV-01.2 frozen research boundary (STATIC source checks — see scripts/verify-fv01-pg-integration.mjs for PostgreSQL integration)", () => {
  test("snapshot is written in the closing transaction and export reads only the snapshot", () => {
    const close = fn("update_mission_operation");
    expect(close).toContain("for update");
    expect(close).toContain("insert into public.mission_research_snapshots");
    const exp = fn("export_research_mission");
    expect(exp).toContain("from public.mission_research_snapshots");
    expect(exp).not.toContain("from public.mission_events");
    expect(exp).toContain("'reason','snapshot_unavailable'");
  });
  test("closure, assignment and snapshot immutability are trigger-enforced for all roles", () => {
    expect(sql).toContain("before update or delete on public.missions");
    expect(sql).toContain("before insert or update or delete on public.mission_crew_assignments");
    expect(sql).toContain("before update or delete on public.mission_research_snapshots");
    expect(sql).toContain("before update or delete on public.mission_events");
    expect(fn("enforce_assignment_closure")).toContain("for share");
    expect(sql).toContain("revoke all on public.mission_research_snapshots from public, anon, authenticated");
  });
  test("ingestion serializes with close; lock order is advisory(id) -> advisory(key) -> mission row", () => {
    const ing = fn("ingest_mission_event");
    const a = ing.indexOf("'mitochondria:event-id:'");
    const b = ing.indexOf("'mitochondria:idem:'");
    const c = ing.indexOf("from public.missions where id=v_mission for share");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});
