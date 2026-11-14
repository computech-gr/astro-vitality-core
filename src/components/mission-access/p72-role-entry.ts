/**
 * P72 client step shared by the homepage buttons and the sign-in page:
 * resolves where a role button should send the current browser session.
 * It never changes identity; demo or signed-out sessions get { kind: "demo" }.
 */
import { supabase } from "@/integrations/supabase/client";
import { loadMissionIdentity, setActiveMissionMembership } from "@/infrastructure/mission-identity";
import { decideP72Entry, type P72EntryDecision } from "@/domain/mission-access/p72-role-access";
import type { DemoRole } from "@/domain/public-demo/workflow";

export type P72AccountCheck = (input: { data: { role: DemoRole } }) => Promise<{ mapped: boolean; signedInAs: string | null }>;

export async function resolveP72RoleEntry(role: DemoRole, check: P72AccountCheck): Promise<P72EntryDecision> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const standardSession = Boolean(session) && session?.user.app_metadata?.["mitochondria_public_demo"] !== true;
  if (!standardSession) return { kind: "demo" };
  const [account, identity] = await Promise.all([check({ data: { role } }), loadMissionIdentity()]);
  const decision = decideP72Entry({
    role,
    standardSession,
    mappedAccount: account.mapped,
    signedInAs: account.signedInAs,
    memberships: identity.memberships,
  });
  if (decision.kind === "console" && decision.membership) setActiveMissionMembership(decision.membership);
  return decision;
}
