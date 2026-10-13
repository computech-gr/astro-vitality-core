import { createFileRoute } from "@tanstack/react-router";
import { HealthDomainWorkspace } from "@/components/health-domain-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/cardiovascular-health")({
  head: () => operationalRouteHead({ path: "/mission/cardiovascular-health", title: "Cardiovascular Health | The Mitochondria", description: "Research-only mission-scoped astronaut health observations, with scientific limitations." }),
  component: () => <HealthDomainWorkspace domainId="cardiovascular" />,
});
