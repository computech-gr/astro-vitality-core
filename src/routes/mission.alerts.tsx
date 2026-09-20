import { createFileRoute } from "@tanstack/react-router";

import { ExplainableAlertsPage } from "@/components/explainable-alerts";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Explainable Alerts | The Mitochondria";
const description =
  "Evidence-linked, confidence-aware astronaut health alerts with explicit uncertainty, data-quality states and non-diagnostic guardrails.";

export const Route = createFileRoute("/mission/alerts")({
  head: () => operationalRouteHead({ path: "/mission/alerts", title, description }),
  component: ExplainableAlertsPage,
});
