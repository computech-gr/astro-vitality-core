import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ExternalLink, FileText, Play } from "lucide-react";

import logoAsset from "@/assets/mitochondria-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { competitionDocuments, competitionTeam } from "@/content/competition-team";
import { CANONICAL_ORIGIN } from "@/infrastructure/config";
import { indexableRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/competition/team")({
  head: () => {
    const head = indexableRouteHead({
      path: "/competition/team",
      title: "Our Team — NASA Space Apps 2026 | The Mitochondria",
      description: "Meet The Mitochondria team for NASA Space Apps Challenge 2026 in Nicosia, Cyprus, and explore its astronaut health-monitoring research prototype and competition materials.",
    });
    return { ...head, meta: head.meta.filter((meta) => meta["property"] !== "og:image" && meta["name"] !== "twitter:image") };
  },
  component: CompetitionTeamPage,
});

function CompetitionTeamPage() {
  return (
    <main className="bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-6 lg:py-16">
        <img src={logoAsset.url} alt="" width={920} height={520} className="mb-6 h-16 w-auto object-contain" />
        <p className="section-kicker">{competitionTeam.event}</p>
        <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">{competitionTeam.name}</h1>
        <p className="mt-4 text-lg text-muted-foreground">Local Event: {competitionTeam.localEvent}</p>
        <p className="mt-4 max-w-3xl text-lg leading-7"><span className="text-muted-foreground">Challenge: </span>{competitionTeam.challenge}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild><a href={competitionTeam.officialUrl} target="_blank" rel="noopener noreferrer">Official NASA Team Profile<ExternalLink aria-hidden="true" /></a></Button>
          <Button asChild variant="outline"><a href={competitionTeam.challengeUrl} target="_blank" rel="noopener noreferrer">Official NASA Challenge<ExternalLink aria-hidden="true" /></a></Button>
        </div>

        <section aria-labelledby="team-members" className="mt-12 border-t border-border pt-8">
          <h2 id="team-members" className="font-display text-2xl font-semibold">Team members</h2>
          <ul className="mt-5 grid gap-x-10 sm:grid-cols-2">
            {competitionTeam.members.map((member) => (
              <li key={member.name} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-4">
                <span className="font-medium">{member.name}</span>
                {"role" in member && <span className="text-sm text-primary">{member.role}</span>}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="competition-materials" className="mt-12 border-t border-border pt-8">
          <h2 id="competition-materials" className="font-display text-2xl font-semibold">Competition Materials</h2>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button asChild><a href={CANONICAL_ORIGIN} target="_blank" rel="noopener noreferrer">Live application<ArrowRight aria-hidden="true" /></a></Button>
            <Button asChild variant="outline"><Link to="/competition/demo-video"><Play aria-hidden="true" />Watch Official NASA Demo Video</Link></Button>
          </div>
          <ul className="mt-6 divide-y divide-border">
            {competitionDocuments.map((document) => (
              <li key={document.url} className="py-2">
                <Button asChild variant="ghost" className="h-auto min-h-11 w-full justify-start whitespace-normal text-left">
                  <a href={document.url} target="_blank" rel="noopener noreferrer"><FileText aria-hidden="true" className="shrink-0" /><span>{document.label}</span><ExternalLink aria-hidden="true" className="shrink-0" /></a>
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <aside aria-label="Research prototype disclaimer" className="mt-10 border-l-2 border-primary pl-5 text-sm leading-6 text-muted-foreground">
          Independent research prototype using synthetic demo data. Participation in NASA Space Apps does not imply NASA endorsement. Not clinically validated or flight-qualified; team registration does not confer scientific approvals. Research reference only, not for diagnosis or treatment.
        </aside>
      </div>
    </main>
  );
}