import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  allowedStatusTargets,
  buildMissionSettingsUpdate,
  draftFromMission,
  isDraftDirty,
  utcInputToIso,
  validateMissionSettings,
  type MissionSettingsSnapshot,
} from "../../src/domain/mission-settings/settings";
import {
  auditDateRange,
  classifyAuditError,
  redactDetails,
  sanitizeAuditPage,
} from "../../src/domain/mission-audit/audit";
import { MISSION_WORKFLOWS, workflowsForRole } from "../../src/domain/mission-experience/workflows";

const planning: MissionSettingsSnapshot = {
  id: "m1",
  code: "M-1",
  name: "Mission One",
  status: "planning",
  starts_at: "2026-11-01T08:00:00.000Z",
  ends_at: "2026-12-01T08:00:00.000Z",
};

describe("FV-01.4.6 Mission Settings", () => {
  it("starts clean and valid", () => {
    const d = draftFromMission(planning);
    expect(isDraftDirty(planning, d)).toBe(false);
    expect(validateMissionSettings(planning, d)).toEqual([]);
  });
  it("validates name length", () =>
    expect(
      validateMissionSettings(planning, { ...draftFromMission(planning), name: "ab" }).length,
    ).toBe(1));
  it("enforces forward-only lifecycle", () => {
    expect(allowedStatusTargets("active")).not.toContain("planning");
    expect(
      validateMissionSettings(
        { ...planning, status: "active" },
        { ...draftFromMission(planning), status: "planning" },
      ).join(),
    ).toContain("cannot change");
  });
  it("closed missions are read-only", () =>
    expect(
      validateMissionSettings({ ...planning, status: "completed" }, draftFromMission(planning))[0],
    ).toContain("read-only"));
  it("rejects end before start and clearing a start", () => {
    const d = draftFromMission(planning);
    expect(
      validateMissionSettings(planning, { ...d, endsAt: "2026-10-01T08:00" }).join(),
    ).toContain("after the start");
    expect(validateMissionSettings(planning, { ...d, startsAt: "" }).join()).toContain(
      "cannot be cleared",
    );
  });
  it("treats inputs as UTC and always sends the end date", () => {
    expect(utcInputToIso("2026-11-01T08:00")).toBe("2026-11-01T08:00:00.000Z");
    const u = buildMissionSettingsUpdate(planning, {
      ...draftFromMission(planning),
      name: " Renamed ",
    });
    expect(u).toEqual({
      missionId: "m1",
      name: "Renamed",
      startsAt: planning.starts_at!,
      endsAt: planning.ends_at!,
    });
  });
  it("UI guards duplicate submission and reuses the existing RPC only", () => {
    const ui = readFileSync("src/components/mission-settings-panel.tsx", "utf8");
    expect(ui).toContain("inFlight.current");
    expect(ui).toContain("updateMissionOperation");
    expect(ui).not.toMatch(/\.from\(|rpc\(/);
  });
});

describe("FV-01.4.6 Mission Audit Log", () => {
  it("redacts secrets and unknown keys client-side", () => {
    expect(
      redactDetails({
        status: "active",
        code: "X",
        email: "a@b",
        code_hash: "h",
        payload: { hr: 1 },
        name: "n",
      }),
    ).toEqual({ status: "active" });
  });
  it("never surfaces raw actor IDs", () => {
    const p = sanitizeAuditPage({
      next_cursor: "v3.eyJ2IjoiMyJ9." + "a".repeat(64),
      entries: [
        {
          ref: "0123456789abcdef0123456789abcdef",
          occurred_at: "2026-01-01T00:00:00Z",
          action: "a",
          outcome: "x",
          target_type: "t",
          actor: "00000000-0000-0000-0000-000000000001",
          details: {},
        },
      ],
      has_more: true,
      actions: ["b", "a"],
    });
    expect(p.entries[0]!.actor).toBe("member");
    expect(p.entries[0]!.outcome).toBe("success");
    expect(p.has_more).toBe(true);
    expect(p.actions).toEqual(["a", "b"]);
  });
  it("handles empty or malformed pages", () => expect(sanitizeAuditPage(null).entries).toEqual([]));
  it("uses inclusive UTC date ranges", () => {
    expect(auditDateRange({ fromDate: "2026-01-02", toDate: "2026-01-02" })).toEqual({
      from: "2026-01-02T00:00:00.000Z",
      to: "2026-01-03T00:00:00.000Z",
    });
    expect(auditDateRange({ fromDate: "2026-01-03", toDate: "2026-01-02" }).error).toBeDefined();
  });
  it("classifies not-deployed, denied and other errors", () => {
    expect(classifyAuditError("Could not find the function public.get_mission_audit_log")).toBe(
      "unavailable",
    );
    expect(classifyAuditError("mission audit access denied")).toBe("denied");
    expect(classifyAuditError("network")).toBe("error");
  });
  it("viewer is read-only (no edit, delete or direct table access)", () => {
    const ui = readFileSync("src/components/mission-audit-log.tsx", "utf8");
    expect(ui).not.toMatch(/\.(delete|update|insert|upsert)\(|\.from\(|rpc\(/);
    expect(ui).toContain("loadMissionAuditLog");
  });
  it("staged reader is operator-only, stable and grants no table access", () => {
    const sql = readFileSync(
      "supabase/migrations/20261016000000_fv0146_mission_audit_viewer.sql",
      "utf8",
    );
    expect(sql).toContain("array['mission_operator']");
    expect(sql).toContain("stable");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toMatch(/revoke all on function .* from public, anon/);
    expect(sql).not.toMatch(/grant select|create policy|insert into|update public|delete from/i);
    expect(sql).toContain("p_cursor text");
    expect(sql).not.toMatch(/'id', *f\.id|p_before_id uuid|encrypt_iv|SIV/);
    expect(sql).toContain("fv0146:actor:pseudonym");
  });
  it("client drops free text and sensitive values even under allowed keys", () => {
    expect(
      redactDetails({
        reason: "wrong_recipient: jane@x.org code ZX9",
        status: "Jane Doe",
        role: "TOKEN-1",
        policy: "sk_live",
        expires_in_hours: 999999,
        external_ref_present: "yes",
        kind: "x",
        outcome: "y",
      }),
    ).toEqual({});
    expect(
      redactDetails({
        reason: "wrong_recipient",
        role: "ground_medical",
        expires_in_hours: 72,
        creator_operator: true,
      }),
    ).toEqual({
      reason: "wrong_recipient",
      role: "ground_medical",
      expires_in_hours: 72,
      creator_operator: true,
    });
    const p = sanitizeAuditPage({
      entries: [
        {
          id: "raw-uuid",
          ref: "not-hex",
          action: "Leak bob@x.org",
          target_type: "Invite <a@b>",
          actor_role: "jane",
          details: {},
        },
      ],
      has_more: true,
      next_cursor: "bad cursor!",
      actions: ["ok_action", "Bad Action"],
    });
    const e = p.entries[0]!;
    expect(JSON.stringify(p)).not.toMatch(/raw-uuid|bob|a@b|jane/);
    expect([e.ref, e.action, e.target_type, e.actor_role]).toEqual(["", "other", "other", null]);
    expect(p.has_more).toBe(false);
    expect(p.actions).toEqual(["ok_action"]);
  });
});

describe("FV-01.4.6 role visibility and navigation", () => {
  it("Operations workflow stays operator-only", () => {
    expect(workflowsForRole("mission_operator").some((w) => w.id === "operations")).toBe(true);
    for (const r of ["crew_self", "ground_medical", "researcher"] as const)
      expect(workflowsForRole(r).some((w) => w.id === "operations")).toBe(false);
  });
  it("Operations page renders both panels only inside the operator workspace", () => {
    const ui = readFileSync("src/components/mission-operations.tsx", "utf8");
    const gate = ui.indexOf("Operator membership required");
    expect(gate).toBeGreaterThan(0);
    expect(ui.indexOf("<MissionSettingsPanel")).toBeGreaterThan(gate);
    expect(ui.indexOf("<MissionAuditLog")).toBeGreaterThan(gate);
    expect(ui).toContain('href="#mission-settings"');
  });
  it("keeps FV-01.4.5 ground workflow restriction", () =>
    expect(MISSION_WORKFLOWS.find((w) => w.id === "ground")?.roles).toEqual([
      "ground_medical",
      "researcher",
    ]));
});
