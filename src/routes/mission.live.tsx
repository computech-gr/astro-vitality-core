import { createFileRoute } from "@tanstack/react-router";

import { LiveDashboard } from "@/components/live-dashboard";
import { canonicalUrl } from "@/infrastructure/config";

const title = "Astronaut Live Dashboard | The Mitochondria";
const description = "Mission-local live physiological and spacecraft telemetry with visible data quality, freshness and device state.";

export const Route = createFileRoute("/mission/live")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/mission/live") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/mission/live") }],
  }),
  component: LiveDashboard,
});
