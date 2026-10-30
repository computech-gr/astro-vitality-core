import { createFileRoute } from "@tanstack/react-router";
import { AstronautDailyHealthCompanion } from "@/components/astronaut-daily-health-companion";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/companion")({
  head: () => operationalRouteHead({path:"/mission/companion", title:"Daily Health Companion | The Mitochondria", description:"Mission environments, research-only health routine, participation and read-only health trends."}),
  component: AstronautDailyHealthCompanion,
});
