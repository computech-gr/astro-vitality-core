import { createFileRoute } from "@tanstack/react-router";

import { SyntheticMissionPage } from "@/components/synthetic-mission";
import { canonicalUrl } from "@/infrastructure/config";

const title = "Synthetic Mission Simulation | The Mitochondria";
const description =
  "Repeatable synthetic mission scenarios for sensor streams, artifacts, missing data, CO2 and radiation context, offline operation and recovery.";

export const Route = createFileRoute("/mission/simulation")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/mission/simulation") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/mission/simulation") }],
  }),
  component: SyntheticMissionPage,
});
