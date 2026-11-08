import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Rpc } from "./p36-scientific-authorization.server";

/** One bounded batch (1–50) of synthetic-mission triage: accept for review or request more evidence. */
export const bulkGlobalTriageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        missionId: z.string().min(1).max(100),
        action: z.enum(["ACCEPT_FOR_REVIEW", "REQUEST_MORE_EVIDENCE"]),
        reason: z.string().max(2000).nullable(),
        evidenceRequirements: z
          .array(z.enum(["identity", "unit", "method", "specimen", "protocol", "source_validation", "other"]))
          .max(7),
        items: z
          .array(
            z.object({
              submissionId: z.string().uuid(),
              termId: z.string().regex(/^ubt-[0-9a-f]{8}$/),
              expectedPreviousEventId: z.string().uuid().nullable(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const rpc: Rpc = (fn, args) => (context.supabase.rpc as unknown as Rpc).call(context.supabase, fn, args);
    const { bulkTriageCore } = await import("./p55-bulk-triage.server");
    return bulkTriageCore(rpc, context.userId, data);
  });
