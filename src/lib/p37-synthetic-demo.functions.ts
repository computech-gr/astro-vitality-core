import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

const uuid = z.string().uuid();
const mission = z.string().min(1).max(100);

/** Owner-scoped demo terms, demo decisions/activations and caller capabilities for one mission. */
export const getSyntheticDemoLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: mission }).parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { demoLifecycleCore } = await import("./p37-synthetic-demo.server");
    return demoLifecycleCore(rpc, data.missionId);
  });

/** Researcher's SYNTHETIC DEMO decision (not a scientific approval; no source receipt). */
export const recordSyntheticDemoDecisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({
      missionId: mission,
      submissionId: uuid,
      termId: z.string().regex(/^ubt-[0-9a-f]{8}$/),
      displayName: z.string().min(3).max(120),
      domain: z.enum(["bone", "immune", "cardiovascular", "behavioral"]),
      acknowledgement: z.string().max(100),
      idempotencyKey: uuid,
    }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { demoDecideCore } = await import("./p37-synthetic-demo.server");
    return demoDecideCore(rpc, data);
  });

/** Ground Medical activation of a synthetic demo decision (different identity, exact digest). */
export const activateSyntheticDemoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ decisionEventId: uuid, expectedEntrySha256: z.string().regex(/^[0-9a-f]{64}$/), idempotencyKey: uuid }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { demoActivateCore } = await import("./p37-synthetic-demo.server");
    return demoActivateCore(rpc, data);
  });

export const revokeSyntheticDemoFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ activationEventId: uuid, reason: z.string().min(8).max(2000), idempotencyKey: uuid }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { demoRevokeCore } = await import("./p37-synthetic-demo.server");
    return demoRevokeCore(rpc, data);
  });

/** Mission-scoped signed synthetic demo catalog for offline devices. */
export const getSignedSyntheticDemoSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ missionId: mission }).parse(v))
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { signedDemoSnapshotCore } = await import("./p37-synthetic-demo.server");
    return signedDemoSnapshotCore(rpc, process.env["P37_CATALOG_SIGNING_KEY"], data.missionId, () => new Date().toISOString());
  });

/** Public verification key of the domain-separated synthetic demo signing key (never the secret). */
export const getSyntheticDemoSigningPublicKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { demoSigningPublicKeyCore } = await import("./p37-synthetic-demo.server");
    return demoSigningPublicKeyCore(process.env["P37_CATALOG_SIGNING_KEY"]);
  });
