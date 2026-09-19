import { createFileRoute } from "@tanstack/react-router";

import { HealthIntelligencePage } from "@/components/health-intelligence";
import { canonicalUrl } from "@/infrastructure/config";

const title = "Health Intelligence | The Mitochondria";
const description = "Explainable, evidence-weighted multi-signal health intelligence with explicit confidence, confounders and uncertainty.";

export const Route = createFileRoute("/mission/intelligence")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/mission/intelligence") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/mission/intelligence") }],
  }),
  component: HealthIntelligencePage,
});
