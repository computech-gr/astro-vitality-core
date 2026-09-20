import { createFileRoute } from "@tanstack/react-router";

import { LiveDashboard } from "@/components/live-dashboard";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Astronaut Live Dashboard | The Mitochondria";
const description =
  "Mission-local live physiological and spacecraft telemetry with visible data quality, freshness and device state.";

export const Route = createFileRoute("/mission/live")({
  head: () => operationalRouteHead({ path: "/mission/live", title, description }),
  component: LiveDashboard,
});
