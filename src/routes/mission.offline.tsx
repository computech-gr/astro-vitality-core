import { createFileRoute } from "@tanstack/react-router";

import { OfflineMissionPage } from "@/components/offline-mission";
import { canonicalUrl } from "@/infrastructure/config";

const title = "Offline Mission Mode | The Mitochondria";
const description =
  "Encrypted local mission persistence, protocol caching and store-and-forward sync readiness for The Mitochondria.";

export const Route = createFileRoute("/mission/offline")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/mission/offline") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/mission/offline") }],
  }),
  component: OfflineMissionPage,
});
