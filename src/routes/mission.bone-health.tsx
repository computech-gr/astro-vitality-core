import { createFileRoute } from "@tanstack/react-router";
import { BoneHealthEntryPage } from "@/components/bone-health-entry";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/bone-health")({
  head: () => operationalRouteHead({ path: "/mission/bone-health", title: "Bone Health | The Mitochondria", description: "Encrypted offline bone-health measurement entry and history; research only." }),
  component: BoneHealthEntryPage,
});
