import { createFileRoute } from "@tanstack/react-router";
import { P36ScientificReviewWorkspace } from "@/components/p36-scientific-review-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/scientific-review")({
  head: () =>
    operationalRouteHead({
      path: "/mission/scientific-review",
      title: "Catalog Scientific Review | The Mitochondria",
      description:
        "Review-only dossiers for the 12 P36 catalog reconciliation terms with evidence, exact unit comparison and a prepared, unapplied activation manifest.",
    }),
  component: P36ScientificReviewWorkspace,
});
