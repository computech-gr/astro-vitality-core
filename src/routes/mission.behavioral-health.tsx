import { createFileRoute } from "@tanstack/react-router";
import { HealthDomainWorkspace } from "@/components/health-domain-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/behavioral-health")({
  head: () => operationalRouteHead({ path: "/mission/behavioral-health", title: "Behavioral Health | The Mitochondria", description: "Research-only mission-scoped astronaut health observations, with scientific limitations." }),
  component: () => <HealthDomainWorkspace domainId="behavioral" />,
});
