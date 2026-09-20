import { createFileRoute } from "@tanstack/react-router";

import { ActionGuidancePage } from "@/components/action-guidance";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Action & Protocol Guidance | The Mitochondria";
const description =
  "Governed, non-diagnostic action and protocol guidance for explainable astronaut health findings.";

export const Route = createFileRoute("/mission/guidance")({
  head: () => operationalRouteHead({ path: "/mission/guidance", title, description }),
  component: ActionGuidancePage,
});
