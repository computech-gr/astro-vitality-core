import { z } from "zod";
import type { SyntheticEvidenceSnapshot } from "./synthetic-evidence";
import { canonicalSyntheticJson, syntheticSha256 } from "./synthetic-evidence";

const utc = z
  .string()
  .refine(
    (s) => /(?:Z|\+00:00)$/.test(s) && Number.isFinite(Date.parse(s)),
    "UTC timestamp required",
  );
const sha = z.string().regex(/^sha256-[a-f0-9]{64}$/);
const event = z.object({
  id: z.uuid(),
  mission_id: z.string(),
  crew_member_id: z.string(),
  provenance: z.literal("synthetic"),
  actor_user_id: z.string().regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i),
  event_type: z.enum(["draft_created", "returned", "approved", "revoked", "superseded", "stale"]),
  revision: z.number().int().positive(),
  previous_event_id: z.uuid().nullable(),
  evidence_sha256: sha,
  draft_text: z.string().max(12000),
  final_text: z.string().max(12000),
  rationale: z.string().max(2000),
  created_at: utc,
  verified_current: z.boolean(),
});

/** Integrity checking is not authority: callers must use a fresh authorized server RPC. */
export async function validateSyntheticSnapshot(raw: unknown): Promise<SyntheticEvidenceSnapshot> {
  const snapshot = z
    .object({
      missionId: z.string().min(1),
      crewMemberId: z.string().min(1),
      canonical: z.string().min(1),
      sha256: sha,
      evidence: z
        .array(
          z.object({
            id: z.string().min(1),
            metric: z.string().min(1),
            value: z.string(),
            unit: z.string(),
            time: utc,
            domain: z.string(),
          }),
        )
        .min(1)
        .max(120),
    })
    .parse(raw);
  const doc = JSON.parse(snapshot.canonical);
  if (
    doc.schema !== "mitochondria.synthetic-evidence.v2" ||
    doc.provenance !== "synthetic" ||
    doc.missionId !== snapshot.missionId ||
    doc.crewMemberId !== snapshot.crewMemberId ||
    canonicalSyntheticJson(doc) !== snapshot.canonical ||
    (await syntheticSha256(snapshot.canonical)) !== snapshot.sha256 ||
    !Array.isArray(doc.observations)
  )
    throw new Error("Invalid authoritative synthetic evidence.");
  const evidence = doc.observations.map((o: Record<string, unknown>) => ({
    id: o['id'],
    metric: o['metric'],
    value: o['value'],
    unit: o['unit'],
    time: o['time'],
    domain: o['domain'],
  }));
  if (
    JSON.stringify(evidence) !== JSON.stringify(snapshot.evidence) ||
    new Set(snapshot.evidence.map((o) => o.id)).size !== snapshot.evidence.length
  )
    throw new Error("Synthetic evidence fields do not match canonical bytes.");
  return snapshot;
}

export function buildSyntheticReviewExport(
  snapshot: SyntheticEvidenceSnapshot,
  raw: unknown,
  exportedAt: string,
) {
  const events = z
    .array(event)
    .parse(raw)
    .sort((a, b) => a.revision - b.revision);
  utc.parse(exportedAt);
  const revisions = new Set<number>();
  const ids = new Set<string>();
  for (const e of events) {
    if (
      e.mission_id !== snapshot.missionId ||
      e.crew_member_id !== snapshot.crewMemberId ||
      revisions.has(e.revision) ||
      ids.has(e.id) ||
      Date.parse(e.created_at) > Date.parse(exportedAt) ||
      (e.verified_current &&
        (e.event_type !== "approved" ||
          e.evidence_sha256 !== snapshot.sha256 ||
          e.revision !== events.at(-1)?.revision))
    )
      throw new Error("Invalid or mismatched authorized review history.");
    revisions.add(e.revision);
    ids.add(e.id);
  }
  return {
    schema: "mitochondria.synthetic-medical-review-export.v1",
    research_only: true,
    synthetic_only: true,
    not_a_medical_signature: true,
    exported_at: exportedAt,
    mission_id: snapshot.missionId,
    crew_member_id: snapshot.crewMemberId,
    current_evidence_sha256: snapshot.sha256,
    events,
  };
}
