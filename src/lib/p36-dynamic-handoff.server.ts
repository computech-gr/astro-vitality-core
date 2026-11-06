import { canonicalJson } from "@/domain/health-intelligence/observation-envelope";
import { validateCloudHandoff, mergeCloudTerms, type CloudSubmission, type CloudHandoff } from "@/domain/health-intelligence/p36-cloud-handoff";
import { sha256Hex } from "@/domain/health-intelligence/p36-scientific-authorization";
import { classifyAuthorizationError, failure, type Rpc } from "./p36-scientific-authorization.server";
import type { ReviewScope } from "@/domain/health-intelligence/unknown-biomarker-review";

export async function submitHandoffCore(rpc: Rpc, handoff: CloudHandoff) {
  const value = validateCloudHandoff(handoff);
  const canonical = canonicalJson(value);
  const sha = await sha256Hex(canonical);
  const { data, error } = await rpc("p36_dynamic_handoff_append_v1", { p_mission_id: value.scope.missionId, p_crew_member_id: value.scope.crewMemberId, p_provenance: value.scope.provenance, p_request_id: value.requestId, p_payload_canonical: canonical, p_payload_sha256: sha });
  if (error) return failure(classifyAuthorizationError(error.code));
  const r = data as Record<string, unknown> | null;
  if (!r || !["inserted", "duplicate", "conflict"].includes(String(r["status"]))) return failure("unavailable");
  return { ok: true as const, status: r["status"] as "inserted" | "duplicate" | "conflict", payloadSha256: sha, submissionId: String(r["submission_id"] ?? ""), receivedAt: String(r["received_at"] ?? "") };
}

export async function listHandoffCore(rpc: Rpc, scope: ReviewScope) {
  const submissions: CloudSubmission[] = [];
  const payloads: CloudHandoff[] = [];
  let after = 0;
  for (let page = 0; page < 100; page++) {
    const { data, error } = await rpc("p36_dynamic_handoff_list_v1", { p_mission_id: scope.missionId, p_crew_member_id: scope.crewMemberId, p_provenance: scope.provenance, p_after_seq: after, p_limit: 100 });
    if (error) return failure(classifyAuthorizationError(error.code));
    if (!Array.isArray(data)) return failure("integrity");
    try {
      for (const row of data) {
        if (typeof row.payload_canonical !== "string" || await sha256Hex(row.payload_canonical) !== row.payload_sha256 || !Number.isSafeInteger(row.received_seq) || row.received_seq <= after) return failure("integrity");
        const p = validateCloudHandoff(JSON.parse(row.payload_canonical));
        if (canonicalJson(p.scope) !== canonicalJson(scope)) return failure("integrity");
        payloads.push(p);
        submissions.push({ submissionId: row.submission_id, payloadSha256: row.payload_sha256, payloadCanonical: row.payload_canonical, actorUserId: row.submitted_by, receivedAt: row.received_at });
        after = row.received_seq;
      }
    } catch { return failure("integrity"); }
    if (data.length < 100) return { ok: true as const, submissions, ...mergeCloudTerms(payloads) };
  }
  return failure("unavailable");
}