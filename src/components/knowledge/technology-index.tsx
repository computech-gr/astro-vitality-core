import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { TECHNOLOGY_TOPICS } from "@/content/technology-topics";
import { TOPIC_ICONS } from "@/components/knowledge/topic-icons";

export function TopicCardGrid({ headingLevel = "h3" }: { headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <ul className="grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-4">
      {TECHNOLOGY_TOPICS.map((topic) => {
        const Icon = TOPIC_ICONS[topic.slug];
        return (
          <li key={topic.slug} className="group flex min-h-72 flex-col border-b border-r border-border p-6 transition-colors hover:bg-surface">
            <Icon aria-hidden="true" className="size-6 text-primary" />
            <p className="mt-8 font-mono text-[0.65rem] uppercase tracking-wider text-signal">{topic.kicker}</p>
            <Heading className="mt-2 font-display text-xl font-semibold">{topic.title}</Heading>
            <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{topic.summary}</p>
            <Link to="/technology/$topic" params={{ topic: topic.slug }} className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              Learn more<span className="sr-only"> about {topic.title}</span><ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TechnologyIndexPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[94rem] px-5 py-14 lg:px-8 lg:py-20">
        <p className="section-kicker">Technology</p>
        <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-6xl">How The Mitochondria is built.</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">Eight topics explain the architecture behind the platform — what each part does, why it matters for long-duration spaceflight, and exactly what is implemented today versus what still needs hardware, hosts or validation.</p>
        <section aria-labelledby="topics-title" className="mt-14">
          <h2 id="topics-title" className="sr-only">Technology topics</h2>
          <TopicCardGrid />
        </section>
      </div>
    </main>
  );
}
