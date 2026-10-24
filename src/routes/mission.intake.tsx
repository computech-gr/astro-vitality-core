import { createFileRoute } from "@tanstack/react-router";
import { UnifiedIntakeWorkspace } from "@/components/unified-intake-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/intake")({
  head: () =>
    operationalRouteHead({
      path: "/mission/intake",
      title: "Unified Data Intake | The Mitochondria",
      description:
        "Unified, review-gated intake for manual, CSV, PDF/OCR, device and self-assessment observations; encrypted offline storage; research only.",
    }),
  component: UnifiedIntakeWorkspace,
});
