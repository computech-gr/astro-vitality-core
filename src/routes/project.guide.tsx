import { createFileRoute } from "@tanstack/react-router";

import { ProjectGuidePage } from "@/components/project-guide";
import { canonicalUrl } from "@/infrastructure/config";

const title = "Project Guide | The Mitochondria";
const description = "Mission, science, platform, technology, open-source and challenge navigation guide for The Mitochondria.";

export const Route = createFileRoute("/project/guide")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/project/guide") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/project/guide") }],
  }),
  component: ProjectGuidePage,
});
