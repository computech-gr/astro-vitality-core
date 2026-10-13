import { createFileRoute } from "@tanstack/react-router";
import { NasaEvidenceWorkspace } from "@/components/nasa-evidence-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/nasa-evidence")({
  head: () => operationalRouteHead({path: "/mission/nasa-evidence", title: "NASA Scientific Evidence | The Mitochondria", description: "Repository-governed NASA scientific source metadata and provenance."}),
  component: NasaEvidenceWorkspace,
});
