import { createFileRoute } from "@tanstack/react-router";
import { MissionExperiencePage } from "@/components/mission-experience";
import { P72MissionContextBar } from "@/components/mission-access/p72-mission-context-bar";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/experience")({
  head: () => operationalRouteHead({ path: "/mission/experience", title: "Mission Workspace | The Mitochondria", description: "Role-aware mission task navigation." }),
  component: () => (
    <>
      <P72MissionContextBar role="astronaut" />
      <MissionExperiencePage />
    </>
  ),
});
