import { createFileRoute } from "@tanstack/react-router";

import { ValidationUsabilityPage } from "@/components/validation-usability";
import { indexableRouteHead } from "@/infrastructure/seo";

const title = "Validation & Usability | The Mitochondria";
const description =
  "Validation evidence, accessibility and workflow review, engineering latency evidence and known limitations for The Mitochondria challenge prototype.";

export const Route = createFileRoute("/mission/validation")({
  head: () => indexableRouteHead({ path: "/mission/validation", title, description, ogType: "article" }),
  component: ValidationUsabilityPage,
});
