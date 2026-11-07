/**
 * Server core for P36 Global Scientific Review (read-only, metadata-only).
 * Calls the caller-scoped RPCs staged in
 * supabase/pending/20261107030000_p36_global_scientific_review.sql as the
 * signed-in user. Re-validates every row against a fixed whitelist so a
 * widened or tampered response can never reach the browser with crew IDs,
 * submitter IDs or canonical payloads. Framework-free for testing.
 */
import { classifyAuthorizationError, failure, type Rpc } from "./p36-scientific-authorization.server";

export type GlobalReviewProvenance = "synthetic" | "real";
export type GlobalReviewBasis = "mission_researcher" | "global_scientific_review";

export interface GlobalReviewMission {
  missionId: string;
  missionCode: string;
  missionName: string;
  accessBasis: GlobalReviewBasis;
  submissionCount: number;
  termCount: number;
  pendingTermCount: number;
}

export interface GlobalReviewTerm {
  termId: string;
  originalLabels: string[];
  exactUnit: string;
  classification: string;
  candidateMetricIds: string[];
  sourceDocumentSha256: string[];
  evidencePointers: string[];
  method: string | null;
  specimen: string | null;
  decision: "APPROVE" | "REJECT" | "REQUEST_MORE_EVIDENCE" | null;
}

export interface GlobalReviewSubmission {
  submissionId: string;
  missionId: string;
  missionCode: string;
  missionName: string;
  crewPseudonym: string;
  provenance: GlobalReviewProvenance;
  requestId: string;
  submittedRole: string;
  receivedAt: string;
  receivedSeq: number;
  payloadSha256: string;
  accessBasis: GlobalReviewBasis;
  terms: GlobalReviewTerm[];
}

const MIGRATION_MESSAGE =
  "Global scientific review is not installed yet: the owner-approved database change has not been applied. No access was broadened.";

const SUBMISSION_KEYS = "access_basis,crew_pseudonym,mission_code,mission_id,mission_name,payload_sha256,provenance,received_at,received_seq,request_id,submission_id,submitted_role,terms";
const TERM_KEYS = "candidateMetricIds,classification,decision,evidencePointers,exactUnit,method,originalLabels,sourceDocumentSha256,specimen,termId";
const HEX64 = /^[0-9a-f]{64}$/;
const isStr = (v: unknown): v is string => typeof v === "string";
const strList = (v: unknown, test: (s: string) => boolean = () => true): string[] | null =>
  Array.isArray(v) && v.every((s) => isStr(s) && test(s)) ? (v as string[]) : null;
const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);
const basis = (v: unknown): GlobalReviewBasis | null =>
  v === "mission_researcher" || v === "global_scientific_review" ? v : null;

function fail(code: string | undefined) {
  const c = classifyAuthorizationError(code);
  if (c === "migration_required") return failure(c, MIGRATION_MESSAGE);
  if (c === "forbidden") return failure(c, "This account is not authorized for scientific review of that mission. No access was broadened.");
  return failure(c);
}

export function cleanMission(r: unknown): GlobalReviewMission | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  const accessBasis = basis(o["access_basis"]);
  const submissionCount = count(o["submission_count"]);
  const termCount = count(o["term_count"]);
  const pendingTermCount = count(o["pending_term_count"]);
  if (!isStr(o["mission_id"]) || !isStr(o["mission_code"]) || !isStr(o["mission_name"]) || !accessBasis
    || submissionCount === null || termCount === null || pendingTermCount === null || pendingTermCount > termCount) return null;
  return { missionId: o["mission_id"], missionCode: o["mission_code"], missionName: o["mission_name"], accessBasis, submissionCount, termCount, pendingTermCount };
}

function cleanTerm(r: unknown): GlobalReviewTerm | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (Object.keys(o).sort().join(",") !== TERM_KEYS) return null;
  const originalLabels = strList(o["originalLabels"]);
  const candidateMetricIds = strList(o["candidateMetricIds"]);
  const sourceDocumentSha256 = strList(o["sourceDocumentSha256"], (s) => HEX64.test(s));
  const evidencePointers = strList(o["evidencePointers"], (s) => HEX64.test(s));
  const decision = o["decision"];
  if (!isStr(o["termId"]) || !/^ubt-[0-9a-f]{8}$/.test(o["termId"]) || !originalLabels || !isStr(o["exactUnit"]) || !isStr(o["classification"])
    || !candidateMetricIds || !sourceDocumentSha256 || !evidencePointers
    || (o["method"] !== null && !isStr(o["method"])) || (o["specimen"] !== null && !isStr(o["specimen"]))
    || (decision !== null && decision !== "APPROVE" && decision !== "REJECT" && decision !== "REQUEST_MORE_EVIDENCE")) return null;
  return {
    termId: o["termId"], originalLabels, exactUnit: o["exactUnit"], classification: o["classification"], candidateMetricIds,
    sourceDocumentSha256, evidencePointers, method: (o["method"] as string | null), specimen: (o["specimen"] as string | null),
    decision: decision as GlobalReviewTerm["decision"],
  };
}

export function cleanSubmission(r: unknown, missionId: string, provenance: GlobalReviewProvenance): GlobalReviewSubmission | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  if (Object.keys(o).sort().join(",") !== SUBMISSION_KEYS) return null;
  const accessBasis = basis(o["access_basis"]);
  const seq = o["received_seq"];
  if (o["mission_id"] !== missionId || o["provenance"] !== provenance || !accessBasis
    || !isStr(o["submission_id"]) || !isStr(o["mission_code"]) || !isStr(o["mission_name"])
    || !isStr(o["crew_pseudonym"]) || !/^crew-p-[0-9a-f]{16}$/.test(o["crew_pseudonym"])
    || !isStr(o["request_id"]) || !/^ubr-[0-9a-f]{8}$/.test(o["request_id"])
    || !isStr(o["submitted_role"]) || !isStr(o["received_at"]) || !isStr(o["payload_sha256"]) || !HEX64.test(o["payload_sha256"])
    || typeof seq !== "number" || !Number.isSafeInteger(seq) || !Array.isArray(o["terms"])) return null;
  const terms: GlobalReviewTerm[] = [];
  for (const t of o["terms"]) { const c = cleanTerm(t); if (!c) return null; terms.push(c); }
  return {
    submissionId: o["submission_id"], missionId, missionCode: o["mission_code"], missionName: o["mission_name"],
    crewPseudonym: o["crew_pseudonym"], provenance, requestId: o["request_id"], submittedRole: o["submitted_role"],
    receivedAt: o["received_at"], receivedSeq: seq, payloadSha256: o["payload_sha256"], accessBasis, terms,
  };
}

export async function listGlobalReviewMissionsCore(rpc: Rpc, provenance: GlobalReviewProvenance) {
  const { data, error } = await rpc("p36_global_review_missions_v1", { p_provenance: provenance });
  if (error) return fail(error.code);
  if (!Array.isArray(data)) return failure("integrity", "The mission list failed verification. Nothing is shown.");
  const missions: GlobalReviewMission[] = [];
  for (const row of data) {
    const m = cleanMission(row);
    if (!m) return failure("integrity", "The mission list failed verification. Nothing is shown.");
    missions.push(m);
  }
  return { ok: true as const, missions };
}

const PAGE = 25;
export async function listGlobalReviewSubmissionsCore(rpc: Rpc, missionId: string, provenance: GlobalReviewProvenance) {
  const submissions: GlobalReviewSubmission[] = [];
  let after = 0;
  for (let page = 0; page < 40; page++) {
    const { data, error } = await rpc("p36_global_review_list_v1", { p_mission_id: missionId, p_provenance: provenance, p_after_seq: after, p_limit: PAGE });
    if (error) return fail(error.code);
    if (!Array.isArray(data)) return failure("integrity", "Submitted metadata failed verification. Nothing is shown.");
    for (const row of data) {
      const s = cleanSubmission(row, missionId, provenance);
      if (!s || s.receivedSeq <= after) return failure("integrity", "Submitted metadata failed verification. Nothing is shown.");
      submissions.push(s);
      after = s.receivedSeq;
    }
    if (data.length < PAGE) return { ok: true as const, submissions };
  }
  return failure("unavailable");
}
