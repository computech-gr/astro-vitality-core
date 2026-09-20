import { createFileRoute } from "@tanstack/react-router";

import { MissionIdentity } from "@/components/mission-identity";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/identity")({
  head: () => operationalRouteHead({
    path: "/mission/identity",
    title: "Mission Identity & Sign-in | The Mitochondria",
    description: "Authenticate mission users, select governed mission membership, and unlock RLS-authorized synchronization without weakening offline autonomy.",
  }),
  component: MissionIdentity,
});
