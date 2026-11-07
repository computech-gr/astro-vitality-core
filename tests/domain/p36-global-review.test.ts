import { describe, expect, test } from "bun:test";
import { listGlobalReviewMissionsCore, listGlobalReviewSubmissionsCore, cleanSubmission } from "../../src/lib/p36-global-review.server";
import { ALL_CREWS, ALL_MISSIONS, dashboardCounts, filterTerms, flattenTerms, groupByMissionAndCrew, missionsForSelection, paginate, sortTerms } from "../../src/lib/p36-global-review-view";
import type { GlobalReviewSubmission } from "../../src/lib/p36-global-review.server";
import type { Rpc } from "../../src/lib/p36-scientific-authorization.server";

const hex = (c: string) => c.repeat(64);
const term = (i: number, decision: string | null = null) => ({
  termId: `ubt-${String(i).padStart(8, "0")}`, originalLabels: [`Label ${i}`], exactUnit: "ng/mL", classification: "unclassified",
  candidateMetricIds: [], sourceDocumentSha256: [hex("a")], evidencePointers: [hex("b")], method: null, specimen: null, decision,
});
const sub = (seq: number, requestId: string, n: number, extra: Record<string, unknown> = {}) => ({
  submission_id: `s-${seq}`, mission_id: "M1", mission_code: "DEMO", mission_name: "Demo", crew_pseudonym: "crew-p-0123456789abcdef",
  provenance: "synthetic", request_id: requestId, submitted_role: "ground_medical", received_at: "2026-11-07T08:30:16Z",
  received_seq: seq, payload_sha256: hex("c"), access_basis: "global_scientific_review",
  terms: Array.from({ length: n }, (_, i) => term(seq * 1000 + i)), ...extra,
});
const rpcReturning = (data: unknown, error: { code?: string } | null = null): Rpc => async () => ({ data, error });
const mission = (id: string, basis: "mission_researcher" | "global_scientific_review", pending = 1) =>
  ({ missionId: id, missionCode: id, missionName: id, accessBasis: basis, submissionCount: 1, termCount: pending, pendingTermCount: pending });

describe("P36 global scientific review", () => {
  test("missing migration fails closed without broadening access", async () => {
    const r = await listGlobalReviewMissionsCore(rpcReturning(null, { code: "PGRST202" }), "synthetic");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("migration_required");
  });

  test("server scope denial is reported as forbidden", async () => {
    const r = await listGlobalReviewSubmissionsCore(rpcReturning(null, { code: "42501" }), "M2", "synthetic");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("forbidden");
  });

  test("reads both the 12-term and 197-term submissions as 209 terms", async () => {
    const r = await listGlobalReviewSubmissionsCore(rpcReturning([sub(1, "ubr-19aa5a1e", 12), sub(2, "ubr-8b1514d8", 197)]), "M1", "synthetic");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.submissions.map((s) => s.requestId)).toEqual(["ubr-19aa5a1e", "ubr-8b1514d8"]);
    expect(r.submissions.reduce((n, s) => n + s.terms.length, 0)).toBe(209);
  });

  test("a row carrying a crew ID, submitter or canonical payload is rejected", () => {
    expect(cleanSubmission(sub(1, "ubr-19aa5a1e", 1, { crew_member_id: "crew-x" }), "M1", "synthetic")).toBeNull();
    expect(cleanSubmission(sub(1, "ubr-19aa5a1e", 1, { submitted_by: "u" }), "M1", "synthetic")).toBeNull();
    expect(cleanSubmission(sub(1, "ubr-19aa5a1e", 1, { payload_canonical: "{}" }), "M1", "synthetic")).toBeNull();
    const withExtraTermField = { ...sub(1, "ubr-19aa5a1e", 0), terms: [{ ...term(1), value: "42" }] };
    expect(cleanSubmission(withExtraTermField, "M1", "synthetic")).toBeNull();
  });

  test("a row for another mission or provenance is rejected", () => {
    expect(cleanSubmission(sub(1, "ubr-19aa5a1e", 1), "M2", "synthetic")).toBeNull();
    expect(cleanSubmission(sub(1, "ubr-19aa5a1e", 1), "M1", "real")).toBeNull();
  });

  test("All missions is available only to a global reviewer", () => {
    const own = [mission("M1", "mission_researcher")];
    expect(missionsForSelection(own, ALL_MISSIONS)).toEqual([]);
    const global = [mission("M1", "global_scientific_review"), mission("M2", "mission_researcher")];
    expect(missionsForSelection(global, ALL_MISSIONS).length).toBe(2);
    expect(missionsForSelection(global, "M9")).toEqual([]);
  });

  test("groups by mission and crew pseudonym and counts approved/rejected as decided", async () => {
    const decided = { ...sub(3, "ubr-0000aaaa", 0), terms: [term(1, "APPROVE"), term(2, "REQUEST_MORE_EVIDENCE"), term(3)] };
    const r = await listGlobalReviewSubmissionsCore(rpcReturning([sub(1, "ubr-19aa5a1e", 12), decided]), "M1", "synthetic");
    if (!r.ok) throw Error("expected ok");
    const [g] = groupByMissionAndCrew(r.submissions);
    expect(g?.crews.length).toBe(1);
    expect(g?.termCount).toBe(15);
    expect(g?.pendingTermCount).toBe(14);
  });
});

describe("P36 global review dashboard", () => {
  const subs = [sub(1, "ubr-19aa5a1e", 12), sub(2, "ubr-8b1514d8", 197)]
    .map((r) => cleanSubmission(r, "M1", "synthetic") as GlobalReviewSubmission);
  const rows = flattenTerms(subs);
  const all = { query: "", crew: ALL_CREWS, state: "all" as const, classification: "all" };

  test("209 pending terms count as awaiting triage and activation-blocked, never approved", () => {
    const c = dashboardCounts(rows);
    expect(c).toEqual({ submittedTerms: 209, pending: 209, awaitingTriage: 209, accepted: 0, moreEvidence: 0, rejected: 0, approved: 0, activationBlocked: 209 });
  });

  test("search by request ID returns only that receipt's 12 terms", () => {
    expect(filterTerms(rows, { ...all, query: "ubr-19aa5a1e" }).length).toBe(12);
  });

  test("an unknown crew pseudonym matches nothing", () => {
    expect(filterTerms(rows, { ...all, crew: "crew-p-ffffffffffffffff" })).toEqual([]);
  });

  test("pagination of 209 terms at 25 per page gives 9 pages and clamps past the end", () => {
    const p = paginate(sortTerms(rows, "term"), 99, 25);
    expect(p.pages).toBe(9);
    expect(p.page).toBe(9);
    expect(p.items.length).toBe(9);
  });
});
