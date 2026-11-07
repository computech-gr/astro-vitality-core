import { createFileRoute } from "@tanstack/react-router";
import { P36ScientificReviewWorkspace } from "@/components/p36-scientific-review-workspace";
import { BiomarkerInterpretationReview } from "@/components/biomarker-interpretation-review";
import {
  BULK_RESEARCHER_ANCHOR,
  BULK_RESEARCHER_HEADING,
} from "@/components/p38-bulk-researcher-anchor";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/scientific-review")({
  head: () =>
    operationalRouteHead({
      path: "/mission/scientific-review",
      title: "Catalog Scientific Review | The Mitochondria",
      description:
        "Original P36 dossiers and authorized submitted terms with exact units, independent Researcher decisions and separately governed catalog promotion.",
    }),
  component: ScientificReviewPage,
});

function ScientificReviewPage() {
  return (
    <>
      <nav aria-label="On this page" className="mx-auto max-w-6xl px-4 pt-6 sm:px-5">
        <a
          href={`#${BULK_RESEARCHER_ANCHOR}`}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Jump to {BULK_RESEARCHER_HEADING}
        </a>
      </nav>
      <P36ScientificReviewWorkspace />
      <BiomarkerInterpretationReview />
    </>
  );
}
