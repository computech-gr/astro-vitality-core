import { createFileRoute } from "@tanstack/react-router";
import { HealthDomainWorkspace } from "@/components/health-domain-workspace";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/immune-health")({
  head: () => operationalRouteHead({ path: "/mission/immune-health", title: "Immune Changes | The Mitochondria", description: "Research-only mission-scoped astronaut health observations, with scientific limitations." }),
  component: () => <HealthDomainWorkspace domainId="immune" />,
});
