import { createFileRoute } from "@tanstack/react-router";

import { ReadinessAssessment } from "@/components/readiness-assessment";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Cognitive & Behavioral Readiness | The Mitochondria";
const description =
  "Private, longitudinal cognitive and behavioral readiness assessment for The Mitochondria mission-health platform.";

export const Route = createFileRoute("/mission/readiness")({
  head: () => operationalRouteHead({ path: "/mission/readiness", title, description }),
  component: ReadinessAssessment,
});
