import { createFileRoute } from "@tanstack/react-router";

import { MissionOperations } from "@/components/mission-operations";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/operations")({
  head: () => operationalRouteHead({
    path: "/mission/operations",
    title: "Mission & Crew Operations | The Mitochondria",
    description: "Govern mission lifecycle, crew registry, memberships, and mission-scoped invitations through audited operator workflows.",
  }),
  component: MissionOperations,
});
