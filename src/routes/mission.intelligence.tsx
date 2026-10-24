import { createFileRoute } from "@tanstack/react-router";

import { HealthIntelligencePage } from "@/components/health-intelligence";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Health Intelligence | The Mitochondria";
const description =
  "Explainable, evidence-weighted multi-signal health intelligence with explicit confidence, confounders and uncertainty.";

export const Route = createFileRoute("/mission/intelligence")({
  head: () => operationalRouteHead({ path: "/mission/intelligence", title, description }),
  component: () => <div className="min-w-0 [&_label]:min-w-0 [&_label]:w-full sm:[&_label]:flex-1 [&_select]:min-w-0 [&_select]:w-full [&_input]:min-w-0 [&_input]:w-full"><HealthIntelligencePage /></div>,
});
