import { createFileRoute } from "@tanstack/react-router";

import { TechnologyIndexPage } from "@/components/knowledge/technology-index";
import { indexableRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/technology/")({
  head: () =>
    indexableRouteHead({
      path: "/technology",
      title: "Technology | The Mitochondria",
      description: "Architecture, device integration, wearables, laboratory data, environmental telemetry, data model, offline-first design and security behind The Mitochondria.",
    }),
  component: TechnologyIndexPage,
});
