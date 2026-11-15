/**
 * P72 exact role-to-account mapping (server-only). Used only to decide which
 * console a signed-in account is sent to; it grants nothing. Authority stays
 * with Supabase Auth, mission memberships and RLS.
 */
import type { DemoRole } from "@/domain/public-demo/workflow";

export const P72_ROLE_ACCOUNTS: Record<DemoRole, string> = {
  astronaut: "marketing@computech.gr", // P72.3: same Ground Medical account as Medical
  researcher: "nikolasilvestros@gmail.com",
  medical: "marketing@computech.gr",
};

export function p72MatchesMappedAccount(role: DemoRole, claims: { email?: unknown; app_metadata?: unknown } | null | undefined): boolean {
  if (!claims || typeof claims.email !== "string") return false;
  const meta = claims.app_metadata as Record<string, unknown> | undefined;
  if (meta && meta["mitochondria_public_demo"] === true) return false;
  return claims.email.trim().toLowerCase() === P72_ROLE_ACCOUNTS[role];
}

/** P72.6: presentation sign-in needs the explicit flag and a server-held password. */
export function p72PresentationSignInAvailable(flag: string | undefined, password: string | undefined): boolean {
  return flag === "true" && typeof password === "string" && password.length > 0;
}
