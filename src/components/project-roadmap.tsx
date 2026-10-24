import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

import {
  ROADMAP_CATEGORIES,
  ROADMAP_GITHUB_DOCS_URL,
  ROADMAP_PHASES,
  ROADMAP_STATUS_LABELS,
  ROADMAP_UNVERIFIED_ENTRIES,
  ROADMAP_VALIDATION_DIMENSIONS,
  type RoadmapCategory,
  type RoadmapPhase,
  type RoadmapStatus,
} from "@/content/roadmap-phases";

const githubHref = (path: string) => ROADMAP_GITHUB_DOCS_URL + path;

const BANDS: readonly { label: string; from: number; to: number }[] = [
  { label: "P0–P3 · Foundation", from: 0, to: 3 },
  { label: "P4–P14 · Core health platform", from: 4, to: 14 },
  { label: "P15–P20 · Ground, security, release & demo", from: 15, to: 20 },
  { label: "P21–P36 · Science, persistence & mission operations", from: 21, to: 36 },
  { label: "P37–P47 · Scientific review & competition handoff", from: 37, to: 47 },
];

const STATUS_STYLE: Record<RoadmapStatus, string> = {
  implemented: "border-primary/40 text-primary",
  review_only: "border-border text-muted-foreground",
  gate_open: "border-primary/70 text-foreground",
  referenced_only: "border-dashed border-border text-muted-foreground",
};

function matches(phase: RoadmapPhase, q: string) {
  if (!q) return true;
  const hay = [phase.id, phase.title, phase.summary, ...(phase.subphases ?? []).flatMap((s) => [s.id, s.title])].join(" ").toLowerCase();
  return hay.includes(q);
}

export function ProjectRoadmap() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<RoadmapCategory | "all">("all");
  const [status, setStatus] = useState<RoadmapStatus | "all">("all");

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => ROADMAP_PHASES.filter((p) => (category === "all" || p.category === category) && (status === "all" || p.status === status) && matches(p, q)),
    [category, status, q],
  );
  const subCount = ROADMAP_PHASES.reduce((n, p) => n + (p.subphases?.length ?? 0), 0);

  return (
    <section id="roadmap-detail" aria-labelledby="roadmap-detail-title" className="mt-20 scroll-mt-28">
      <p className="section-kicker">About</p>
      <h2 id="roadmap-detail-title" className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Development roadmap</h2>
      <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
        {ROADMAP_PHASES.length} numbered phases and {subCount} subphase records reconstructed from repository documentation. Status describes documentation and implementation evidence only; passing automated checks is not scientific, clinical or flight validation.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label="Validation dimensions">
        {ROADMAP_VALIDATION_DIMENSIONS.map((dim) => (
          <div key={dim.id} className="border border-border bg-surface p-4">
            <p className="text-xs font-medium text-primary">{dim.label}</p>
            <p className="mt-1 text-sm font-semibold">{dim.state}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{dim.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Search phases
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. P23, OCR, review" className="h-10 border border-border bg-background px-3 text-sm text-foreground" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Category
          <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value as RoadmapCategory | "all")} className="h-10 border border-border bg-background px-3 text-sm text-foreground">
            <option value="all">All categories</option>
            {ROADMAP_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Status
          <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as RoadmapStatus | "all")} className="h-10 border border-border bg-background px-3 text-sm text-foreground">
            <option value="all">All statuses</option>
            {(Object.keys(ROADMAP_STATUS_LABELS) as RoadmapStatus[]).map((s) => <option key={s} value={s}>{ROADMAP_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">{filtered.length} of {ROADMAP_PHASES.length} phases shown</p>

      <div className="mt-6 space-y-10">
        {BANDS.map((band) => {
          const phases = filtered.filter((p) => p.number >= band.from && p.number <= band.to);
          if (phases.length === 0) return null;
          return (
            <div key={band.label}>
              <h3 className="text-sm font-semibold text-muted-foreground">{band.label}</h3>
              <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {phases.map((phase) => (
                  <li key={phase.id} id={`roadmap-${phase.id.toLowerCase()}`} className="flex flex-col border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-primary">{phase.id}</span>
                      <span className={`border px-2 py-0.5 text-[11px] ${STATUS_STYLE[phase.status]}`}>{ROADMAP_STATUS_LABELS[phase.status]}</span>
                    </div>
                    <a href={githubHref(phase.doc)} target="_blank" rel="noopener noreferrer" aria-label={`${phase.id} ${phase.title} document (opens GitHub in a new tab)`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold hover:text-primary hover:underline">
                      {phase.title}
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{phase.summary}</p>
                    {phase.verifier && (
                      <a href={githubHref(phase.verifier)} target="_blank" rel="noopener noreferrer" className="mt-2 text-[11px] text-muted-foreground hover:text-primary hover:underline">
                        Automated verifier: {phase.verifier.replace("scripts/", "")}
                      </a>
                    )}
                    {phase.subphases && phase.subphases.length > 0 && (
                      <details className="mt-3 text-xs" open={q.length > 0}>
                        <summary className="cursor-pointer text-muted-foreground hover:text-primary">{phase.subphases.length} subphase records</summary>
                        <ul className="mt-2 space-y-1">
                          {phase.subphases.map((s) => (
                            <li key={s.id}>
                              <a href={githubHref(s.doc)} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
                                <span className="text-primary">{s.id}</span> — {s.title}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>

      <div className="mt-10 border border-dashed border-border p-4">
        <h3 className="text-sm font-semibold">Missing or unverified records</h3>
        <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
          {ROADMAP_UNVERIFIED_ENTRIES.map((e) => (
            <li key={e.id}><span className="text-primary">{e.id}</span> — {e.note}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
