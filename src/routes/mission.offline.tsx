import { createFileRoute } from "@tanstack/react-router";

import { OfflineMissionPage } from "@/components/offline-mission";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Offline Mission Mode | The Mitochondria";
const description =
  "Encrypted local mission persistence, protocol caching and store-and-forward sync readiness for The Mitochondria.";

export const Route = createFileRoute("/mission/offline")({
  head: () => operationalRouteHead({ path: "/mission/offline", title, description }),
  component: OfflineMissionPage,
});
