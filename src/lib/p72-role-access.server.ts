/**
 * P72 exact role-to-account mapping (server-only). Used only to decide which
 * console a signed-in account is sent to; it grants nothing. Authority stays
 * with Supabase Auth, mission memberships and RLS.
 */
import type { DemoRole } from "@/domain/public-demo/workflow";

export const P72_ROLE_ACCOUNTS: Record<DemoRole, string> = {
  astronaut: "theosilv@gmail.com",
  researcher: "nikolasilvestros@gmail.com",
  medical: "marketing@computech.gr",
};

export function p72MatchesMappedAccount(role: DemoRole, claims: { email?: unknown; app_metadata?: unknown } | null | undefined): boolean {
  if (!claims || typeof claims.email !== "string") return false;
  const meta = claims.app_metadata as Record<string, unknown> | undefined;
  if (meta && meta["mitochondria_public_demo"] === true) return false;
  return claims.email.trim().toLowerCase() === P72_ROLE_ACCOUNTS[role];
}
