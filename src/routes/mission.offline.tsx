import { createFileRoute } from "@tanstack/react-router";

import { OfflineMissionPage } from "@/components/offline-mission";
import { siteConfig } from "@/infrastructure/config";

export const Route = createFileRoute("/mission/offline")({
  head: () => ({
    meta: [
      { title: "Offline Mission Mode | The Mitochondria" },
      {
        name: "description",
        content: "Encrypted local mission persistence, protocol caching and store-and-forward sync readiness for The Mitochondria.",
      },
    ],
    links: [{ rel: "canonical", href: `${siteConfig.canonicalOrigin}/mission/offline` }],
  }),
  component: OfflineMissionPage,
});
