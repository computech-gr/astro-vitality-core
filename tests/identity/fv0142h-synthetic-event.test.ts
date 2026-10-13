import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

import {
  FV0142H_SUBMISSION_ENABLED,
  buildFv0142hEvent,
  resolveFv0142hTarget,
  submitFv0142hEvent,
} from "@/diagnostics/fv0142h-synthetic-event";
import type { MissionMembershipContext } from "@/infrastructure/mission-identity";

const A: MissionMembershipContext = { missionId: "m-a", role: "crew_self", crewMemberId: "c-a", missionCode: "FV01-TEST-A", crewDisplayName: "FV01 Test Crew A", crewExternalRef: "FV01-CREW-A" };
const B: MissionMembershipContext = { missionId: "m-b", role: "crew_self", crewMemberId: "c-b", missionCode: "FV01-TEST-B", crewDisplayName: "FV01 Test Crew B", crewExternalRef: "FV01-CREW-B" };
const NOW = "2026-10-13T20:00:00.000Z";

function mockClient() {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return { calls, rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: { status: "accepted", record_id: "x" }, error: null }; } };
}

describe("FV-01.4.2H B6-A synthetic event test", () => {
  test("B6-B: submission enabled by owner authorization; explicit disable still blocks with zero calls", async () => {
    expect(FV0142H_SUBMISSION_ENABLED).toBe(true);
    const client = mockClient();
    const target = resolveFv0142hTarget(true, [A]);
    if (!target.ok) throw new Error("expected eligible");
    expect(await submitFv0142hEvent(client, target, NOW, false)).toBe("BLOCKED");
    expect(client.calls).toHaveLength(0);
  });

  test("rejects accounts with any additional active membership of any role", () => {
    expect(resolveFv0142hTarget(true, [A, { missionId: "m-x", role: "mission_operator", missionCode: "OTHER" }])).toEqual({ ok: false, reason: "ambiguous_membership" });
    expect(resolveFv0142hTarget(true, [B, { missionId: "m-b", role: "ground_medical", missionCode: "FV01-TEST-B" }])).toEqual({ ok: false, reason: "ambiguous_membership" });
  });

  test("regression: production shape — crew code is the external reference, not the display name", () => {
    // Production TEST A: display_name "FV01 Test Crew A", external_ref "FV01-CREW-A".
    expect(resolveFv0142hTarget(true, [A])).toMatchObject({ ok: true, eventId: "fv01-b6-a-001" });
    // Matching on display name alone must never grant eligibility.
    expect(resolveFv0142hTarget(true, [{ ...A, crewDisplayName: "FV01-CREW-A", crewExternalRef: undefined } as MissionMembershipContext])).toEqual({ ok: false, reason: "no_eligible_membership" });
    expect(resolveFv0142hTarget(true, [{ ...A, crewExternalRef: undefined } as MissionMembershipContext])).toEqual({ ok: false, reason: "no_eligible_membership" });
  });

  test("idempotency key is deterministic across reloads (independent of time)", async () => {
    const c1 = mockClient(); const c2 = mockClient();
    const target = resolveFv0142hTarget(true, [A]);
    if (!target.ok) throw new Error("expected eligible");
    await submitFv0142hEvent(c1, target, NOW, true);
    await submitFv0142hEvent(c2, target, "2026-10-14T01:00:00.000Z", true);
    expect(c1.calls[0]!.args.p_idempotency_key).toBe(c2.calls[0]!.args.p_idempotency_key);
  });

  test("resolves only the authorized mission/crew pairs from membership data", () => {
    expect(resolveFv0142hTarget(true, [A])).toMatchObject({ ok: true, missionId: "m-a", crewMemberId: "c-a", eventId: "fv01-b6-a-001" });
    expect(resolveFv0142hTarget(true, [B])).toMatchObject({ ok: true, missionId: "m-b", crewMemberId: "c-b", eventId: "fv01-b6-b-001" });
    expect(resolveFv0142hTarget(false, [A])).toEqual({ ok: false, reason: "not_signed_in" });
    expect(resolveFv0142hTarget(true, [])).toEqual({ ok: false, reason: "no_eligible_membership" });
    expect(resolveFv0142hTarget(true, [{ ...A, missionCode: "MISSION_TEST" }])).toEqual({ ok: false, reason: "no_eligible_membership" });
    expect(resolveFv0142hTarget(true, [{ ...A, crewDisplayName: "FV01 Test Crew B", crewExternalRef: "FV01-CREW-B" }])).toEqual({ ok: false, reason: "no_eligible_membership" });
    expect(resolveFv0142hTarget(true, [{ ...A, role: "mission_operator" }])).toEqual({ ok: false, reason: "no_eligible_membership" });
    expect(resolveFv0142hTarget(true, [A, B])).toEqual({ ok: false, reason: "ambiguous_membership" });
    expect(resolveFv0142hTarget(true, [A, { ...A, missionId: "other", missionCode: "OTHER", crewDisplayName: "X" }])).toEqual({ ok: false, reason: "ambiguous_membership" });
  });

  test("builds only the predefined synthetic non-medical event", () => {
    const target = resolveFv0142hTarget(true, [A]);
    if (!target.ok) throw new Error("expected eligible");
    expect(buildFv0142hEvent(target, NOW)).toEqual({
      id: "fv01-b6-a-001", kind: "operational_event", classification: "synthetic", sourceId: "fv01-b6-synthetic", sourceVersion: "1.0.0",
      sourcePriority: 50, mission: { missionId: "m-a", crewMemberId: "c-a" }, eventTimestamp: NOW, createdAt: NOW, payload: { fv01Test: "B6", synthetic: true },
    });
  });

  test("when explicitly enabled (mock only) it issues exactly one direct ingest call", async () => {
    const client = mockClient();
    const target = resolveFv0142hTarget(true, [B]);
    if (!target.ok) throw new Error("expected eligible");
    expect(await submitFv0142hEvent(client, target, NOW, true)).toBe("ACCEPTED");
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.fn).toBe("ingest_mission_event");
    expect((client.calls[0]!.args.p_idempotency_key as string).startsWith("fv01-b6-b-001:1.0.0:")).toBe(true);
  });

  test("source guardrails: no queue, sync, privileged access, medical data or auto-run", () => {
    const logic = readFileSync("src/diagnostics/fv0142h-synthetic-event.ts", "utf8");
    const ui = readFileSync("src/components/diagnostics/fv0142h-synthetic-event.tsx", "utf8");
    const route = readFileSync("src/routes/diag.fv0142h-synthetic-event.tsx", "utf8");
    for (const src of [logic, ui, route]) {
      for (const banned of ["persistOfflineMissionEvent", "enqueueOfflineRecord", "synchronize", "client.server", "supabaseAdmin", "service_role", "createServerFn", "medical_sensitive", "readiness", ".insert(", ".update(", ".upsert(", ".delete(", "useEffect", "error.message"]) {
        expect(src).not.toContain(banned);
      }
    }
    expect(ui).toContain("disabled={!FV0142H_SUBMISSION_ENABLED");
    expect(ui).toContain("outcome !== null}");
    expect(route).toContain("noindex");
    const files = readdirSync("src/components", { recursive: true }).map(String).filter((f) => /\.tsx?$/.test(f) && !f.includes("diagnostics"));
    for (const file of files) expect(readFileSync(`src/components/${file}`, "utf8")).not.toContain("fv0142h");
  });
});
