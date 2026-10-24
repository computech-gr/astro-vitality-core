import { createFileRoute } from "@tanstack/react-router";
import { AstronautHealthReport } from "@/components/astronaut-health-report";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/health-report")({
  head: () =>
    operationalRouteHead({
      path: "/mission/health-report",
      title: "Astronaut Health Research Report | The Mitochondria",
      description:
        "Authorized offline research-only astronaut health history and evidence-linked assessment.",
    }),
  component: AstronautHealthReport,
});
