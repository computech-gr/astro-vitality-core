import { createFileRoute } from "@tanstack/react-router";
import { GlobalResearchAccess } from "@/components/mission-access/global-research-access";
import { P72MissionContextBar } from "@/components/mission-access/p72-mission-context-bar";
import { operationalRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/mission/research-access")({
  head: () =>
    operationalRouteHead({
      path: "/mission/research-access",
      title: "Researcher Mission Access | The Mitochondria",
      description:
        "Server-verified, read-only Researcher view of every mission's synthetic examinations and Health Domains, without Medical or administrative permissions.",
    }),
  component: ResearchAccessPage,
});

function ResearchAccessPage() {
  return (
    <>
      <div className="mx-auto max-w-6xl px-4 sm:px-5">
        <P72MissionContextBar role="researcher" />
      </div>
      <GlobalResearchAccess />
    </>
  );
}
