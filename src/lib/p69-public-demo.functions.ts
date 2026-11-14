/**
 * P69/P71 public demo server functions.
 *
 * startPublicDemoRoleFn is intentionally public (one-click entry), default-off
 * behind P69_PUBLIC_DEMO_ENABLED="true" plus a P69_PUBLIC_DEMO_CLIENT_SALT, and
 * rate-limited in the database. It loads the privileged client only inside the
 * handler, after the flag check, and uses it solely for the three server-only
 * provisioning RPCs plus creating/deleting the random demo identity. All other
 * functions require the visitor's own session and run caller-scoped RPCs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DemoRpc } from "./p69-public-demo.server";

const role = z.enum(["astronaut", "researcher", "medical"]);
const key = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

export const getPublicDemoAvailabilityFn = createServerFn({ method: "GET" }).handler(async () => {
  const { isPublicDemoConfigured } = await import("./p69-public-demo.server");
  return {
    enabled: isPublicDemoConfigured(process.env["P69_PUBLIC_DEMO_ENABLED"], process.env["P69_PUBLIC_DEMO_CLIENT_SALT"]),
  };
});

export const startPublicDemoRoleFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z.object({ role, joinCode: z.string().max(32).optional().nullable() }).strict().parse(v),
  )
  .handler(async ({ data }) => {
    const server = await import("./p69-public-demo.server");
    const enabledFlag = process.env["P69_PUBLIC_DEMO_ENABLED"];
    const salt = process.env["P69_PUBLIC_DEMO_CLIENT_SALT"];
    if (!server.isPublicDemoConfigured(enabledFlag, salt)) return server.demoFailure("disabled");

    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const clientAddress =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env["SUPABASE_URL"];
    const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !publishable) return server.demoFailure("unavailable");

    const adminRpc: DemoRpc = (fn, args) =>
      (supabaseAdmin.rpc as unknown as DemoRpc).call(supabaseAdmin, fn, args);

    return server.provisionPublicDemoRole(
      {
        enabled: true,
        clientSalt: salt,
        clientAddress,
        emailDomain: process.env["P69_PUBLIC_DEMO_EMAIL_DOMAIN"] || "demo.mitochondria.edocinfo.com",
        adminRpc,
        async createUser(email, password, demoRole) {
          const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            app_metadata: { mitochondria_public_demo: true, demo_role: demoRole },
            user_metadata: { display_name: `Synthetic demo ${demoRole}` },
          });
          return error || !created.user ? null : { id: created.user.id };
        },
        async deleteUser(id) {
          await supabaseAdmin.auth.admin.deleteUser(id);
        },
        async signIn(email, password) {
          const client = createClient(url, publishable, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
            global: {
              fetch: (input, init) => {
                const h = new Headers(init?.headers);
                if (publishable.startsWith("sb_") && h.get("Authorization") === `Bearer ${publishable}`)
                  h.delete("Authorization");
                h.set("apikey", publishable);
                return fetch(input, { ...init, headers: h });
              },
            },
          });
          const { data: signed, error } = await client.auth.signInWithPassword({ email, password });
          if (error || !signed.session) return null;
          return {
            accessToken: signed.session.access_token,
            refreshToken: signed.session.refresh_token,
            expiresAt: signed.session.expires_at ?? null,
          };
        },
        randomToken(bytes) {
          const buf = new Uint8Array(bytes);
          crypto.getRandomValues(buf);
          return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        },
        async sha256Hex(text) {
          const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
          return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
        },
      },
      data,
    );
  });

function callerRpc(context: { supabase: { rpc: unknown } }): DemoRpc {
  return (fn, args) => (context.supabase.rpc as unknown as DemoRpc).call(context.supabase, fn, args);
}

export const getPublicDemoWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadDemoWorkspace } = await import("./p69-public-demo.server");
    return loadDemoWorkspace(callerRpc(context));
  });

const measurement = z.object({ metricId: z.string().max(40), value: z.string().max(20), unit: z.string().max(40) }).strict();

export const submitDemoExaminationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        observedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        sourceQuality: z.enum(["good", "degraded", "poor", "unknown"]),
        measurements: z.array(measurement).min(1).max(30),
        idempotencyKey: key,
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { submitDemoExamination } = await import("./p69-public-demo.server");
    return submitDemoExamination(callerRpc(context), data, new Date().toISOString().slice(0, 10));
  });

export const transitionDemoRecordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        recordId: z.string().uuid(),
        action: z.enum(["scientific_assessment_recorded", "medical_review_recorded"]),
        outcome: z.string().max(64),
        note: z.string().max(1000),
        expectedRevision: z.number().int().min(1).max(3),
        idempotencyKey: key,
      })
      .strict()
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { transitionDemoRecord } = await import("./p69-public-demo.server");
    return transitionDemoRecord(callerRpc(context), data);
  });

export const resetDemoWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ expectedRevision: z.number().int().min(1) }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const { resetDemoWorkspace } = await import("./p69-public-demo.server");
    return resetDemoWorkspace(callerRpc(context), data.expectedRevision);
  });

export const restoreDemoWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) =>
    z.object({ epoch: z.number().int().min(1).max(20), expectedRevision: z.number().int().min(1) }).strict().parse(v),
  )
  .handler(async ({ data, context }) => {
    const { restoreDemoWorkspace } = await import("./p69-public-demo.server");
    return restoreDemoWorkspace(callerRpc(context), data.epoch, data.expectedRevision);
  });
