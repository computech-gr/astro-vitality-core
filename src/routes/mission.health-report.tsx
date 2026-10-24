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
  component: HealthReportPage,
});

// Long observation IDs and citations must wrap on narrow screens instead of scrolling sideways.
function HealthReportPage() {
  return (
    <div className="min-w-0 [overflow-wrap:anywhere]">
      <AstronautHealthReport />
    </div>
  );
}
