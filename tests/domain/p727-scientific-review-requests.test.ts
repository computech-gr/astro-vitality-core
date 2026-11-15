/** P72.7 Scientific Review request visibility: the six ubr-* requests and their 243 terms. */
import { describe, expect, test } from "bun:test";
import { listGlobalReviewSubmissionsCore, type GlobalReviewMission } from "../../src/lib/p36-global-review.server";
import {
  ALL_CREWS,
  ALL_REQUESTS,
  defaultMissionSelection,
  filterTerms,
  flattenTerms,
  requestStatus,
  summarizeRequests,
} from "../../src/lib/p36-global-review-view";
import type { Rpc } from "../../src/lib/p36-scientific-authorization.server";
import type { TriageEvent } from "../../src/lib/p36-global-triage-rules";

const hex = (c: string) => c.repeat(64);
const SIX: [string, number, string][] = [
  ["ubr-19aa5a1e", 12, "2026-11-07T08:30:16Z"],
  ["ubr-8b1514d8", 197, "2026-11-07T08:30:39Z"],
  ["ubr-7818f4ad", 11, "2026-11-12T18:10:35Z"],
  ["ubr-bb177779", 15, "2026-11-12T21:08:59Z"],
  ["ubr-d9851dd7", 1, "2026-11-14T10:02:13Z"],
  ["ubr-6a205852", 7, "2026-11-15T01:28:31Z"],
];
const row = (seq: number, requestId: string, n: number, receivedAt: string) => ({
  submission_id: `00000000-0000-4000-8000-00000000000${seq}`, mission_id: "M-DEMO", mission_code: "MITO_DEMO_2026",
  mission_name: "Demo", crew_pseudonym: "crew-p-0123456789abcdef", provenance: "synthetic", request_id: requestId,
  submitted_role: "ground_medical", received_at: receivedAt, received_seq: seq, payload_sha256: hex("c"),
  access_basis: "global_scientific_review",
  terms: Array.from({ length: n }, (_, i) => ({
    termId: `ubt-${(seq * 1000 + i).toString(16).padStart(8, "0")}`, originalLabels: [`Label ${seq}-${i}`], exactUnit: "ng/mL",
    classification: "unclassified", candidateMetricIds: [], sourceDocumentSha256: [hex("a")], evidencePointers: [hex("b")],
    method: null, specimen: null, decision: null,
  })),
});
// Server pages 25 rows at a time; six rows arrive in one page.
const rpc: Rpc = async (_fn, args) => ({
  data: (args as { p_after_seq: number }).p_after_seq === 0 ? SIX.map(([id, n, at], i) => row(i + 1, id, n, at)) : [],
  error: null,
});
const mission = (id: string, submissionCount: number): GlobalReviewMission => ({
  missionId: id, missionCode: id, missionName: id, accessBasis: "global_scientific_review", submissionCount,
  termCount: submissionCount, pendingTermCount: submissionCount,
});
const accept = (submissionId: string, termId: string): TriageEvent =>
  ({ eventId: `e-${termId}`, submissionId, termId, action: "ACCEPT_FOR_REVIEW" } as unknown as TriageEvent);

async function loadSix() {
  const r = await listGlobalReviewSubmissionsCore(rpc, "M-DEMO", "synthetic");
  if (!r.ok) throw Error("load failed");
  return r.submissions;
}

describe("P72.7 submitted review requests", () => {
  test("all six original ubr-* request IDs are listed with their 243 terms", async () => {
    const requests = summarizeRequests(await loadSix());
    expect(requests.map((r) => r.requestId)).toEqual(SIX.map(([id]) => id));
    expect(requests.map((r) => r.termCount)).toEqual([12, 197, 11, 15, 1, 7]);
    expect(requests.reduce((n, r) => n + r.termCount, 0)).toBe(243);
  });

  test("each request keeps its exact receipt time and originating role", async () => {
    const requests = summarizeRequests(await loadSix());
    expect(requests.map((r) => r.receivedAt)).toEqual(SIX.map(([, , at]) => at));
    expect(new Set(requests.map((r) => r.submittedRole))).toEqual(new Set(["ground_medical"]));
  });

  test("opening one request shows only that request's terms (the 1-term ubr-d9851dd7 included)", async () => {
    const subs = await loadSix();
    const rows = flattenTerms(subs);
    const only = (request: string) =>
      filterTerms(rows, { query: "", crew: ALL_CREWS, state: "all", classification: "all", request });
    const d9 = subs.find((s) => s.requestId === "ubr-d9851dd7")!;
    expect(only(d9.submissionId).map((r) => r.submission.requestId)).toEqual(["ubr-d9851dd7"]);
    expect(only(subs.find((s) => s.requestId === "ubr-8b1514d8")!.submissionId)).toHaveLength(197);
    expect(only(ALL_REQUESTS)).toHaveLength(243);
  });

  test("triage acceptance of every term is reported as pending scientific decision, never approved", async () => {
    const subs = await loadSix();
    const s = subs[0]!;
    const triage = new Map(s.terms.map((t) => [`${s.submissionId}:${t.termId}`, accept(s.submissionId, t.termId)]));
    const first = summarizeRequests([s], triage)[0]!;
    expect(first.triage.accepted).toBe(12);
    expect(first.scientific.approved).toBe(0);
    expect(first.status).toBe("pending_scientific_decision");
  });

  test("request status follows recorded triage and decisions only", () => {
    const none = { awaiting_triage: 0, accepted: 0, more_evidence: 0, rejected: 0 };
    expect(requestStatus(7, { ...none, awaiting_triage: 7 }, { pending: 7, approved: 0, rejected: 0 })).toBe("awaiting_triage");
    expect(requestStatus(7, { ...none, awaiting_triage: 2, accepted: 5 }, { pending: 7, approved: 0, rejected: 0 })).toBe("triage_in_progress");
    expect(requestStatus(7, { ...none, accepted: 7 }, { pending: 0, approved: 6, rejected: 1 })).toBe("scientific_decisions_recorded");
  });

  test("synthetic demo counts are per request and unknown when the lifecycle is unavailable", async () => {
    const subs = await loadSix();
    const s = subs[2]!; // ubr-7818f4ad, 11 terms
    const facts = s.terms.slice(0, 3).map((t, i) => ({
      submissionId: s.submissionId, termId: t.termId, activationEventId: i < 2 ? `a${i}` : null, revocationEventId: i === 1 ? "r1" : null,
    }));
    const withDemo = summarizeRequests([s], new Map(), new Map([["M-DEMO", facts]]))[0]!;
    expect(withDemo.demo).toEqual({ decided: 3, active: 1, revoked: 1 });
    expect(summarizeRequests([s], new Map(), new Map([["M-DEMO", null]]))[0]!.demo).toBeNull();
  });

  test("the mission holding submissions is preselected; ambiguous choices stay unselected", () => {
    expect(defaultMissionSelection([mission("FV01-TEST-B", 0), mission("MITO_DEMO_2026", 6)])).toBe("MITO_DEMO_2026");
    expect(defaultMissionSelection([mission("A", 2), mission("B", 3)])).toBe("");
    expect(defaultMissionSelection([mission("ONLY", 0)])).toBe("ONLY");
    expect(defaultMissionSelection([])).toBe("");
  });
});
