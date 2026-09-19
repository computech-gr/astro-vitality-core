import { createFileRoute } from "@tanstack/react-router";

import { ValidationUsabilityPage } from "@/components/validation-usability";
import { canonicalUrl } from "@/infrastructure/config";

const title = "Validation & Usability | The Mitochondria";
const description = "Validation evidence, accessibility and workflow review, engineering latency evidence and known limitations for The Mitochondria challenge prototype.";

export const Route = createFileRoute("/mission/validation")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/mission/validation") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/mission/validation") }],
  }),
  component: ValidationUsabilityPage,
});
