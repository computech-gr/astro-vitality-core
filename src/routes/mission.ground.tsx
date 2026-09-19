import { createFileRoute } from "@tanstack/react-router";
import { GroundResearchConsolePage } from "@/components/ground-research-console";
import { canonicalUrl } from "@/infrastructure/config";
const title = "Ground & Research Console | The Mitochondria";
const description = "Mission-scoped ground oversight, auditability and de-identified research export for The Mitochondria.";
export const Route = createFileRoute("/mission/ground")({
  head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:url", content: canonicalUrl("/mission/ground") }], links: [{ rel: "canonical", href: canonicalUrl("/mission/ground") }] }),
  component: GroundResearchConsolePage,
});
