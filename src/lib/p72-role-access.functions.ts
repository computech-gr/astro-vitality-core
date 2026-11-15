/**
 * P72: tells a signed-in caller whether their own verified account is the one
 * mapped to a homepage role. Requires the caller's session; returns only their
 * own email and a boolean — never another account's address, session or token.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkP72RoleAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ role: z.enum(["astronaut", "researcher", "medical"]) }).strict().parse(v))
  .handler(async ({ data, context }) => {
    const { p72MatchesMappedAccount } = await import("./p72-role-access.server");
    const claims = context.claims as { email?: unknown; app_metadata?: unknown };
    return {
      mapped: p72MatchesMappedAccount(data.role, claims),
      signedInAs: typeof claims.email === "string" ? claims.email : null,
    };
  });

/**
 * P72.5 (owner-requested): the email address to prefill on a role's sign-in page.
 * Public by design — it returns the mapped address (masked while server-held presentation
 * sign-in is available) and that availability, never a password, session or token.
 */
export const getP72SignInPrefillFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ role: z.enum(["astronaut", "researcher", "medical"]) }).strict().parse(v))
  .handler(async ({ data }) => {
    const { P72_ROLE_ACCOUNTS, p72PresentationSignInAvailable } = await import("./p72-role-access.server");
    const { maskAccountEmail } = await import("@/domain/mission-access/p72-role-access");
    const presentationSignIn = p72PresentationSignInAvailable(
      process.env["P72_PRESENTATION_SIGNIN_ENABLED"],
      process.env["P72_PRESENTATION_PASSWORD"],
    );
    // P72.6: during presentation sign-in only the masked address leaves the server.
    return {
      email: presentationSignIn ? maskAccountEmail(P72_ROLE_ACCOUNTS[data.role]) : P72_ROLE_ACCOUNTS[data.role],
      presentationSignIn,
    };
  });

/**
 * P72.6 (owner-requested): signs in the role's mapped account on the server with the
 * server-held password and returns only that session. The email is fixed by role, so it
 * cannot sign in any other account; off unless P72_PRESENTATION_SIGNIN_ENABLED is "true".
 */
export const p72PresentationSignInFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ role: z.enum(["astronaut", "researcher", "medical"]) }).strict().parse(v))
  .handler(async ({ data }) => {
    const { P72_ROLE_ACCOUNTS, p72PresentationSignInAvailable } = await import("./p72-role-access.server");
    const password = process.env["P72_PRESENTATION_PASSWORD"];
    if (!p72PresentationSignInAvailable(process.env["P72_PRESENTATION_SIGNIN_ENABLED"], password) || !password)
      return { ok: false as const, message: "Automatic sign-in is turned off. Enter the password instead." };
    const url = process.env["SUPABASE_URL"];
    const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !publishable) return { ok: false as const, message: "Sign-in is unavailable right now." };
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, publishable, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (publishable.startsWith("sb_") && h.get("Authorization") === `Bearer ${publishable}`) h.delete("Authorization");
          h.set("apikey", publishable);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: signed, error } = await client.auth.signInWithPassword({ email: P72_ROLE_ACCOUNTS[data.role], password });
    if (error || !signed.session) return { ok: false as const, message: "Automatic sign-in failed. Enter the password instead." };
    return { ok: true as const, accessToken: signed.session.access_token, refreshToken: signed.session.refresh_token };
  });
