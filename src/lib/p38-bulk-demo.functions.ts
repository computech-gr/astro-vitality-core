import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

const uuid = z.string().uuid();
const mission = z.string().min(1).max(100);
const term = z.string().regex(/^ubt-[0-9a-f]{8}$/);
const batch = <T extends z.ZodTypeAny>(item: T) => z.array(item).min(1).max(50);

/** One bounded batch of ACCEPT_FOR_REVIEW triage for owner-scoped synthetic demo terms. */
export const bulkTriageAcceptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: mission,
        items: batch(
          z.object({
            submissionId: uuid,
            termId: term,
            expectedPreviousEventId: uuid.nullable(),
          }),
        ),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { bulkTriageAcceptCore } = await import("./p38-bulk-demo.server");
    return bulkTriageAcceptCore(rpc, context.userId, data);
  });

/** One bounded batch of SYNTHETIC DEMO decisions (not scientific approvals). */
export const bulkDemoDecideFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: mission,
        acknowledgement: z.string().max(100),
        items: batch(
          z.object({
            submissionId: uuid,
            termId: term,
            displayName: z.string().trim().min(3).max(120),
            domain: z.enum(["bone", "immune", "cardiovascular", "behavioral"]),
          }),
        ),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { bulkDecideCore } = await import("./p38-bulk-demo.server");
    return bulkDecideCore(rpc, context.userId, data);
  });

/** One bounded batch of Ground Medical SYNTHETIC DEMO activations. */
export const bulkDemoActivateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: mission,
        items: batch(
          z.object({
            decisionEventId: uuid,
            expectedEntrySha256: z.string().regex(/^[0-9a-f]{64}$/),
          }),
        ),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) =>
      (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { bulkActivateCore } = await import("./p38-bulk-demo.server");
    return bulkActivateCore(rpc, context.userId, data);
  });
