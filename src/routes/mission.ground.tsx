import { createFileRoute } from "@tanstack/react-router";

import { GroundResearchConsolePage } from "@/components/ground-research-console";
import { P72MissionContextBar } from "@/components/mission-access/p72-mission-context-bar";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Ground & Research Console | The Mitochondria";
const description =
  "Mission-scoped ground oversight, auditability and de-identified research export for The Mitochondria.";

export const Route = createFileRoute("/mission/ground")({
  head: () => operationalRouteHead({ path: "/mission/ground", title, description }),
  component: () => (
    <>
      <P72MissionContextBar role="medical" />
      <GroundResearchConsolePage />
    </>
  ),
});
