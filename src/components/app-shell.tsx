import { useEffect, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  CircleGauge,
  CloudOff,
  Code2,
  DatabaseZap,
  ExternalLink,
  Fingerprint,
  FlaskConical,
  Github,
  HeartPulse,
  Menu,
  Network,
  Orbit,
  RadioTower,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import astronautEarthrise from "@/assets/astronaut-earthrise.jpg";
import logoAsset from "@/assets/mitochondria-logo.png.asset.json";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NASA_URL = "https://www.spaceappschallenge.org/2026/";
const CHALLENGE_URL = "https://www.spaceappschallenge.org/2026/challenges/create-health-monitoring-software-for-astronauts-on-space-missions/";
const GITHUB_URL = "https://github.com/computech-gr/astro-vitality-core";

type NavigationEntry = {
  label: string;
  href: string;
  items?: readonly string[];
};

const navigation: readonly NavigationEntry[] = [
  { label: "Home", href: "#home" },
  {
    label: "Mission",
    href: "#mission",
    items: ["The Challenge", "Our Mission", "Mission Scenario", "Why Autonomous Health", "Long-Duration Spaceflight"],
  },
  {
    label: "Science",
    href: "#science",
    items: ["Scientific Foundation", "Spaceflight Health Risks", "Biomarkers & Signals", "Personal Baselines", "Cognitive & Behavioral Health", "Environment & Radiation", "Scientific Safety Boundaries"],
  },
  {
    label: "Platform",
    href: "#platform",
    items: ["Platform Overview", "Astronaut Health Twin", "Live Monitoring", "Personalization", "Health Intelligence", "Explainable Alerts", "Action Guidance", "Offline Mission Mode", "Ground & Research Console"],
  },
  {
    label: "Technology",
    href: "#technology",
    items: ["System Architecture", "Device Integration", "Wearables", "Medical & Laboratory Data", "Environmental Telemetry", "Canonical Health Data Model", "Offline-First Architecture", "Security & Privacy"],
  },
  {
    label: "Open Source",
    href: "#open-source",
    items: ["Open-Source Mission", "GitHub Repository", "Documentation", "Device Adapter SDK", "Data & Interoperability", "Contributing", "Security Policy", "License"],
  },
  {
    label: "About",
    href: "#about",
    items: ["The Mitochondria", "NASA Space Apps 2026", "Team", "Scientific Approach", "Roadmap", "Validation & Limitations", "Challenge Submission", "Resources & References"],
  },
];

function itemHref(label: string, fallback: string) {
  if (label === "GitHub Repository") return GITHUB_URL;
  if (label === "NASA Space Apps 2026") return NASA_URL;
  if (label === "The Challenge") return CHALLENGE_URL;
  if (label === "Mission Scenario") return "/mission/simulation";
  if (label === "Live Monitoring") return "/mission/live";
  if (label === "Health Intelligence" || label === "Explainable Alerts") return "/mission/intelligence";
  if (label === "Action Guidance") return "/mission/guidance";
  if (label === "Offline Mission Mode") return "/mission/offline";
  if (label === "Ground & Research Console") return "/mission/ground";
  if (label === "Cognitive & Behavioral Health") return "/mission/readiness";
  if (label === "Validation & Limitations") return "/mission/validation";
  if (label === "Challenge Submission") return "/mission/submission";
  return fallback;
}

function isExternal(href: string) {
  return href.startsWith("https://");
}

function Brand() {
  return (
    <a href="#home" aria-label="The Mitochondria home" className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <img src={logoAsset.url} alt="" width={920} height={520} className="h-11 w-auto shrink-0 object-contain object-left" />
      <span className="hidden text-[0.68rem] font-bold uppercase leading-tight text-foreground sm:block">
        <span className="block font-medium text-muted-foreground">The</span>
        Mitochondria
      </span>
    </a>
  );
}

function NavLink({ href, children, mobile = false }: { href: string; children: ReactNode; mobile?: boolean }) {
  const external = isExternal(href);
  const link = (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={mobile ? "flex min-h-11 items-center justify-between py-2 text-sm text-foreground" : "flex items-center gap-1.5 text-sm text-popover-foreground outline-none"}
    >
      {children}
      {external && <ExternalLink aria-hidden="true" className="size-3.5" />}
    </a>
  );
  return mobile ? <SheetClose asChild>{link}</SheetClose> : link;
}

function Header() {
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty("--header-offset", `${document.querySelector("header")?.clientHeight ?? 76}px`);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto grid h-[4.75rem] w-full max-w-[94rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-8">
        <Brand />
        <nav aria-label="Primary navigation" className="hidden items-center justify-center gap-1 lg:flex">
          {navigation.map((entry) => entry.items ? (
            <DropdownMenu key={entry.label}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-10 px-2.5 text-muted-foreground hover:text-foreground xl:px-3">
                  {entry.label}<ChevronDown aria-hidden="true" className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 border-border bg-popover/95 p-2 backdrop-blur-xl">
                {entry.items.map((item) => {
                  const href = itemHref(item, entry.href);
                  const external = isExternal(href);
                  return (
                    <DropdownMenuItem key={item} asChild className="min-h-10 cursor-pointer px-3">
                      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined} className="flex items-center gap-1.5">
                        {item}{external && <ExternalLink aria-hidden="true" className="size-3.5" />}
                      </a>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button key={entry.label} variant="ghost" size="sm" asChild className="h-10 px-2.5 text-muted-foreground hover:text-foreground xl:px-3">
              <a href={entry.href}>{entry.label}</a>
            </Button>
          ))}
        </nav>
        <Button asChild className="hidden h-11 bg-primary px-5 font-semibold text-primary-foreground shadow-[0_0_30px_var(--primary-glow)] hover:bg-primary/90 lg:inline-flex">
          <a href={NASA_URL} target="_blank" rel="noopener noreferrer">NASA Space Apps 2026 <ExternalLink aria-hidden="true" /></a>
        </Button>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open navigation menu" className="min-h-11 min-w-11 border-border bg-background/60 lg:hidden"><Menu /></Button>
          </SheetTrigger>
          <SheetContent className="w-[min(92vw,26rem)] overflow-y-auto border-border bg-background p-5 pt-16">
            <SheetHeader className="text-left">
              <SheetTitle>Navigate</SheetTitle>
              <SheetDescription>The Mitochondria project sections</SheetDescription>
            </SheetHeader>
            <nav aria-label="Mobile navigation" className="mt-5">
              <SheetClose asChild><a href="#home" className="flex min-h-11 items-center border-b border-border py-3 font-medium">Home</a></SheetClose>
              <Accordion type="multiple">
                {navigation.filter((entry) => entry.items).map((entry) => (
                  <AccordionItem value={entry.label} key={entry.label}>
                    <AccordionTrigger className="min-h-12 py-3 text-base hover:no-underline">{entry.label}</AccordionTrigger>
                    <AccordionContent>
                      <div className="border-l border-primary/50 pl-4">
                        {entry.items?.map((item) => <NavLink mobile key={item} href={itemHref(item, entry.href)}>{item}</NavLink>)}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <Button asChild className="mt-6 h-12 w-full"><a href={NASA_URL} target="_blank" rel="noopener noreferrer">NASA Space Apps 2026 <ExternalLink /></a></Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

const flow = [
  ["01", "Monitor", "Capture connected physiological, biological and environmental signals."],
  ["02", "Personalize", "Interpret change against each crew member’s evolving baseline."],
  ["03", "Correlate", "Connect health, cognition, workload, habitat and radiation context."],
  ["04", "Detect", "Surface meaningful trends while accounting for data quality."],
  ["05", "Explain", "Make every signal traceable, understandable and reviewable."],
  ["06", "Act", "Support timely, protocol-aligned human decisions."],
  ["07", "Learn", "Preserve provenance and improve mission knowledge over time."],
];

const capabilities: ReadonlyArray<readonly [LucideIcon, string, string]> = [
  [Activity, "Monitoring", "A unified view across diverse mission-health signals and their provenance."],
  [Fingerprint, "Personal baseline", "Contextual interpretation centered on individual change—not generic norms alone."],
  [CircleGauge, "Trend & pattern detection", "Longitudinal patterns designed to become visible before isolated readings dominate."],
  [ShieldCheck, "Risk assessment", "Decision support that communicates uncertainty without making a diagnosis."],
  [BrainCircuit, "Explainable intelligence", "Evidence paths designed to keep humans informed and in control."],
  [HeartPulse, "Action guidance", "Protocol-aware guidance intended to support, never replace, qualified judgment."],
  [CloudOff, "Offline Mission Mode", "Local-first continuity designed for delayed, intermittent or absent connectivity."],
  [RadioTower, "Device-agnostic integration", "An extensible adapter direction for wearables, laboratory systems and habitat telemetry."],
];

export function AppShell() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <Header />
      <main>
        <section id="home" aria-labelledby="hero-title" className="relative flex min-h-[min(56rem,92dvh)] items-end overflow-hidden pt-[var(--header-offset)]">
          <img src={astronautEarthrise} alt="Astronaut looking across Earth’s illuminated horizon from orbit" width={1920} height={1080} fetchPriority="high" className="absolute inset-0 size-full object-cover object-[68%_center]" />
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,var(--hero-overlay)_0%,var(--hero-overlay)_34%,transparent_76%),linear-gradient(0deg,var(--background)_0%,transparent_36%)]" />
          <div className="relative mx-auto w-full max-w-[94rem] px-5 pb-16 pt-28 sm:pb-20 lg:px-8 lg:pb-24">
            <div className="max-w-3xl">
              <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase text-primary"><span className="h-px w-9 bg-primary" />Human health beyond Earth</p>
              <h1 id="hero-title" className="font-display text-5xl font-semibold leading-[0.98] sm:text-6xl lg:text-8xl">Healthy People.<br /><span className="text-primary">Farther Together.</span></h1>
              <p className="mt-7 max-w-2xl text-lg font-medium leading-relaxed text-foreground sm:text-xl">Open-source, offline-first astronaut health intelligence for long-duration human spaceflight.</p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">Turning physiological, biological, cognitive, behavioral and spacecraft-environment data into personalized, explainable and actionable health insight — even when Earth is offline.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild className="h-12 px-6 font-semibold shadow-[0_0_32px_var(--primary-glow)]"><a href="#mission">Explore the Mission <ArrowRight /></a></Button>
                <Button size="lg" variant="outline" asChild className="h-12 border-foreground/30 bg-background/20 px-6 backdrop-blur"><a href="#platform">How It Works</a></Button>
              </div>
              <div className="mt-10 inline-flex items-center gap-3 border-l border-signal px-4 py-2 text-xs uppercase text-muted-foreground"><span className="size-1.5 bg-signal shadow-[0_0_12px_var(--signal)]" />Built for NASA Space Apps Challenge 2026</div>
            </div>
          </div>
        </section>

        <section id="platform" aria-labelledby="flow-title" className="border-y border-border bg-surface py-20 lg:py-28">
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div><p className="section-kicker">The mission health loop</p><h2 id="flow-title" className="section-title">From signal to supported action.</h2></div>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">Not another fitness dashboard. The platform direction unifies personal baselines, laboratory context, cognition, behavior, environment, radiation, data quality and provenance.</p>
            </div>
            <ol className="mt-12 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-7">
              {flow.map(([number, title, copy]) => <li key={title} className="group min-h-52 border-b border-r border-border p-5 transition-colors hover:bg-accent"><span className="font-mono text-xs text-primary">{number}</span><h3 className="mt-8 font-display text-lg font-semibold uppercase">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p></li>)}
            </ol>
          </div>
        </section>

        <section id="science" aria-labelledby="capabilities-title" className="py-20 lg:py-28">
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <p className="section-kicker">Mission capabilities</p><h2 id="capabilities-title" className="section-title max-w-3xl">Intelligence designed around the human.</h2>
            <div className="mt-12 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map(([Icon, title, copy]) => <article key={title} className="min-h-64 border-b border-r border-border p-6 transition-colors hover:bg-surface"><Icon aria-hidden="true" className="size-6 text-primary" /><h3 className="mt-10 font-display text-xl font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p></article>)}
            </div>
            <p className="mt-6 max-w-3xl border-l-2 border-signal pl-5 text-sm leading-6 text-muted-foreground">The Mitochondria is conceived as human decision support—not an autonomous doctor. It does not diagnose and does not replace qualified medical judgment.</p>
          </div>
        </section>

        <section id="mission" aria-labelledby="context-title" className="relative overflow-hidden border-y border-border bg-deep py-24 lg:py-36">
          <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_right,var(--cyan-haze),transparent_62%)]" />
          <div className="relative mx-auto grid max-w-[94rem] gap-14 px-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8">
            <div><p className="section-kicker">Mission principle</p><h2 id="context-title" className="font-display text-4xl font-semibold leading-tight sm:text-5xl lg:text-7xl">Astronaut <span className="text-primary">+</span><br />spacecraft environment<br /><span className="text-muted-foreground">= one health context.</span></h2></div>
            <div className="border-l border-primary/50 pl-7"><Orbit aria-hidden="true" className="size-8 text-signal" /><p className="mt-6 text-lg leading-8 text-foreground">Human health cannot be interpreted independently from mission conditions.</p><p className="mt-4 leading-7 text-muted-foreground">CO₂, radiation, sleep and circadian disruption, workload, habitat conditions and personal physiology form one connected operational picture.</p></div>
          </div>
        </section>

        <section id="technology" aria-labelledby="offline-title" className="py-20 lg:py-28">
          <div className="mx-auto grid max-w-[94rem] gap-12 px-5 lg:grid-cols-2 lg:items-center lg:px-8">
            <div className="relative min-h-[26rem] overflow-hidden border border-border bg-surface p-8">
              <div className="absolute inset-0 opacity-30 grid-lines" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-center justify-between"><span className="font-mono text-xs uppercase text-primary">Local mission node</span><span className="flex items-center gap-2 text-xs text-signal"><span className="size-2 bg-signal" />OPERATING</span></div>
                <CloudOff aria-hidden="true" className="my-14 size-20 text-primary" />
                <div className="grid grid-cols-2 gap-px bg-border"><div className="bg-surface p-4"><span className="block text-xs text-muted-foreground">Earth link</span><strong className="mt-2 block font-mono text-sm">DELAYED</strong></div><div className="bg-surface p-4"><span className="block text-xs text-muted-foreground">Health loop</span><strong className="mt-2 block font-mono text-sm text-signal">CONTINUES</strong></div></div>
              </div>
            </div>
            <div><p className="section-kicker">Offline Mission Mode</p><h2 id="offline-title" className="section-title">No Earth connection?<br />The mission health loop continues.</h2><p className="mt-6 text-lg leading-8 text-muted-foreground">The architecture is designed for local operation: resilient capture, local protocols and rules, store-and-forward synchronization, and graceful degradation when connectivity disappears.</p><p className="mt-5 border-l-2 border-signal pl-4 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Architecture direction:</strong> these capabilities describe the intended system design and are not presented as completed flight functionality.</p></div>
          </div>
        </section>

        <section id="open-source" aria-labelledby="open-title" className="border-y border-border bg-surface py-20 lg:py-28">
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
              <div><p className="section-kicker">Open-source mission</p><h2 id="open-title" className="section-title max-w-4xl">Built to be inspected.<br />Built to be extended.<br /><span className="text-primary">Built beyond one vendor.</span></h2></div>
              <div className="lg:pt-10"><p className="leading-7 text-muted-foreground">An open architecture direction for reproducible science, transparent decisions, adaptable device connectors, health-data interoperability, community contribution and local or self-hostable deployment.</p><Button asChild variant="outline" className="mt-7 h-12 border-primary text-primary hover:bg-primary hover:text-primary-foreground"><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"><Github />View the repository <ExternalLink /></a></Button></div>
            </div>
            <div className="mt-14 grid gap-px bg-border sm:grid-cols-3"><div className="bg-background p-6"><Code2 className="text-primary" /><h3 className="mt-5 font-semibold">Extensible by design</h3><p className="mt-2 text-sm text-muted-foreground">Adapters and interfaces that can evolve with mission needs.</p></div><div className="bg-background p-6"><FlaskConical className="text-primary" /><h3 className="mt-5 font-semibold">Reproducible foundations</h3><p className="mt-2 text-sm text-muted-foreground">Methods and provenance designed to withstand scrutiny.</p></div><div className="bg-background p-6"><Network className="text-primary" /><h3 className="mt-5 font-semibold">Interoperable direction</h3><p className="mt-2 text-sm text-muted-foreground">A path across devices, data models and mission systems.</p></div></div>
          </div>
        </section>

        <section id="about" aria-labelledby="nasa-title" className="py-24 lg:py-32">
          <div className="mx-auto max-w-5xl px-5 text-center lg:px-8"><Sparkles aria-hidden="true" className="mx-auto size-7 text-signal" /><p className="section-kicker mt-6 justify-center">Challenge 2026</p><h2 id="nasa-title" className="font-display text-4xl font-semibold sm:text-6xl">Built for the 2026 NASA International Space Apps Challenge</h2><p className="mx-auto mt-6 max-w-2xl leading-7 text-muted-foreground">An independent open-source project exploring resilient, human-centered health intelligence for crews venturing farther from Earth.</p><Button size="lg" asChild className="mt-8 h-12"><a href={NASA_URL} target="_blank" rel="noopener noreferrer">Visit NASA Space Apps 2026 <ExternalLink /></a></Button></div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const columns = [
    ["Explore", [["Mission", "#mission"], ["Science", "#science"], ["Platform", "#platform"], ["Technology", "#technology"]]],
    ["Project", [["Open Source", "#open-source"], ["Roadmap", "#open-source"], ["Resources & References", "#science"], ["Team", "#about"]]],
    ["External", [["NASA Space Apps 2026", NASA_URL], ["GitHub", GITHUB_URL]]],
  ] as const;
  return (
    <footer className="border-t border-border bg-deep">
      <div className="mx-auto max-w-[94rem] px-5 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,0.6fr)]"><div><Brand /><p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">Open-source, offline-first astronaut health intelligence for long-duration human spaceflight.</p></div>{columns.map(([title, links]) => <div key={title}><h2 className="text-xs font-semibold uppercase text-foreground">{title}</h2><ul className="mt-5 space-y-3">{links.map(([label, href]) => <li key={label}><a href={href} target={isExternal(href) ? "_blank" : undefined} rel={isExternal(href) ? "noopener noreferrer" : undefined} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary">{label}{isExternal(href) && <ExternalLink className="size-3" />}</a></li>)}</ul></div>)}</div>
        <div className="mt-14 grid gap-5 border-t border-border pt-7 text-xs text-muted-foreground sm:grid-cols-2"><div><p>© 2026 The Mitochondria. All rights reserved.</p><p className="mt-2">Built for NASA Space Apps Challenge 2026.</p></div><p className="sm:text-right">Open Source <span className="text-primary">|</span> Offline First <span className="text-primary">|</span> Human-Centered Health Intelligence</p></div>
      </div>
    </footer>
  );
}