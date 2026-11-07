import { describe, expect, test } from "bun:test";
import { activationQueueCore } from "../../src/lib/p37-catalog.server";
import type { Rpc } from "../../src/lib/p36-scientific-authorization.server";

const row = {
  approval_event_id: "11111111-1111-4111-8111-111111111111",
  submission_id: "22222222-2222-4222-8222-222222222222",
  term_id: "ubt-0000abcd",
  canonical_id: "ext:synthetic-marker-gm",
  provenance: "synthetic",
  entry: { canonicalId: "ext:synthetic-marker-gm", canonicalName: "Synthetic marker GM", aliases: ["x"] },
  entry_sha256: "a".repeat(64),
  approved_at: "2026-11-08T10:00:00Z",
  approved_by_caller: false,
  caller_may_activate: true,
  activation_event_id: null,
  activated_at: null,
  activated_by_caller: null,
  revocation_event_id: null,
  revoked_at: null,
  revocation_reason: null,
};
const rpcWith =
  (result: { data: unknown; error: { code?: string } | null }): Rpc =>
  async () =>
    result as never;

describe("P37 Ground Medical activation queue (server core)", () => {
  test("fails closed while the role-based database change is not installed", async () => {
    const r = await activationQueueCore(rpcWith({ data: null, error: { code: "PGRST202" } }), "M1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("migration_required");
  });
  test("a caller without Ground Medical membership for the mission is refused", async () => {
    const r = await activationQueueCore(rpcWith({ data: null, error: { code: "42501" } }), "M1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("forbidden");
  });
  test("database-confirmed eligibility is carried per proposal", async () => {
    const r = await activationQueueCore(
      rpcWith({ data: { can_activate: true, events: [row, { ...row, approval_event_id: "33333333-3333-4333-8333-333333333333", caller_may_activate: false }] }, error: null }),
      "M1",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events.map((e) => e.callerMayActivate)).toEqual([true, false]);
  });
  test("malformed proposals are rejected rather than shown", async () => {
    const r = await activationQueueCore(
      rpcWith({ data: { can_activate: true, events: [{ ...row, entry_sha256: "nope" }] }, error: null }),
      "M1",
    );
    expect(r.ok).toBe(false);
  });
});
