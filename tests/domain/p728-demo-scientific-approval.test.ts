/** P72.8 direct Researcher DEMO SCIENTIFIC APPROVAL: rules, server cores and boundaries. */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEMO_SCIENTIFIC_APPROVAL_LABEL,
  demoApproveFit,
  demoRecordsActive,
  demoRejectFit,
  parseDemoDecisionState,
  parseEvidenceRefs,
  rationaleProblem,
  recordedDecisions,
  suggestedEvidenceRefs,
} from "../../src/domain/health-intelligence/p728-demo-approval";
import { declineFit, type GroundRecord } from "../../src/domain/health-intelligence/p55-bulk-actions";
import {
  getDemoDecisionStateCore,
  medicalDemoDecideCore,
  researcherDemoDecideCore,
} from "../../src/lib/p728-demo-decision.server";
import { defaultMissionSelection } from "../../src/lib/p36-global-review-view";
import type { GlobalReviewMission } from "../../src/lib/p36-global-review.server";
import type { Rpc } from "../../src/lib/p36-scientific-authorization.server";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const M = "mission-9d8ce8f3e5554509a0885461f9ad2e1c";
const SUB = "4fc8aee1-deb3-4f4c-9173-46c2a3401fa7";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const row = (over: Partial<Parameters<typeof demoApproveFit>[0]> = {}) => ({
  category: "eligible" as const,
  inScope: false,
  triageAction: "ACCEPT_FOR_REVIEW",
  reasons: [] as string[],
  unit: "mmol/L",
  ...over,
});
const ctx = (over: Partial<Parameters<typeof demoApproveFit>[1]> = {}) => ({
  submittedByCaller: false,
  canDecide: true,
  canAuthorize: true,
  authorizeInstalled: true,
  recorded: null,
  ...over,
});

describe("Demo Scientific Approve eligibility (no source-validation receipt)", () => {
  test("an accepted synthetic term outside the demo scope is approvable in one step", () => {
    expect(demoApproveFit(row(), ctx()).kind).toBe("actionable");
    expect(demoApproveFit(row({ inScope: true }), ctx()).kind).toBe("actionable");
  });
  test("ambiguous units, missing triage, own submissions and missing grants stay blocked", () => {
    expect(demoApproveFit(row({ unit: "pmol/L ή ng/mL" }), ctx()).kind).toBe("blocked");
    expect(demoApproveFit(row({ triageAction: null }), ctx()).kind).toBe("blocked");
    expect(demoApproveFit(row({ triageAction: "REJECT_REVIEW_REQUEST" }), ctx()).kind).toBe("blocked");
    expect(demoApproveFit(row(), ctx({ submittedByCaller: true })).kind).toBe("blocked");
    expect(demoApproveFit(row(), ctx({ canDecide: false })).kind).toBe("blocked");
    expect(demoApproveFit(row(), ctx({ canAuthorize: false })).kind).toBe("blocked");
    expect(demoApproveFit(row({ category: "existing_catalog_match", reasons: ["match"] }), ctx()).kind).toBe("blocked");
  });
  test("recorded decisions are never repeated or reversed", () => {
    expect(demoApproveFit(row(), ctx({ recorded: "APPROVE" })).kind).toBe("already");
    expect(demoApproveFit(row(), ctx({ recorded: "REJECT" })).kind).toBe("blocked");
    expect(demoApproveFit(row({ category: "already_active" }), ctx()).kind).toBe("already");
  });
  test("reject needs the P72.8 record path and an undecided, accepted term", () => {
    const base = { canDecide: true, submittedByCaller: false, recordsInstalled: true, recorded: null };
    expect(demoRejectFit(row(), base).kind).toBe("actionable");
    expect(demoRejectFit(row(), { ...base, recordsInstalled: false }).kind).toBe("blocked");
    expect(demoRejectFit(row({ category: "already_decided" }), base).kind).toBe("blocked");
    expect(demoRejectFit(row(), { ...base, recorded: "REJECT" }).kind).toBe("already");
    expect(demoRejectFit(row(), { ...base, submittedByCaller: true }).kind).toBe("blocked");
  });
});

describe("Ground Medical decline keeps separation of duties", () => {
  const g = (status: GroundRecord["status"]) => ({ status, reason: "", existingMatch: null, row: {} }) as unknown as GroundRecord;
  const c = { canActivate: true, recordsInstalled: true, declined: false, decidedByCaller: false };
  test("an independent Ground Medical member may decline an awaiting approval", () => {
    expect(declineFit(g("awaiting_activation"), c).kind).toBe("actionable");
  });
  test("the decider, non-members, active entries and the missing database change are blocked", () => {
    expect(declineFit(g("awaiting_activation"), { ...c, decidedByCaller: true }).kind).toBe("blocked");
    expect(declineFit(g("awaiting_activation"), { ...c, canActivate: false }).kind).toBe("blocked");
    expect(declineFit(g("already_active"), c).kind).toBe("blocked");
    expect(declineFit(g("awaiting_activation"), { ...c, recordsInstalled: false }).kind).toBe("blocked");
    expect(declineFit(g("awaiting_activation"), { ...c, declined: true }).kind).toBe("already");
  });
});

describe("Rationale and evidence references", () => {
  test("rationale is 8 to 2000 characters after trimming", () => {
    expect(rationaleProblem("  short ")).not.toBeNull();
    expect(rationaleProblem("Exact label and unit match the cited table.")).toBeNull();
    expect(rationaleProblem("x".repeat(2001))).not.toBeNull();
  });
  test("evidence references are trimmed, de-duplicated, sorted and bounded", () => {
    expect(parseEvidenceRefs(" b \na\n\nb").refs).toEqual(["a", "b"]);
    expect(parseEvidenceRefs(Array.from({ length: 21 }, (_, i) => `r${i}`).join("\n")).problem).not.toBeNull();
    expect(parseEvidenceRefs("x".repeat(301)).problem).not.toBeNull();
  });
  test("suggestions cite the original request and source document digests", () => {
    expect(suggestedEvidenceRefs([{ requestId: "ubr-6a205852", sourceDocumentSha256: ["a".repeat(64)] }])).toEqual([
      "request:ubr-6a205852",
      `source-document-sha256:${"a".repeat(64)}`,
    ]);
  });
});

const stateRow = (over: Record<string, unknown> = {}) => ({
  record_id: U(1), record_type: "RESEARCHER_DEMO_APPROVE", submission_id: SUB, term_id: "ubt-4bb60217",
  demo_event_id: U(2), rationale: "Exact label and unit.", evidence_refs: ["request:ubr-6a205852"],
  label: DEMO_SCIENTIFIC_APPROVAL_LABEL, actor_role: "researcher", recorded_by_caller: true, recorded_at: "2026-11-15T07:00:00Z",
  ...over,
});
const state = (records: unknown[], over: Record<string, unknown> = {}) => ({
  mission_id: M, classified: true, problem: null, can_decide: true, can_activate: false, records, ...over,
});

describe("Server state parse fails closed", () => {
  test("valid state parses, and records drive decided maps", () => {
    const s = parseDemoDecisionState(state([stateRow(), stateRow({ record_id: U(3), record_type: "MEDICAL_DEMO_DECLINE", actor_role: "ground_medical", demo_event_id: U(2) })]), M);
    expect(s && demoRecordsActive(s)).toBe(true);
    const d = recordedDecisions(s);
    expect(d.researcher.get(`${SUB}:ubt-4bb60217`)).toBe("APPROVE");
    expect(d.medical.get(`${SUB}:ubt-4bb60217`)).toBe("DECLINE");
  });
  test("a different label, mission, role mismatch or reject with a demo event is refused", () => {
    expect(parseDemoDecisionState(state([stateRow({ label: "SYNTHETIC DEMO" })]), M)).toBeNull();
    expect(parseDemoDecisionState(state([stateRow()]), "other")).toBeNull();
    expect(parseDemoDecisionState(state([stateRow({ actor_role: "ground_medical" })]), M)).toBeNull();
    expect(parseDemoDecisionState(state([stateRow({ record_type: "RESEARCHER_DEMO_REJECT" })]), M)).toBeNull();
  });
  test("an unclassified or mixed-provenance mission is not active", () => {
    expect(demoRecordsActive(parseDemoDecisionState(state([], { classified: false }), M))).toBe(false);
    expect(demoRecordsActive(parseDemoDecisionState(state([], { problem: "mixed provenance" }), M))).toBe(false);
    expect(demoRecordsActive({ installed: false })).toBe(false);
  });
});

describe("Server cores", () => {
  test("state read reports not installed while the pending change is absent", async () => {
    const rpc: Rpc = async () => ({ data: null, error: { code: "PGRST202" } });
    expect(await getDemoDecisionStateCore(rpc, M)).toEqual({ ok: true, installed: false });
  });
  test("researcher decisions require a rationale before any call", async () => {
    let called = false;
    const rpc: Rpc = async () => ((called = true), { data: null, error: null });
    const r = await researcherDemoDecideCore(rpc, U(9), {
      missionId: M, decision: "APPROVE", rationale: "short", evidenceRefs: [],
      items: [{ submissionId: SUB, termId: "ubt-4bb60217", exactUnit: "mmol/L", displayName: "Bicarbonate", domain: "immune" }],
    });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
  test("researcher approve sends the exact request with deterministic keys and maps results", async () => {
    const calls: Record<string, unknown>[] = [];
    const rpc: Rpc = async (fn, args) => {
      calls.push({ fn, ...args });
      const items = args["p_items"] as { submission_id: string; term_id: string }[];
      return {
        data: { mission_id: M, results: items.map((i) => ({ submission_id: i.submission_id, term_id: i.term_id, status: "recorded", record_id: U(5), demo_event_id: U(6) })) },
        error: null,
      };
    };
    const input = {
      missionId: M, decision: "APPROVE" as const, rationale: "  Exact label and unit match.  ", evidenceRefs: ["request:ubr-6a205852"],
      items: [{ submissionId: SUB, termId: "ubt-4bb60217", exactUnit: "mmol/L", displayName: "Bicarbonate", domain: "immune" }],
    };
    const r = await researcherDemoDecideCore(rpc, U(9), input);
    const again = await researcherDemoDecideCore(rpc, U(9), input);
    expect(r.ok && r.results[0]!.eventId).toBe(U(6));
    expect(calls[0]!["fn"]).toBe("p728_demo_researcher_decide_v1");
    expect(calls[0]!["p_rationale"]).toBe("Exact label and unit match.");
    expect(again.ok).toBe(true);
    const key = (c: Record<string, unknown>) => (c["p_items"] as { idempotency_key: string }[])[0]!.idempotency_key;
    expect(key(calls[0]!)).toBe(key(calls[1]!));
  });
  test("approve without a domain is refused before any call", async () => {
    const rpc: Rpc = async () => ({ data: null, error: null });
    const r = await researcherDemoDecideCore(rpc, U(9), {
      missionId: M, decision: "APPROVE", rationale: "Exact label and unit match.", evidenceRefs: [],
      items: [{ submissionId: SUB, termId: "ubt-4bb60217", exactUnit: "mmol/L", displayName: "Bicarbonate", domain: null }],
    });
    expect(r.ok).toBe(false);
  });
  test("medical decisions fail closed with migration required while not installed", async () => {
    const rpc: Rpc = async () => ({ data: null, error: { code: "PGRST202" } });
    const r = await medicalDemoDecideCore(rpc, U(9), {
      missionId: M, decision: "DECLINE", rationale: "Not activated in this demo.", items: [{ decisionEventId: U(2), expectedEntrySha256: "a".repeat(64) }],
    });
    expect(r.ok === false && r.code).toBe("migration_required");
  });
});

describe("Boundaries", () => {
  const sql = src("supabase/pending/20261115020000_p728_demo_scientific_decision.sql");
  test("the change is staged as pending, never an applied migration", () => {
    expect(existsSync(join(ROOT, "supabase/migrations/20261115020000_p728_demo_scientific_decision.sql"))).toBe(false);
    expect(readdirSync(join(ROOT, "drizzle/migrations")).some((f) => f.includes("p728"))).toBe(false);
  });
  test("it never writes production approvals or receipts, and production approval keeps the receipt rule", () => {
    expect(sql).not.toMatch(/insert into public\.p37_catalog_events/i);
    expect(sql).not.toMatch(/insert into public\.p36_dynamic_source_validation/i);
    expect(src("drizzle/migrations/0023_p37_catalog_activation.sql")).toContain(
      "exactly one independently provisioned source-validation receipt is required",
    );
  });
  test("only owner SQL classifies a mission; mixed provenance is refused", () => {
    expect(sql).toContain("revoke all on public.p728_demo_missions, public.p728_demo_review_records from public, anon, authenticated, service_role;");
    expect(sql).toContain("mixed provenance");
    expect(src("supabase/pending/20261115020001_p728_demo_mission.authorize.sql")).toContain("m.code = 'MITO_DEMO_2026'");
  });
  test("the catalog panel opens the only mission with submissions (FV01-TEST-B has none)", () => {
    const m = (id: string, n: number): GlobalReviewMission => ({ missionId: id, missionCode: id, missionName: id, accessBasis: "global_scientific_review", submissionCount: n, termCount: n, pendingTermCount: n });
    expect(defaultMissionSelection([m("FV01-TEST-B", 0), m("MITO_DEMO_2026", 6)])).toBe("MITO_DEMO_2026");
    expect(src("src/components/p37-catalog-panel.tsx")).toContain("defaultMissionSelection(r.missions)");
  });
});
