/**
 * Governed registry of verified code revisions for P36 catalog promotion.
 *
 * The registry is the ONLY source of revisions the promotion UI may offer.
 * It starts empty: no commit has independently verifiable CI evidence yet,
 * and revisions are never generated, guessed or accepted from free text.
 * Any tampering (unknown fields, malformed hashes, missing evidence) fails
 * closed: the registry reads as empty and the problems are reported.
 */
import { z } from "zod";
import registryJson from "../../../data/scientific/p36-verified-revisions.v1.json";

export const VERIFIED_REVISIONS_SCHEMA = "mitochondria.p36-verified-revisions.v1";

const revisionSchema = z
  .object({
    /** Exact 40-character lowercase hex commit whose gates passed on that exact commit. */
    revision: z.string().regex(/^[0-9a-f]{40}$/),
    /** ISO instant of the successful verification run. */
    verifiedAt: z.string().refine((v) => Number.isFinite(Date.parse(v)), "invalid time"),
    /** Who/what verified (e.g. the CI workflow identity), recorded as declared. */
    verifier: z.string().min(1).max(200),
    /** Independently reviewable evidence (CI run URLs, sealed manifests); at least one. */
    evidenceRefs: z.array(z.string().min(1).max(500)).min(1).max(50),
    note: z.string().max(500).optional(),
  })
  .strict();

const registrySchema = z
  .object({
    schema: z.literal(VERIFIED_REVISIONS_SCHEMA),
    governance: z.string().min(1),
    revisions: z.array(revisionSchema).max(1000),
  })
  .strict();

export type VerifiedRevision = z.infer<typeof revisionSchema>;

export interface VerifiedRevisionsView {
  revisions: VerifiedRevision[];
  problems: string[];
}

export function loadVerifiedRevisions(input: unknown = registryJson): VerifiedRevisionsView {
  const parsed = registrySchema.safeParse(input);
  if (!parsed.success) {
    return {
      revisions: [],
      problems: parsed.error.issues.map((i) => `${i.path.join(".") || "registry"}: ${i.message}`),
    };
  }
  const seen = new Set<string>();
  const problems: string[] = [];
  for (const r of parsed.data.revisions) {
    if (seen.has(r.revision)) problems.push(`duplicate revision ${r.revision.slice(0, 12)}…`);
    seen.add(r.revision);
  }
  // Any integrity problem fails the WHOLE registry closed: a tampered registry
  // must not still offer its remaining entries as verified choices.
  if (problems.length) return { revisions: [], problems: [...problems, "registry rejected"] };
  return { revisions: [...parsed.data.revisions], problems };
}

/** True only when the exact revision is present in the governed registry. */
export function isVerifiedRevision(revision: string, view: VerifiedRevisionsView = loadVerifiedRevisions()): boolean {
  return view.revisions.some((r) => r.revision === revision);
}
