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
  Play,
  Users,
  FileText,
  Network,
  Orbit,
  RadioTower,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { TopicCardGrid } from "@/components/knowledge/technology-index";
import { NavigationSearch } from "@/components/navigation-search";
import { competitionTeam, competitionDocuments } from "@/content/competition-team";
import {
  SEARCH_KEYWORDS,
  SECTION_ENTRIES,
  dedupeEntries,
  type SearchEntry,
} from "@/domain/navigation-search/search";
import astronautEarthrise from "@/assets/astronaut-earthrise.jpg";
import logoAsset from "@/assets/mitochondria-logo.png.asset.json";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
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
const CHALLENGE_URL =
  "https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/";
const GITHUB_URL = "https://github.com/computech-gr/astro-vitality-core";
// Direct-download host for competition binaries (exact filenames preserved).
const GITHUB_RAW_URL = "https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main";

type NavigationGroup = {
  title: string;
  href?: string;
  items: readonly string[];
};

type NavigationEntry = {
  label: string;
  href: string;
  description?: string;
  groups?: readonly NavigationGroup[];
};

/**
 * P21 categorized navigation. Every label keeps its existing destination via
 * itemHref(); groups only organize presentation into mega-menu columns.
 */
const navigation: readonly NavigationEntry[] = [
  { label: "Home", href: "/#home" },
  {
    label: "Mission Console",
    href: "/mission/experience",
    description: "Sign in, select a mission, collect synthetic evidence and work with the crew.",
    groups: [
      {
        title: "Mission & crew",
        items: [
          "Mission Identity & Sign-in",
          "Mission Workspace",
          "Mission & Crew Operations",
          "Daily Readiness Check-in",
          "Daily Health Companion",
        ],
      },
      {
        title: "Measurements",
        items: [
          "Unified Data Intake",
          "Astronaut Health Report",
          "Live Monitoring",
          "Device Integration Center",
          "Recorded Mission Data",
          "Offline Mission Mode",
        ],
      },
      {
        title: "Ground operations",
        items: ["Ground & Research Console", "Mission Scenario", "AI Administration & Usage"],
      },
    ],
  },
  {
    label: "Health & Intelligence",
    href: "/mission/intelligence",
    description: "Review synthetic documents, health domains and research-only intelligence.",
    groups: [
      {
        title: "Evidence & context",
        items: [
          "Mission Documents",
          "Platform Overview",
          "Astronaut Health Twin",
          "Personalization",
        ],
      },
      {
        title: "Health domains",
        items: ["Bone Health", "Cardiovascular Health", "Immune Changes", "Behavioral Health", "Medical Report"],
      },
      {
        title: "Research intelligence",
        items: [
          "Health Intelligence",
          "Synthetic Research AI",
          "Ground Medical Workspace",
          "Research Workspace",
          "Explainable Alerts",
          "Action Guidance",
          "NASA Scientific Evidence",
        ],
      },
    ],
  },
  {
    label: "Science",
    href: "/#science",
    description: "Evidence, biomarkers, baselines and scientific boundaries.",
    groups: [
      {
        title: "Foundations",
        items: [
          "Scientific Foundation",
          "Spaceflight Health Risks",
          "Biomarkers & Signals",
          "Personal Baselines",
        ],
      },
      {
        title: "Context & safety",
        items: [
          "Cognitive & Behavioral Health",
          "Environment & Radiation",
          "Scientific Safety Boundaries",
        ],
      },
    ],
  },
  {
    label: "Technology",
    href: "/#technology",
    description: "Architecture, device interfaces, data and security.",
    groups: [
      {
        title: "Architecture",
        items: [
          "System Architecture",
          "Canonical Health Data Model",
          "Offline-First Architecture",
          "Security & Privacy",
        ],
      },
      {
        title: "Data sources",
        items: [
          "Device Integration",
          "Wearables",
          "Medical & Laboratory Data",
          "Environmental Telemetry",
        ],
      },
      { title: "Overview", items: ["All Technology Topics"] },
    ],
  },
  {
    label: "About & Open Source",
    href: "/#about",
    description: "Challenge background, open-source documentation and project status.",
    groups: [
      {
        title: "Project",
        items: [
          "Official NASA Challenge",
          "Our Mission",
          "Why Autonomous Health",
          "Long-Duration Spaceflight",
          "The Mitochondria",
          "Our Team — NASA Space Apps 2026",
          "Official NASA Team Profile",
          "Roadmap",
        ],
      },
      {
        title: "Competition Materials",
        items: [
          "NASA Competition Presentation (PDF)",
          "NASA Evaluator Quick Start (PDF)",
          "Master Technical Manual (PDF)",
          "Narrated Presentation (PPTX)",
          "Watch NASA Demo Video",
          "Download NASA Demo Video (MP4)",
        ],
      },
      {
        title: "Open source",
        href: "/#open-source",
        items: [
          "Open-Source Mission",
          "GitHub Repository",
          "Documentation",
          "Device Adapter SDK",
          "Data & Interoperability",
          "Contributing",
          "License",
        ],
      },
      {
        title: "Governance & references",
        items: [
          "Security Policy",
          "Scientific Approach",
          "Validation & Limitations",
          "Challenge Submission",
          "Resources & References",
          "NASA Space Apps 2026",
        ],
      },
      {
        title: "Backend",
        items: [
          "Backend Architecture (GitHub)",
          "Database Schema & Migrations (GitHub)",
          "Access Rules / RLS (GitHub)",
        ],
      },
    ],
  },
];

/** P21: Technology labels open dedicated educational topic pages. */
const technologyTopicDestinations: Readonly<Record<string, string>> = {
  "All Technology Topics": "/technology",
  "System Architecture": "/technology/system-architecture",
  "Device Integration": "/technology/device-integration",
  Wearables: "/technology/wearables",
  "Medical & Laboratory Data": "/technology/medical-laboratory-data",
  "Environmental Telemetry": "/technology/environmental-telemetry",
  "Canonical Health Data Model": "/technology/canonical-health-data-model",
  "Offline-First Architecture": "/technology/offline-first-architecture",
  "Security & Privacy": "/technology/security-privacy",
};

function guideHref(anchor: string) {
  return `/project/guide#${anchor}`;
}

const guideDestinations: Readonly<Record<string, string>> = {
  "Our Mission": guideHref("our-mission"),
  "Why Autonomous Health": guideHref("why-autonomous-health"),
  "Long-Duration Spaceflight": guideHref("long-duration-spaceflight"),
  "Scientific Foundation": guideHref("scientific-foundation"),
  "Spaceflight Health Risks": guideHref("spaceflight-health-risks"),
  "Biomarkers & Signals": guideHref("biomarkers-signals"),
  "Personal Baselines": guideHref("personal-baselines"),
  "Environment & Radiation": guideHref("environment-radiation"),
  "Scientific Safety Boundaries": guideHref("scientific-safety-boundaries"),
  "Platform Overview": guideHref("platform-overview"),
  "Astronaut Health Twin": guideHref("astronaut-health-twin"),
  Personalization: guideHref("personalization"),
  "System Architecture": guideHref("system-architecture"),
  "Device Integration": guideHref("device-integration"),
  Wearables: guideHref("wearables"),
  "Medical & Laboratory Data": guideHref("medical-laboratory-data"),
  "Environmental Telemetry": guideHref("environmental-telemetry"),
  "Canonical Health Data Model": guideHref("canonical-health-data-model"),
  "Offline-First Architecture": guideHref("offline-first-architecture"),
  "Security & Privacy": guideHref("security-privacy"),
  "Open-Source Mission": guideHref("open-source-mission"),
  Documentation: guideHref("documentation"),
  "Device Adapter SDK": guideHref("device-adapter-sdk"),
  "Data & Interoperability": guideHref("data-interoperability"),
  Contributing: guideHref("contributing"),
  "Security Policy": guideHref("security-policy"),
  License: guideHref("license"),
  "The Mitochondria": guideHref("the-mitochondria"),
  Team: guideHref("team"),
  "Scientific Approach": guideHref("scientific-approach"),
  Roadmap: guideHref("roadmap"),
  "Resources & References": guideHref("resources-references"),
};

function itemHref(label: string, fallback: string) {
  if (technologyTopicDestinations[label]) return technologyTopicDestinations[label];
  if (label === "Our Team — NASA Space Apps 2026") return "/competition/team";
  if (label === "Official NASA Team Profile") return competitionTeam.officialUrl;
  if (label === "Watch NASA Demo Video") return "/competition/demo-video";
  if (label === "Narrated Presentation (PPTX)")
    return `${GITHUB_RAW_URL}/docs/competition/MITOCHONDRIA_NASA_2026_Professional_Narrated_Presentation_Final.pptx`;
  if (label === "Download NASA Demo Video (MP4)")
    return `${GITHUB_RAW_URL}/docs/competition/MITOCHONDRIA_NASA_2026_Official_Demo_FINAL.mp4`;
  if (label === "NASA Competition Presentation (PDF)")
    return `${GITHUB_URL}/blob/main/docs/competition/MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf`;
  if (label === "NASA Evaluator Quick Start (PDF)")
    return `${GITHUB_URL}/blob/main/docs/competition/MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf`;
  if (label === "Master Technical Manual (PDF)")
    return `${GITHUB_URL}/blob/main/docs/competition/MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf`;
  if (label === "GitHub Repository") return GITHUB_URL;
  if (label === "Backend Architecture (GitHub)")
    return `${GITHUB_URL}/blob/main/docs/ARCHITECTURE.md`;
  if (label === "Database Schema & Migrations (GitHub)")
    return `${GITHUB_URL}/tree/main/supabase/migrations`;
  if (label === "Access Rules / RLS (GitHub)")
    return `${GITHUB_URL}/blob/main/docs/SECURITY_MODEL.md`;
  if (label === "NASA Space Apps 2026") return NASA_URL;
  if (label === "Official NASA Challenge") return CHALLENGE_URL;
  if (label === "Mission Scenario") return "/mission/simulation";
  if (label === "AI Administration & Usage") return "/mission/ai-administration";
  if (label === "Mission Identity & Sign-in") return "/mission/identity";
  if (label === "Mission & Crew Operations") return "/mission/operations";
  if (label === "Mission Workspace") return "/mission/experience";
  if (label === "Daily Readiness Check-in") return "/mission/readiness";
  if (label === "Daily Health Companion") return "/mission/companion";
  if (label === "Unified Data Intake") return "/mission/intake";
  if (label === "Astronaut Health Report" || label === "Medical Report") return "/mission/health-report";
  if (label === "Live Monitoring") return "/mission/live";
  if (label === "Device Integration Center") return "/mission/devices";
  if (label === "Recorded Mission Data") return "/mission/records";
  if (label === "Mission Documents") return "/mission/documents";
  if (label === "Health Intelligence") return "/mission/intelligence";
  if (label === "Synthetic Research AI") return "/mission/health-report#synthetic-research-qa";
  if (label === "NASA Scientific Evidence") return "/mission/nasa-evidence";
  if (label === "Bone Health") return "/mission/bone-health";
  if (label === "Immune Changes") return "/mission/immune-health";
  if (label === "Cardiovascular Health") return "/mission/cardiovascular-health";
  if (label === "Behavioral Health") return "/mission/behavioral-health";
  if (label === "Explainable Alerts") return "/mission/alerts";
  if (label === "Action Guidance") return "/mission/guidance";
  if (label === "Offline Mission Mode") return "/mission/offline";
  if (label === "Ground & Research Console" || label === "Ground Medical Workspace" || label === "Research Workspace") return "/mission/ground";
  if (label === "Cognitive & Behavioral Health") return "/mission/readiness";
  if (label === "Validation & Limitations") return "/mission/validation";
  if (label === "Challenge Submission") return "/mission/submission";
  return guideDestinations[label] ?? fallback;
}

/**
 * Global search catalogue, derived from the same navigation + itemHref()
 * mapping as the menus (no second catalogue). Public labels only.
 */
export const searchCatalogue: readonly SearchEntry[] = dedupeEntries([
  ...navigation.flatMap((entry) =>
    entry.groups
      ? entry.groups.flatMap((group) =>
          group.items.map((item) => ({
            title: item,
            href: itemHref(item, group.href ?? entry.href),
            category: entry.label,
            description: group.title,
            keywords: SEARCH_KEYWORDS[item],
          })),
        )
      : [{ title: entry.label, href: entry.href, category: "Home", description: "Start page" }],
  ),
  ...SECTION_ENTRIES,
  {
    title: "Project Guide",
    href: "/project/guide",
    category: "Open Source & About",
    description: "Every project section in one guide",
    keywords: ["guide", "overview", "docs"],
  },
]);

function isExternal(href: string) {
  return href.startsWith("https://");
}

function Brand() {
  return (
    <a
      href="/#home"
      aria-label="The Mitochondria home"
      className="flex min-w-0 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <img
        src={logoAsset.url}
        alt=""
        width={920}
        height={520}
        className="h-11 w-auto shrink-0 object-contain object-left"
      />
      <span className="hidden text-[0.68rem] font-bold uppercase leading-tight text-foreground sm:block">
        <span className="block font-medium text-muted-foreground">The</span>
        Mitochondria
      </span>
    </a>
  );
}

function NavLink({
  href,
  children,
  mobile = false,
}: {
  href: string;
  children: ReactNode;
  mobile?: boolean;
}) {
  const external = isExternal(href);
  const link = (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={
        mobile
          ? "flex min-h-11 items-center justify-between py-2 text-sm text-foreground"
          : "flex items-center gap-1.5 text-sm text-popover-foreground outline-none"
      }
    >
      {children}
      {external && <ExternalLink aria-hidden="true" className="size-3.5" />}
    </a>
  );
  return mobile ? <SheetClose asChild>{link}</SheetClose> : link;
}

export function SiteHeader() {
  useEffect(() => {
    const update = () =>
      document.documentElement.style.setProperty(
        "--header-offset",
        `${document.querySelector("[data-site-header]")?.clientHeight ?? 76}px`,
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return (
    <header
      data-site-header
      className="fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-xl"
    >
      <div className="mx-auto grid h-[4.75rem] w-full max-w-[94rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 lg:px-8 xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Brand />
        <nav
          aria-label="Primary navigation"
          className="hidden items-center justify-center gap-0.5 xl:flex"
        >
          {navigation.map((entry) =>
            entry.groups ? (
              <DropdownMenu key={entry.label} modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-2.5 text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
                  >
                    {entry.label}
                    <ChevronDown aria-hidden="true" className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="center"
                  collisionPadding={16}
                  data-mega-menu={entry.label}
                  className="max-h-[calc(100dvh-6rem)] w-[min(calc(100vw-2rem),var(--mega-width))] overflow-y-auto border-border bg-popover/95 p-0 backdrop-blur-xl"
                  style={{
                    ["--mega-width" as string]: `${Math.min(entry.groups.length, 4) * 15 + 2}rem`,
                  }}
                >
                  {entry.description && (
                    <p className="border-b border-border px-5 py-3 text-xs text-muted-foreground">
                      {entry.description}
                    </p>
                  )}
                  <div
                    className="grid gap-x-2 p-3"
                    style={{
                      gridTemplateColumns: `repeat(${Math.min(entry.groups.length, 4)}, minmax(0, 1fr))`,
                    }}
                  >
                    {entry.groups.map((group) => (
                      <DropdownMenuGroup key={group.title} className="min-w-0">
                        <DropdownMenuLabel className="px-3 pb-1 pt-2 font-mono text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
                          {group.title}
                        </DropdownMenuLabel>
                        {group.items.map((item) => {
                          const href = itemHref(item, group.href ?? entry.href);
                          const external = isExternal(href);
                          return (
                            <DropdownMenuItem
                              key={item}
                              asChild
                              className="min-h-10 cursor-pointer px-3"
                            >
                              <a
                                href={href}
                                target={external ? "_blank" : undefined}
                                rel={external ? "noopener noreferrer" : undefined}
                                className="flex items-center gap-1.5"
                              >
                                {item}
                                {external && (
                                  <>
                                    <ExternalLink aria-hidden="true" className="size-3.5" />
                                    <span className="sr-only"> (opens in a new tab)</span>
                                  </>
                                )}
                              </a>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuGroup>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                key={entry.label}
                variant="ghost"
                size="sm"
                asChild
                className="h-10 px-2.5 text-muted-foreground hover:text-foreground"
              >
                <a href={entry.href}>{entry.label}</a>
              </Button>
            ),
          )}
        </nav>
        <div className="flex items-center gap-2">
          <NavigationSearch entries={searchCatalogue} />
          <Button
            asChild
            className="hidden h-11 bg-primary px-4 font-semibold text-primary-foreground shadow-[0_0_30px_var(--primary-glow)] hover:bg-primary/90 2xl:inline-flex"
          >
            <a href={NASA_URL} target="_blank" rel="noopener noreferrer">
              NASA Space Apps 2026 <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open navigation menu"
                className="min-h-11 min-w-11 border-border bg-background/60 xl:hidden"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[min(92vw,26rem)] overflow-y-auto border-border bg-background p-5 pt-16">
              <SheetHeader className="text-left">
                <SheetTitle>Navigate</SheetTitle>
                <SheetDescription>The Mitochondria project sections</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile navigation" className="mt-5">
                <SheetClose asChild>
                  <a
                    href="/#home"
                    className="flex min-h-11 items-center border-b border-border py-3 font-medium"
                  >
                    Home
                  </a>
                </SheetClose>
                <Accordion type="multiple">
                  {navigation
                    .filter((entry) => entry.groups)
                    .map((entry) => (
                      <AccordionItem value={entry.label} key={entry.label}>
                        <AccordionTrigger className="min-h-12 py-3 text-base hover:no-underline">
                          {entry.label}
                        </AccordionTrigger>
                        <AccordionContent>
                          {entry.groups?.map((group) => (
                            <div
                              key={group.title}
                              role="group"
                              aria-label={`${entry.label}: ${group.title}`}
                              className="mb-3 border-l border-primary/50 pl-4"
                            >
                              <p className="pb-1 pt-2 font-mono text-[0.65rem] font-semibold uppercase tracking-wider text-primary">
                                {group.title}
                              </p>
                              {group.items.map((item) => (
                                <NavLink
                                  mobile
                                  key={item}
                                  href={itemHref(item, group.href ?? entry.href)}
                                >
                                  {item}
                                </NavLink>
                              ))}
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                </Accordion>
                <Button asChild className="mt-6 h-12 w-full">
                  <a href={NASA_URL} target="_blank" rel="noopener noreferrer">
                    NASA Space Apps 2026 <ExternalLink />
                  </a>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
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

const capabilities: ReadonlyArray<readonly [LucideIcon, string, string, string, string]> = [
  [
    Activity,
    "Monitoring",
    "A unified view across physiological, environmental and self-reported signals, each shown with its source, freshness and quality — LIVE, STALE or DISCONNECTED is always visible.",
    "/mission/live",
    "Open Live Monitoring",
  ],
  [
    Fingerprint,
    "Personal baseline",
    "Each crew member is compared with their own versioned baseline, kept separate from clinical reference intervals and mission limits.",
    "/project/guide#personal-baselines",
    "Learn about baselines",
  ],
  [
    CircleGauge,
    "Trend & pattern detection",
    "Governed trend policies look across days, not single readings, and report confidence, confounders and missing context.",
    "/mission/intelligence",
    "Open Health Intelligence",
  ],
  [
    ShieldCheck,
    "Risk assessment",
    "Decision support that states uncertainty openly. Research-only relationships can never become operational alerts or a diagnosis.",
    "/project/guide#scientific-safety-boundaries",
    "Read the safety boundaries",
  ],
  [
    BrainCircuit,
    "Explainable intelligence",
    "Every finding carries its evidence path so crew and ground teams can see why it appeared — and challenge it.",
    "/mission/alerts",
    "Open Explainable Alerts",
  ],
  [
    HeartPulse,
    "Action guidance",
    "Versioned protocol guidance such as repeat measurement or workload review supports, never replaces, qualified judgment.",
    "/mission/guidance",
    "Open Action Guidance",
  ],
  [
    CloudOff,
    "Offline Mission Mode",
    "Encrypted local storage and a store-and-forward queue keep the health loop running when Earth is out of contact.",
    "/technology/offline-first-architecture",
    "Learn how offline works",
  ],
  [
    RadioTower,
    "Device-agnostic integration",
    "One adapter contract for wearables, laboratory systems and habitat telemetry; unknown metrics are rejected, not guessed.",
    "/technology/device-integration",
    "Learn about integration",
  ],
];

export function AppShell() {
  return (
    <div className="min-h-dvh overflow-x-clip bg-background text-foreground">
      <main>
        <section
          id="home"
          aria-labelledby="hero-title"
          className="relative flex min-h-[min(56rem,92dvh)] items-end overflow-hidden"
        >
          <img
            src={astronautEarthrise}
            alt="Astronaut looking across Earth’s illuminated horizon from orbit"
            width={1920}
            height={1080}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-[68%_center]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(90deg,var(--hero-overlay)_0%,var(--hero-overlay)_34%,transparent_76%),linear-gradient(0deg,var(--background)_0%,transparent_36%)]"
          />
          <div className="relative mx-auto w-full max-w-[94rem] px-5 pb-16 pt-28 sm:pb-20 lg:px-8 lg:pb-24">
            <div className="max-w-3xl">
              <p className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase text-primary">
                <span className="h-px w-9 bg-primary" />
                Human health beyond Earth
              </p>
              <h1
                id="hero-title"
                className="font-display text-5xl font-semibold leading-[0.98] sm:text-6xl lg:text-8xl"
              >
                Healthy People.
                <br />
                <span className="text-primary">Farther Together.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-lg font-medium leading-relaxed text-foreground sm:text-xl">
                Open-source, offline-first astronaut health intelligence for long-duration human
                spaceflight.
              </p>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                Turning physiological, biological, cognitive, behavioral and spacecraft-environment
                data into personalized, explainable and actionable health insight — even when Earth
                is offline.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  size="lg"
                  asChild
                  className="h-12 px-6 font-semibold shadow-[0_0_32px_var(--primary-glow)]"
                >
                  <a href="#mission">
                    Explore the Mission <ArrowRight />
                  </a>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  asChild
                  className="h-12 border-foreground/30 bg-background/20 px-6 backdrop-blur"
                >
                  <a href="#platform">How It Works</a>
                </Button>
              </div>
              <div className="mt-10 inline-flex items-center gap-3 border-l border-signal px-4 py-2 text-xs uppercase text-muted-foreground">
                <span className="size-1.5 bg-signal shadow-[0_0_12px_var(--signal)]" />
                Built for NASA Space Apps Challenge 2026
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="explore-title"
          className="border-t border-border bg-deep py-10 lg:py-14"
        >
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <h2 id="explore-title" className="font-display text-2xl font-semibold sm:text-3xl">
              Explore MITOCHONDRIA
            </h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Watch the Demo", href: "/competition/demo-video", Icon: Play },
                { label: "Meet the Team", href: "/competition/team", Icon: Users },
                {
                  label: "Evaluator Quick Start Guide",
                  href: competitionDocuments[1].url,
                  Icon: FileText,
                },
                {
                  label: "Explore the Platform",
                  href: "/project/guide#platform-guide",
                  Icon: Network,
                },
              ].map(({ label, href, Icon }) => (
                <Button
                  key={label}
                  asChild
                  variant="outline"
                  className="h-auto min-h-16 justify-start gap-3 whitespace-normal px-4 py-4 text-left"
                >
                  <a
                    href={href}
                    target={isExternal(href) ? "_blank" : undefined}
                    rel={isExternal(href) ? "noopener noreferrer" : undefined}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">{label}</span>
                    {isExternal(href) ? (
                      <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                    ) : (
                      <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                    )}
                  </a>
                </Button>
              ))}
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Demo, team and documentation are public. Mission Console tasks may require sign-in and
              an authorized mission membership.
            </p>
          </div>
        </section>

        <section
          id="platform"
          aria-labelledby="flow-title"
          className="border-y border-border bg-surface py-20 lg:py-28"
        >
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="section-kicker">The mission health loop</p>
                <h2 id="flow-title" className="section-title">
                  From signal to supported action.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
                Not another fitness dashboard. The platform direction unifies personal baselines,
                laboratory context, cognition, behavior, environment, radiation, data quality and
                provenance.
              </p>
            </div>
            <ol className="mt-12 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-7">
              {flow.map(([number, title, copy]) => (
                <li
                  key={title}
                  className="group min-h-52 border-b border-r border-border p-5 transition-colors hover:bg-accent"
                >
                  <span className="font-mono text-xs text-primary">{number}</span>
                  <h3 className="mt-8 font-display text-lg font-semibold uppercase">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="science" aria-labelledby="capabilities-title" className="py-20 lg:py-28">
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <p className="section-kicker">Mission capabilities</p>
            <h2 id="capabilities-title" className="section-title max-w-3xl">
              Intelligence designed around the human.
            </h2>
            <div className="mt-12 grid border-l border-t border-border sm:grid-cols-2 lg:grid-cols-4">
              {capabilities.map(([Icon, title, copy, href, linkLabel]) => (
                <article
                  key={title}
                  className="group flex min-h-72 flex-col border-b border-r border-border p-6 transition-colors hover:bg-surface"
                >
                  <Icon aria-hidden="true" className="size-6 text-primary" />
                  <h3 className="mt-10 font-display text-xl font-semibold">{title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{copy}</p>
                  <a
                    href={href}
                    className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {linkLabel}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 transition-transform group-hover:translate-x-1"
                    />
                  </a>
                </article>
              ))}
            </div>
            <p className="mt-6 max-w-3xl border-l-2 border-signal pl-5 text-sm leading-6 text-muted-foreground">
              The Mitochondria is conceived as human decision support—not an autonomous doctor. It
              does not diagnose and does not replace qualified medical judgment.
            </p>
          </div>
        </section>

        <section
          id="mission"
          aria-labelledby="context-title"
          className="relative overflow-hidden border-y border-border bg-deep py-24 lg:py-36"
        >
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_right,var(--cyan-haze),transparent_62%)]"
          />
          <div className="relative mx-auto grid max-w-[94rem] gap-14 px-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8">
            <div>
              <p className="section-kicker">Mission principle</p>
              <h2
                id="context-title"
                className="font-display text-4xl font-semibold leading-tight sm:text-5xl lg:text-7xl"
              >
                Astronaut <span className="text-primary">+</span>
                <br />
                spacecraft environment
                <br />
                <span className="text-muted-foreground">= one health context.</span>
              </h2>
            </div>
            <div className="border-l border-primary/50 pl-7">
              <Orbit aria-hidden="true" className="size-8 text-signal" />
              <p className="mt-6 text-lg leading-8 text-foreground">
                Human health cannot be interpreted independently from mission conditions.
              </p>
              <p className="mt-4 leading-7 text-muted-foreground">
                CO₂, radiation, sleep and circadian disruption, workload, habitat conditions and
                personal physiology form one connected operational picture.
              </p>
            </div>
          </div>
        </section>

        <section id="technology" aria-labelledby="offline-title" className="py-20 lg:py-28">
          <div className="mx-auto grid max-w-[94rem] gap-12 px-5 lg:grid-cols-2 lg:items-center lg:px-8">
            <div className="relative min-h-[26rem] overflow-hidden border border-border bg-surface p-8">
              <div className="absolute inset-0 opacity-30 grid-lines" />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase text-primary">
                    Local mission node
                  </span>
                  <span className="flex items-center gap-2 text-xs text-signal">
                    <span className="size-2 bg-signal" />
                    OPERATING
                  </span>
                </div>
                <CloudOff aria-hidden="true" className="my-14 size-20 text-primary" />
                <div className="grid grid-cols-2 gap-px bg-border">
                  <div className="bg-surface p-4">
                    <span className="block text-xs text-muted-foreground">Earth link</span>
                    <strong className="mt-2 block font-mono text-sm">DELAYED</strong>
                  </div>
                  <div className="bg-surface p-4">
                    <span className="block text-xs text-muted-foreground">Health loop</span>
                    <strong className="mt-2 block font-mono text-sm text-signal">CONTINUES</strong>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <p className="section-kicker">Offline Mission Mode</p>
              <h2 id="offline-title" className="section-title">
                No Earth connection?
                <br />
                The mission health loop continues.
              </h2>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                The architecture is designed for local operation: resilient capture, local protocols
                and rules, store-and-forward synchronization, and graceful degradation when
                connectivity disappears.
              </p>
              <p className="mt-5 border-l-2 border-signal pl-4 text-sm leading-6 text-muted-foreground">
                <strong className="text-foreground">Architecture direction:</strong> these
                capabilities describe the intended system design and are not presented as completed
                flight functionality.
              </p>
            </div>
          </div>
        </section>

        <section
          id="technology-topics"
          aria-labelledby="topics-title"
          className="border-t border-border py-20 lg:py-28"
        >
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <p className="section-kicker">Technology</p>
                <h2 id="topics-title" className="section-title">
                  How the platform is built.
                </h2>
              </div>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
                Eight in-depth topics explain each part of the architecture, why it matters beyond
                low Earth orbit, and exactly what is implemented today.
              </p>
            </div>
            <div className="mt-12">
              <TopicCardGrid />
            </div>
            <a
              href="/technology"
              className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              View all technology topics <ArrowRight aria-hidden="true" className="size-4" />
            </a>
          </div>
        </section>

        <section
          id="open-source"
          aria-labelledby="open-title"
          className="border-y border-border bg-surface py-20 lg:py-28"
        >
          <div className="mx-auto max-w-[94rem] px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
              <div>
                <p className="section-kicker">Open-source mission</p>
                <h2 id="open-title" className="section-title max-w-4xl">
                  Built to be inspected.
                  <br />
                  Built to be extended.
                  <br />
                  <span className="text-primary">Built beyond one vendor.</span>
                </h2>
              </div>
              <div className="lg:pt-10">
                <p className="leading-7 text-muted-foreground">
                  An open architecture direction for reproducible science, transparent decisions,
                  adaptable device connectors, health-data interoperability, community contribution
                  and local or self-hostable deployment.
                </p>
                <Button
                  asChild
                  variant="outline"
                  className="mt-7 h-12 border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                >
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                    <Github />
                    View the repository <ExternalLink />
                  </a>
                </Button>
              </div>
            </div>
            <div className="mt-14 grid gap-px bg-border sm:grid-cols-3">
              <div className="bg-background p-6">
                <Code2 className="text-primary" />
                <h3 className="mt-5 font-semibold">Extensible by design</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Adapters and interfaces that can evolve with mission needs.
                </p>
              </div>
              <div className="bg-background p-6">
                <FlaskConical className="text-primary" />
                <h3 className="mt-5 font-semibold">Reproducible foundations</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Methods and provenance designed to withstand scrutiny.
                </p>
              </div>
              <div className="bg-background p-6">
                <Network className="text-primary" />
                <h3 className="mt-5 font-semibold">Interoperable direction</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  A path across devices, data models and mission systems.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="about" aria-labelledby="nasa-title" className="py-24 lg:py-32">
          <div className="mx-auto max-w-5xl px-5 text-center lg:px-8">
            <Sparkles aria-hidden="true" className="mx-auto size-7 text-signal" />
            <p className="section-kicker mt-6 justify-center">Challenge 2026</p>
            <h2 id="nasa-title" className="font-display text-4xl font-semibold sm:text-6xl">
              Built for the 2026 NASA International Space Apps Challenge
            </h2>
            <p className="mx-auto mt-6 max-w-2xl leading-7 text-muted-foreground">
              An independent open-source project exploring resilient, human-centered health
              intelligence for crews venturing farther from Earth.
            </p>
            <Button size="lg" asChild className="mt-8 h-12">
              <a href={NASA_URL} target="_blank" rel="noopener noreferrer">
                Visit NASA Space Apps 2026 <ExternalLink />
              </a>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const columns = [
    [
      "Explore",
      [
        ["Mission", "#mission"],
        ["Science", "#science"],
        ["Platform", "#platform"],
        ["Technology", "/technology"],
      ],
    ],
    [
      "Project",
      [
        ["Open Source", "#open-source"],
        ["Roadmap", "/project/guide#roadmap"],
        ["Resources & References", "/project/guide#resources-references"],
        ["Team", "/project/guide#team"],
      ],
    ],
    [
      "External",
      [
        ["NASA Space Apps 2026", NASA_URL],
        ["GitHub", GITHUB_URL],
      ],
    ],
  ] as const;
  return (
    <footer className="border-t border-border bg-deep">
      <div className="mx-auto max-w-[94rem] px-5 py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,0.6fr)]">
          <div>
            <Brand />
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">
              Open-source, offline-first astronaut health intelligence for long-duration human
              spaceflight.
            </p>
          </div>
          {columns.map(([title, links]) => (
            <div key={title}>
              <h2 className="text-xs font-semibold uppercase text-foreground">{title}</h2>
              <ul className="mt-5 space-y-3">
                {links.map(([label, href]) => (
                  <li key={label}>
                    <a
                      href={href}
                      target={isExternal(href) ? "_blank" : undefined}
                      rel={isExternal(href) ? "noopener noreferrer" : undefined}
                      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {label}
                      {isExternal(href) && <ExternalLink className="size-3" />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 grid gap-5 border-t border-border pt-7 text-xs text-muted-foreground sm:grid-cols-2">
          <div>
            <p>© 2026 The Mitochondria. Licensed under the Apache License 2.0.</p>
            <p className="mt-2">Built for NASA Space Apps Challenge 2026.</p>
          </div>
          <p className="sm:text-right">
            Open Source <span className="text-primary">|</span> Offline First{" "}
            <span className="text-primary">|</span> Human-Centered Health Intelligence
          </p>
        </div>
      </div>
    </footer>
  );
}
