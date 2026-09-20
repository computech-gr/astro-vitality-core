import { createFileRoute } from "@tanstack/react-router";

import { SyntheticMissionPage } from "@/components/synthetic-mission";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Synthetic Mission Simulation | The Mitochondria";
const description =
  "Repeatable synthetic mission scenarios for sensor streams, artifacts, missing data, CO2 and radiation context, offline operation and recovery.";

export const Route = createFileRoute("/mission/simulation")({
  head: () => operationalRouteHead({ path: "/mission/simulation", title, description }),
  component: SyntheticMissionPage,
});
