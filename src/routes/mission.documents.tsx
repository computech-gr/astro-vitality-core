import { createFileRoute } from "@tanstack/react-router";
import { MissionDocumentReviewWorkbench } from "@/components/mission-document-review-workbench";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/documents")({
  head: () =>
    operationalRouteHead({
      path: "/mission/documents",
      title: "Mission Document Review | The Mitochondria",
      description: "Research-only local document extraction and candidate biomarker review.",
    }),
  component: MissionDocumentReviewWorkbench,
});
