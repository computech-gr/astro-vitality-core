/**
 * P36 final scientific authorization server functions (explicit user actions only).
 * Identity comes from the verified bearer JWT (requireSupabaseAuth); the database
 * re-derives auth.uid() and the mission role. Until the owner applies
 * supabase/pending/20261104000000_p36_scientific_authorization.sql every call
 * returns code "migration_required" and nothing is recorded.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

const mission = z.string().min(1).max(128);
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const shortText = z.string().max(500);
const nullableText = z.string().max(500).nullable();
const refs = z.array(z.string().min(1).max(300)).max(30);

export const submitInput = z
  .object({
    termId: z.string().regex(/^ubt-[0-9a-f]{8}$/),
    kind: z.enum(["recommendation", "decision"]),
    action: z.enum(["RECOMMEND", "APPROVE", "REJECT", "REQUEST_MORE_EVIDENCE"]),
    actorRole: z.enum(["ground_medical", "researcher"]),
    authorityMissionId: mission,
    submissionId: z.string().uuid(),
    canonicalCatalogId: z.string().max(64).nullable(),
    domain: z.string().max(64).nullable(),
    specimenOrAcquisitionContext: nullableText,
    methodOrInstrument: nullableText,
    protocol: nullableText,
    protocolVersion: z.string().max(120).nullable(),
    validatedUnit: z.string().max(40).nullable(),
    sourceRefs: refs,
    validationEvidenceRefs: refs,
    rationale: z.string().max(4000),
    reviewerName: z.string().max(200),
    reviewerQualification: z.string().max(300),
    conflictOfInterestDeclaration: shortText,
    independenceConfirmed: z.boolean(),
    recommendationEventId: hex.nullable(),
    supersedesEventId: hex.nullable(),
  })
  .strict();

export const listScientificAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ missionId: mission }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { listAuthorizationCore } = await import("./p36-scientific-authorization.server");
    return listAuthorizationCore({ rpc }, data.missionId);
  });

export const submitScientificAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitInput.parse(input))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { submitAuthorizationCore } = await import("./p36-scientific-authorization.server");
    return submitAuthorizationCore({ rpc, userId: context.userId, now: () => new Date().toISOString() }, data);
  });
