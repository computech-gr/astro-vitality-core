import { createFileRoute } from "@tanstack/react-router";
import { P36ScientificReviewWorkspace } from "@/components/p36-scientific-review-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/scientific-review")({
  head: () =>
    operationalRouteHead({
      path: "/mission/scientific-review",
      title: "Catalog Scientific Review | The Mitochondria",
      description:
        "Original P36 dossiers and authorized submitted terms with exact units, independent Researcher decisions and separately governed catalog promotion.",
    }),
  component: P36ScientificReviewWorkspace,
});
