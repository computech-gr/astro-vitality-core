import { createFileRoute } from "@tanstack/react-router";

import { PublicDemoWorkspace } from "@/components/public-demo/public-demo-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/demo")({
  validateSearch: (search: Record<string, unknown>): { offline?: boolean } =>
    search["offline"] === true || search["offline"] === "true" || search["offline"] === 1 ? { offline: true } : {},
  head: () =>
    operationalRouteHead({
      path: "/mission/demo",
      title: "NASA Live Demo — Astronaut, Researcher, Medical | The Mitochondria",
      description:
        "One-click synthetic demonstration: an astronaut submits an examination, a researcher records a scientific assessment and medical records a review, in a private demo workspace.",
    }),
  component: DemoRoute,
});

function DemoRoute() {
  const { offline } = Route.useSearch();
  return <PublicDemoWorkspace offline={offline === true} />;
}
