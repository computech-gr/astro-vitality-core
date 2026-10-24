import { createFileRoute } from "@tanstack/react-router";
import { UnifiedIntakeWorkspace } from "@/components/unified-intake-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";
// @ts-expect-error -- circular route-type resolution: routeTree.gen.ts references this file's Route export inside the FileRoutesByPath augmentation, so the "/mission/intake" member is dropped while this file is checked; the route is valid and verified at runtime.
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
