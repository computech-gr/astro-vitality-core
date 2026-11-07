import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

const provenance = z.enum(["synthetic", "real"]);
const uuid = z.string().uuid();

/** Approvals, activations, revocations and receipt metadata for one authorized mission, plus caller capabilities. */
export const getCatalogLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ missionId: z.string().min(1).max(100), provenance }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { catalogLifecycleCore } = await import("./p37-catalog.server");
    return catalogLifecycleCore(rpc, data.missionId, data.provenance);
  });

/** Scientific approval of a new biomarker (separate approver grant); derives the catalog proposal server-side. */
export const approveNewBiomarkerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: z.string().min(1).max(100),
        provenance,
        submissionId: uuid,
        termId: z.string().regex(/^ubt-[0-9a-f]{8}$/),
        validationReference: z.string().min(1).max(500),
        canonicalName: z.string().min(3).max(120),
        domain: z.enum(["bone", "immune", "cardiovascular", "behavioral"]),
        idempotencyKey: uuid,
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { approveCore } = await import("./p37-catalog.server");
    return approveCore(rpc, data);
  });

/** Separate catalog activation (activator grant, different identity, exact proposal digest). */
export const activateCatalogEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        approvalEventId: uuid,
        expectedEntrySha256: z.string().regex(/^[0-9a-f]{64}$/),
        idempotencyKey: uuid,
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { activateCore } = await import("./p37-catalog.server");
    return activateCore(rpc, data);
  });

export const revokeCatalogEntryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        activationEventId: uuid,
        reason: z.string().min(8).max(2000),
        idempotencyKey: uuid,
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { revokeCore } = await import("./p37-catalog.server");
    return revokeCore(rpc, data);
  });

/** Public verification key of the provisioned signing secret (the secret itself never leaves the server). */
export const getCatalogSigningPublicKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { signingPublicKeyCore } = await import("./p37-catalog.server");
    return signingPublicKeyCore(
      process.env["P37_CATALOG_SIGNING_KEY"],
      process.env["P37_CATALOG_SIGNING_KEY_ID"],
    );
  });

/** Server-signed snapshot of activated catalog entries for offline devices. */
export const getSignedCatalogSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { signedSnapshotCore } = await import("./p37-catalog.server");
    return signedSnapshotCore(
      rpc,
      process.env["P37_CATALOG_SIGNING_KEY"],
      process.env["P37_CATALOG_SIGNING_KEY_ID"],
      () => new Date().toISOString(),
    );
  });
