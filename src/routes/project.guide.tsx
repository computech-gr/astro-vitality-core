import { createFileRoute } from "@tanstack/react-router";

import { ProjectGuidePage } from "@/components/project-guide";
import { indexableRouteHead } from "@/infrastructure/seo";

const title = "Project Guide | The Mitochondria";
const description =
  "Mission, science, platform, technology, open-source and challenge navigation guide for The Mitochondria.";

export const Route = createFileRoute("/project/guide")({
  head: () => indexableRouteHead({ path: "/project/guide", title, description }),
  component: ProjectGuidePage,
});
