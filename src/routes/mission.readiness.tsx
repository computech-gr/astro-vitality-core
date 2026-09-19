import { createFileRoute } from "@tanstack/react-router";

import { ReadinessAssessment } from "@/components/readiness-assessment";

export const Route = createFileRoute("/mission/readiness")({
  component: ReadinessAssessment,
  head: () => ({
    meta: [
      { title: "Cognitive & Behavioral Readiness | The Mitochondria" },
      {
        name: "description",
        content: "Private, longitudinal cognitive and behavioral readiness assessment for The Mitochondria mission-health platform.",
      },
    ],
  }),
});
