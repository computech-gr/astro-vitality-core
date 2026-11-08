import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBulkPreflight,
  executeBulk,
  pruneSelection,
  retryFailedIds,
  selectAllFiltered,
  selectIds,
  selectionCounts,
  selectionScope,
  toggleId,
} from "../../src/domain/health-intelligence/p55-bulk-selection-engine";
import {
  acceptReviewFit,
  acknowledgeMatchFit,
  activateFit,
  clarifyFit,
  demoDecideFit,
  groundRecord,
  requestClarificationFit,
  suggestedRequirements,
} from "../../src/domain/health-intelligence/p55-bulk-actions";
import {
  activationPreview,
  type BatchResponse,
  type PendingDemoProposal,
} from "../../src/domain/health-intelligence/p38-bulk-demo-batches";
import type { PreflightRow } from "../../src/domain/health-intelligence/p38-bulk-demo-preflight";
import { bulkTriageCore } from "../../src/lib/p55-bulk-triage.server";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Cat = PreflightRow["category"];
const row = (key: string, over: Partial<PreflightRow> = {}): PreflightRow =>
  ({
    key,
    submissionId: "s",
    termId: key,
    labels: [key],
    unit: "ng/mL",
    category: "eligible" as Cat,
    inScope: true,
    triageAction: "ACCEPT_FOR_REVIEW",
    reasons: [],
    references: [],
    domain: "bone",
    displayName: key,
    ...over,
  }) as PreflightRow;

/** Regression scenario shaped like the observed MITO_DEMO_2026 snapshot (counts are inputs, not hardcoded expectations). */
function snapshot() {
  const rows: PreflightRow[] = [];
  for (let i = 0; i < 209; i++) {
    const awaiting = i >= 191; // 18 awaiting triage
    const cat: Cat =
      i < 186 ? "already_active" : i < 192 ? "existing_catalog_match" : "ambiguous_unit";
    rows.push(
      row(`t${i}`, {
        category: cat,
        triageAction: awaiting ? null : "ACCEPT_FOR_REVIEW",
        inScope: i < 186,
        reasons: [`reason ${cat}`],
      }),
    );
  }
  return rows;
}

describe("P55 shared selection engine", () => {
  it("Select All Filtered covers every matching record across pages, by stable ID", () => {
    const rows = snapshot();
    const filtered = rows.filter((r) => r.triageAction === null).map((r) => r.key);
    const page1 = filtered.slice(0, 5); // a 5-row page
    expect(selectIds(new Set(), page1).size).toBe(5);
    const all = selectAllFiltered(new Set(), filtered);
    expect(all.size).toBe(18);
    expect(selectionScope(all, filtered)).toEqual({
      totalMatching: 18,
      selected: 18,
      selectedVisible: 18,
      selectedHidden: 0,
      allFilteredSelected: true,
    });
  });

  it("changing filters keeps hidden selections visible in the scope and the preflight", () => {
    const rows = snapshot();
    const sel = toggleId(selectAllFiltered(new Set(), ["t0", "t1"]), "t200", true);
    const narrowed = ["t200"];
    expect(selectionScope(sel, narrowed).selectedHidden).toBe(2);
    const p = buildBulkPreflight({
      records: rows,
      idOf: (r) => r.key,
      selected: sel,
      filteredIds: narrowed,
      fit: (r) => acceptReviewFit(r, true),
      missionLabel: "M",
      roleLabel: "Researcher",
      actionLabel: "Accept",
    });
    expect(p.selected).toBe(3);
    expect(p.selectedHidden).toBe(2);
    expect(pruneSelection(sel, narrowed)).toEqual(new Set(["t200"]));
  });

  it("selecting never changes record state", () => {
    const rows = snapshot();
    const before = JSON.stringify(rows);
    selectionCounts({
      records: rows,
      idOf: (r) => r.key,
      selected: new Set(rows.map((r) => r.key)),
      filteredIds: rows.map((r) => r.key),
      fit: (r) => acceptReviewFit(r, true),
    });
    expect(JSON.stringify(rows)).toBe(before);
  });
});

describe("P55 Researcher bulk triage and decisions", () => {
  it("bulk acceptance: only pending-triage terms are actionable; accepted ones are already processed", () => {
    const rows = snapshot();
    const all = new Set(rows.map((r) => r.key));
    const p = buildBulkPreflight({
      records: rows,
      idOf: (r) => r.key,
      selected: all,
      fit: (r) => acceptReviewFit(r, true),
      missionLabel: "MITO_DEMO_2026",
      roleLabel: "Researcher",
      actionLabel: "Accept",
    });
    expect(p.actionable.length).toBe(18);
    expect(p.already.length).toBe(191);
    expect(p.expectedChanges).toBe(18);
  });

  it("without the triage grant nothing is actionable and the reason is shown", () => {
    const fit = acceptReviewFit({ triageAction: null }, false);
    expect(fit.kind).toBe("blocked");
    expect(
      requestClarificationFit({ triageAction: null, category: "ambiguous_unit" }, false).kind,
    ).toBe("blocked");
  });

  it("rejected or evidence-pending requests are never bulk-accepted", () => {
    expect(acceptReviewFit({ triageAction: "REJECT_REVIEW_REQUEST" }, true).kind).toBe("blocked");
    expect(acceptReviewFit({ triageAction: "REQUEST_MORE_EVIDENCE" }, true).kind).toBe("blocked");
  });

  it("synthetic demo decisions keep every P38 prerequisite, independence and acceptance", () => {
    const ctx = { submittedByCaller: false, canDecide: true };
    expect(demoDecideFit(row("a"), ctx).kind).toBe("actionable");
    expect(demoDecideFit(row("a", { triageAction: null }), ctx).kind).toBe("blocked");
    expect(demoDecideFit(row("a"), { ...ctx, submittedByCaller: true }).kind).toBe("blocked");
    expect(demoDecideFit(row("a", { inScope: false }), ctx).kind).toBe("blocked");
    expect(
      demoDecideFit(row("a", { category: "ambiguous_unit", reasons: ["Alternative units"] }), ctx),
    ).toEqual({ kind: "blocked", reason: "Alternative units" });
    expect(
      demoDecideFit(row("a", { category: "existing_catalog_match", reasons: ["x"] }), ctx).kind,
    ).toBe("blocked");
    expect(
      demoDecideFit(row("a", { category: "conflicting_identity", reasons: ["x"] }), ctx).kind,
    ).toBe("blocked");
    expect(demoDecideFit(row("a", { category: "already_active" }), ctx).kind).toBe("already");
    expect(demoDecideFit(row("a"), { ...ctx, canDecide: false }).kind).toBe("blocked");
  });

  it("the 209-term snapshot yields no eligible synthetic demo decision", () => {
    const rows = snapshot();
    const p = buildBulkPreflight({
      records: rows,
      idOf: (r) => r.key,
      selected: new Set(rows.map((r) => r.key)),
      fit: (r) => demoDecideFit(r, { submittedByCaller: false, canDecide: true }),
      missionLabel: "M",
      roleLabel: "R",
      actionLabel: "Decide",
    });
    expect(p.actionable.length).toBe(0);
    expect(p.already.length).toBe(186);
    expect(p.blocked.length).toBe(23);
  });

  it("clarification targets unresolved terms and suggests unit/identity evidence", () => {
    expect(
      requestClarificationFit({ triageAction: null, category: "ambiguous_unit" }, true).kind,
    ).toBe("actionable");
    expect(
      requestClarificationFit(
        { triageAction: "ACCEPT_FOR_REVIEW", category: "conflicting_identity" },
        true,
      ).kind,
    ).toBe("actionable");
    expect(
      requestClarificationFit({ triageAction: null, category: "existing_catalog_match" }, true)
        .kind,
    ).toBe("blocked");
    expect(
      requestClarificationFit({ triageAction: null, category: "already_active" }, true).kind,
    ).toBe("blocked");
    expect(requestClarificationFit({ triageAction: "REQUEST_MORE_EVIDENCE" }, true).kind).toBe(
      "already",
    );
    expect(suggestedRequirements(["ambiguous_unit", "conflicting_identity", "eligible"])).toEqual([
      "identity",
      "unit",
    ]);
  });

  it("existing catalog matches are acknowledged only once and only for matched terms", () => {
    expect(acknowledgeMatchFit(row("a", { category: "existing_catalog_match" }), false).kind).toBe(
      "actionable",
    );
    expect(acknowledgeMatchFit(row("a", { category: "existing_catalog_match" }), true).kind).toBe(
      "already",
    );
    expect(acknowledgeMatchFit(row("a", { category: "eligible" }), false).kind).toBe("blocked");
  });
});

const proposal = (n: number, over: Partial<PendingDemoProposal> = {}): PendingDemoProposal => ({
  decisionEventId: UUID(n),
  submissionId: "s",
  termId: `ubt-0000000${n}`,
  demoId: `demo:${n}`,
  entrySha256: "a".repeat(64),
  entry: {
    displayName: `Marker ${n}`,
    aliases: [],
    unit: "ng/mL",
    domain: n % 2 ? "immune" : "bone",
  },
  decidedByCaller: false,
  activationEventId: null,
  revocationEventId: null,
  ...over,
});

describe("P55 Ground Medical bulk selection and activation", () => {
  const props = [
    proposal(1),
    proposal(2),
    proposal(3, { activationEventId: UUID(99) }),
    proposal(4, { decidedByCaller: true }),
    proposal(5, { submissionId: "other-crew" }),
    proposal(6, { entry: { displayName: "Marker 1", aliases: [], unit: "ng/mL", domain: "bone" } }),
    proposal(7, {
      entry: { displayName: "Vitamin D", aliases: [], unit: "ng/mL", domain: "bone" },
    }),
  ];
  const existing = (l: string, u: string) =>
    l === "Vitamin D" && u === "ng/mL" ? "bone-019" : null;
  const records = activationPreview(props, (p) => p.submissionId !== "other-crew").map((r) =>
    groundRecord(r, existing),
  );
  const status = Object.fromEntries(records.map((g) => [g.row.proposal.demoId, g.status]));

  it("maps every proposal to a Ground Medical status, including crew isolation and existing matches", () => {
    expect(status).toEqual({
      "demo:1": "awaiting_activation",
      "demo:2": "awaiting_activation",
      "demo:3": "already_active",
      "demo:4": "blocked",
      "demo:5": "blocked",
      "demo:6": "requires_clarification",
      "demo:7": "existing_catalog_match",
    });
    expect(records.find((g) => g.status === "existing_catalog_match")!.existingMatch).toBe(
      "bone-019",
    );
  });

  it("combined domain + status filter with Select All Filtered activates only eligible entries", () => {
    const filtered = records
      .filter((g) => g.row.proposal.entry.domain === "bone")
      .map((g) => g.row.proposal.decisionEventId);
    const sel = selectAllFiltered(new Set(), filtered);
    const p = buildBulkPreflight({
      records,
      idOf: (g) => g.row.proposal.decisionEventId,
      selected: sel,
      filteredIds: filtered,
      fit: (g) => activateFit(g, true),
      missionLabel: "M",
      roleLabel: "Ground Medical",
      actionLabel: "Activate",
    });
    expect(p.actionable.map((g) => g.row.proposal.demoId)).toEqual(["demo:2"]);
    expect(p.blocked.map((x) => x.record.row.proposal.demoId).sort()).toEqual([
      "demo:4",
      "demo:6",
      "demo:7",
    ]);
    expect(p.already).toEqual([]);
  });

  it("already active entries are never activated twice; blocked ones can be selected for clarification", () => {
    const active = records.find((g) => g.status === "already_active")!;
    expect(activateFit(active, true).kind).toBe("already");
    expect(clarifyFit(active).kind).toBe("blocked");
    for (const g of records.filter(
      (x) => x.status === "blocked" || x.status === "requires_clarification",
    )) {
      expect(activateFit(g, true).kind).toBe("blocked");
      expect(clarifyFit(g).kind).toBe("actionable");
    }
    expect(activateFit(records[0]!, false).kind).toBe("blocked");
  });
});

describe("P55 partial failures, retries and outcomes", () => {
  it("only server-confirmed items succeed; a failed batch is retryable without resending successes", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => row(`k${i}`, { triageAction: null }));
    const p = buildBulkPreflight({
      records: rows,
      idOf: (r) => r.key,
      selected: new Set(rows.map((r) => r.key)),
      fit: (r) => acceptReviewFit(r, true),
      missionLabel: "M",
      roleLabel: "R",
      actionLabel: "A",
    });
    let call = 0;
    const send = async (batch: PreflightRow[]): Promise<BatchResponse> => {
      call++;
      if (call === 2) return { ok: false, message: "network" };
      return {
        ok: true,
        results: batch.map((r, i) => ({
          ref: r.key,
          termId: r.termId,
          status: i === 0 ? "duplicate" : i === 1 ? "stale" : "recorded",
          detail: null,
          eventId: i === 1 ? null : UUID(i + 1),
        })),
      };
    };
    const res = await executeBulk({ preflight: p, idOf: (r) => r.key, labelOf: (id) => id, send });
    const counts = res.outcomes.reduce<Record<string, number>>(
      (c, o) => ((c[o.outcome] = (c[o.outcome] ?? 0) + 1), c),
      {},
    );
    expect(counts).toEqual({ already_completed: 1, failed: 11, success: 48 });
    const retry = retryFailedIds(res.outcomes);
    expect(retry.length).toBe(11);
    expect(retry).toContain("k1");
    expect(retry).not.toContain("k0");
    expect(retry).not.toContain("k2");
  });
});

describe("P55 server bulk triage over the existing caller-scoped RPC", () => {
  const input = {
    missionId: "MITO_DEMO_2026",
    action: "ACCEPT_FOR_REVIEW" as const,
    reason: null,
    evidenceRequirements: [],
    items: [
      { submissionId: UUID(1), termId: "ubt-00000001", expectedPreviousEventId: null },
      { submissionId: UUID(1), termId: "ubt-00000002", expectedPreviousEventId: UUID(7) },
    ],
  };
  const recorder = (
    reply: (args: Record<string, unknown>) => { data: unknown; error: { code?: string } | null },
  ) => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    return {
      calls,
      rpc: async (fn: string, args: Record<string, unknown>) => (
        calls.push({ fn, args }),
        reply(args)
      ),
    };
  };

  it("calls only the triage RPC, for the single requested mission, as synthetic provenance", async () => {
    const r = recorder(() => ({ data: { status: "recorded", event_id: UUID(5) }, error: null }));
    const res = await bulkTriageCore(r.rpc, "user-1", input);
    expect(res.ok).toBe(true);
    expect(new Set(r.calls.map((c) => c.fn))).toEqual(new Set(["p36_global_triage_append_v1"]));
    expect(
      r.calls.every(
        (c) => c.args.p_mission_id === "MITO_DEMO_2026" && c.args.p_provenance === "synthetic",
      ),
    ).toBe(true);
    expect(r.calls.map((c) => c.args.p_expected_previous_event_id)).toEqual([null, UUID(7)]);
  });

  it("derives deterministic idempotency keys, so a retry is a duplicate rather than a second write", async () => {
    const a = recorder(() => ({ data: { status: "recorded", event_id: UUID(5) }, error: null }));
    const b = recorder(() => ({ data: { status: "duplicate", event_id: UUID(5) }, error: null }));
    await bulkTriageCore(a.rpc, "user-1", input);
    const res = await bulkTriageCore(b.rpc, "user-1", input);
    expect(a.calls.map((c) => c.args.p_idempotency_key)).toEqual(
      b.calls.map((c) => c.args.p_idempotency_key),
    );
    expect(res.ok && res.results.map((x) => x.status)).toEqual(["duplicate", "duplicate"]);
    const other = recorder(() => ({
      data: { status: "recorded", event_id: UUID(5) },
      error: null,
    }));
    await bulkTriageCore(other.rpc, "user-2", input);
    expect(other.calls[0]!.args.p_idempotency_key).not.toBe(a.calls[0]!.args.p_idempotency_key);
  });

  it("maps already-accepted to already completed and stale to retryable", async () => {
    let i = 0;
    const r = recorder(() =>
      i++ === 0
        ? {
            data: { status: "rejected", detail: "already accepted for scientific review" },
            error: null,
          }
        : {
            data: { status: "stale", detail: "another triage decision was recorded first" },
            error: null,
          },
    );
    const res = await bulkTriageCore(r.rpc, "u", input);
    expect(res.ok && res.results.map((x) => x.status)).toEqual(["skipped", "stale"]);
  });

  it("stops on a caller-wide authorization refusal and validates evidence requests before any call", async () => {
    const r = recorder(() => ({ data: null, error: { code: "42501" } }));
    const res = await bulkTriageCore(r.rpc, "u", input);
    expect(res.ok).toBe(false);
    expect(r.calls.length).toBe(1);
    const none = recorder(() => ({ data: null, error: null }));
    const bad = await bulkTriageCore(none.rpc, "u", {
      ...input,
      action: "REQUEST_MORE_EVIDENCE",
      reason: "too short",
      evidenceRequirements: [],
    });
    expect(bad.ok).toBe(false);
    expect(none.calls.length).toBe(0);
  });

  it("rejects a malformed receipt instead of assuming success", async () => {
    const r = recorder(() => ({ data: { status: "recorded" }, error: null }));
    expect((await bulkTriageCore(r.rpc, "u", input)).ok).toBe(false);
  });
});

describe("P55 boundaries", () => {
  const files = [
    "src/domain/health-intelligence/p55-bulk-selection-engine.ts",
    "src/domain/health-intelligence/p55-bulk-actions.ts",
    "src/lib/p55-bulk-triage.server.ts",
    "src/components/p55-bulk-controls.tsx",
  ].map((f) => readFileSync(join(ROOT, f), "utf8"));

  it("never touches offline observation stores, review ledgers, the service role or approval/activation RPCs", () => {
    for (const s of files) {
      expect(s).not.toMatch(/observation-store|review-ledger-store|client\.server|supabaseAdmin/);
      expect(s).not.toMatch(
        /p37_demo_activate|p38_demo_bulk_activate|scientific_authorization_append|catalog_activate/,
      );
    }
  });

  it("offers no bulk rejection of review requests", () => {
    const fn = readFileSync(join(ROOT, "src/lib/p55-bulk-triage.functions.ts"), "utf8");
    expect(fn).toContain('z.enum(["ACCEPT_FOR_REVIEW", "REQUEST_MORE_EVIDENCE"])');
    expect(fn).not.toContain("REJECT_REVIEW_REQUEST");
  });
});
