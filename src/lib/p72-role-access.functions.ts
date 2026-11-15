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
 * Public by design — it returns only the mapped address, never a password, session
 * or token, and signing in still requires the password through standard Supabase Auth.
 */
export const getP72SignInPrefillFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ role: z.enum(["astronaut", "researcher", "medical"]) }).strict().parse(v))
  .handler(async ({ data }) => {
    const { P72_ROLE_ACCOUNTS } = await import("./p72-role-access.server");
    return { email: P72_ROLE_ACCOUNTS[data.role] };
  });
