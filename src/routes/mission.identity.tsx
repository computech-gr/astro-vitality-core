import { createFileRoute } from "@tanstack/react-router";

import { MissionIdentity } from "@/components/mission-identity";
import { isP72Role } from "@/domain/mission-access/p72-role-access";
import type { DemoRole } from "@/domain/public-demo/workflow";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/identity")({
  head: () => operationalRouteHead({
    path: "/mission/identity",
    title: "Mission Identity & Sign-in | The Mitochondria",
    description: "Authenticate mission users, select governed mission membership, and unlock RLS-authorized synchronization without weakening offline autonomy.",
  }),
  validateSearch: (search: Record<string, unknown>): { role?: DemoRole } =>
    isP72Role(search["role"]) ? { role: search["role"] } : {},
  component: MissionIdentityRoute,
});

function MissionIdentityRoute() {
  const { role } = Route.useSearch();
  return <MissionIdentity {...(role ? { p72Role: role } : {})} />;
}
