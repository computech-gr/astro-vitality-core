import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleAlert, ExternalLink, Info, ServerCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type StatusLevel, type TechnologyTopic, type TopicLink } from "@/content/technology-topics";

const STATUS_ICON: Record<StatusLevel, typeof Info> = {
  implemented: CheckCircle2,
  partial: CircleAlert,
  "requires-host": ServerCog,
  "not-validated": Info,
};

/** Accessible flow diagram rendered from structured topic content. */
export function FlowDiagram({ caption, nodes }: { caption: string; nodes: readonly string[] }) {
  return (
    <figure className="overflow-hidden border border-border bg-surface">
      <div className="relative p-6 sm:p-8">
        <div aria-hidden="true" className="absolute inset-0 opacity-25 grid-lines" />
        <ol className="relative grid gap-3 md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: nodes.length }}>
          {nodes.map((node, index) => (
            <li key={node} className="relative flex min-h-24 flex-col justify-between border border-primary/40 bg-background/80 p-4 backdrop-blur">
              <span className="font-mono text-xs text-primary">{String(index + 1).padStart(2, "0")}</span>
              <span className="mt-3 text-sm font-semibold leading-snug text-foreground">{node}</span>
              {index < nodes.length - 1 && <ArrowRight aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 text-signal md:block" />}
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="border-t border-border px-6 py-3 text-xs text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}

function SmartLink({ link, className }: { link: TopicLink; className?: string }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
        <ExternalLink aria-hidden="true" className="size-3.5" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <a href={link.href} className={className}>{link.label}<ArrowRight aria-hidden="true" className="size-3.5" /></a>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-6 border-t border-border py-12 lg:grid-cols-[0.3fr_0.7fr]">
      <h2 id={id} className="font-display text-2xl font-semibold sm:text-3xl">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

/** Reusable educational detail page driven entirely by structured content. */
export function TopicPage({ topic, siblings }: { topic: TechnologyTopic; siblings: readonly TechnologyTopic[] }) {
  const index = siblings.findIndex((item) => item.slug === topic.slug);
  const next = siblings[(index + 1) % siblings.length];
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="relative overflow-hidden border-b border-border bg-deep">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-2/3 bg-[radial-gradient(circle_at_right,var(--cyan-haze),transparent_65%)]" />
        <div className="relative mx-auto max-w-[94rem] px-5 py-14 lg:px-8 lg:py-20">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li><a href="/" className="hover:text-primary">Home</a></li>
              <li aria-hidden="true">/</li>
              <li><Link to="/technology" className="hover:text-primary">Technology</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-foreground">{topic.title}</li>
            </ol>
          </nav>
          <p className="section-kicker mt-8">{topic.kicker}</p>
          <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold leading-tight sm:text-6xl">{topic.title}</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{topic.intro}</p>
        </div>
      </header>

      <div className="mx-auto max-w-[94rem] px-5 pb-20 lg:px-8">
        <Section id="why" title="Why it matters for long-duration spaceflight">
          <ul className="space-y-3">{topic.whyItMatters.map((item) => <li key={item} className="border-l-2 border-primary pl-4 leading-7 text-muted-foreground">{item}</li>)}</ul>
        </Section>

        <Section id="approach" title="How The Mitochondria addresses it">
          <ul className="grid gap-3 sm:grid-cols-2">{topic.approach.map((item) => <li key={item} className="border border-border bg-surface p-4 text-sm leading-6 text-muted-foreground">{item}</li>)}</ul>
        </Section>

        <Section id="diagram" title="Architecture diagram">
          <FlowDiagram caption={topic.diagram.caption} nodes={topic.diagram.nodes} />
        </Section>

        <Section id="technical" title="Technical explanation">
          <div className="space-y-6">{topic.technical.map((item) => <div key={item.heading}><h3 className="font-semibold text-foreground">{item.heading}</h3><p className="mt-2 leading-7 text-muted-foreground">{item.body}</p></div>)}</div>
        </Section>

        <Section id="status" title="Implementation status and limitations">
          <ul className="space-y-3">
            {topic.status.map((item) => {
              const Icon = STATUS_ICON[item.level];
              return (
                <li key={item.text} className="flex gap-3 border border-border p-4">
                  <Icon aria-hidden="true" className={item.level === "implemented" ? "mt-0.5 size-5 shrink-0 text-signal" : "mt-0.5 size-5 shrink-0 text-primary"} />
                  <div><Badge variant="outline">{STATUS_LABEL[item.level]}</Badge><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p></div>
                </li>
              );
            })}
          </ul>
          <h3 className="mt-8 font-semibold">Known limitations</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">{topic.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          <p className="mt-6 border-l-2 border-signal pl-4 text-sm leading-6 text-muted-foreground">The Mitochondria is human decision support. It does not diagnose, prescribe treatment or replace qualified medical judgment.</p>
        </Section>

        <Section id="related" title="Related pages">
          <ul className="flex flex-wrap gap-2">{topic.related.map((link) => <li key={link.href}><SmartLink link={link} className="inline-flex min-h-11 items-center gap-1.5 border border-border px-4 text-sm transition-colors hover:border-primary hover:text-primary" /></li>)}</ul>
        </Section>

        <Section id="references" title="Source references">
          <ul className="space-y-2">{topic.references.map((link) => <li key={link.href}><SmartLink link={link} className="inline-flex items-center gap-1.5 font-mono text-sm text-primary hover:underline" /></li>)}</ul>
        </Section>

        <nav aria-label="Topic navigation" className="flex flex-wrap justify-between gap-4 border-t border-border pt-8">
          <Link to="/technology" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft aria-hidden="true" className="size-4" />All technology topics</Link>
          {next && next.slug !== topic.slug && <Link to="/technology/$topic" params={{ topic: next.slug }} className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline">Next: {next.title}<ArrowRight aria-hidden="true" className="size-4" /></Link>}
        </nav>
      </div>
    </main>
  );
}
