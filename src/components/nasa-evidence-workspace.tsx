"use client";

import { useMemo, useState } from "react";
import { NasaResearchImport } from "@/components/nasa-research-import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NASA_EVIDENCE_INDEX, evidenceReadiness, evidenceSummary, validateEvidenceIndex } from "@/domain/nasa-evidence/registry";

export function NasaEvidenceWorkspace() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const summary = evidenceSummary();
  const errors = validateEvidenceIndex();
  const categories = [...new Set(NASA_EVIDENCE_INDEX.sources.map(source => source.category))];
  const visible = useMemo(() => NASA_EVIDENCE_INDEX.sources.filter(source =>
    (category === "all" || source.category === category) &&
    `${source.title} ${source.issuer} ${source.id}`.toLowerCase().includes(query.toLowerCase().trim())
  ), [category, query]);
  return <main className="mx-auto max-w-6xl space-y-7 px-5 py-12 text-foreground">
    <div><p className="section-kicker">P30 · NASA scientific references</p><h1 className="mt-3 font-display text-4xl font-semibold">Scientific Evidence & Provenance</h1>
    <p className="mt-4 max-w-3xl text-muted-foreground">Traceable public NASA references from the repository. The reference registry below is static. P35.1 adds on-demand NASA OSDR research metadata import; it is not astronaut health telemetry, clinical validation or permission to activate health rules.</p></div>
    <div className="grid gap-3 md:grid-cols-3"><Card><CardHeader><CardTitle>Indexed references</CardTitle></CardHeader><CardContent>{summary.total}</CardContent></Card><Card><CardHeader><CardTitle>Preliminary screening</CardTitle></CardHeader><CardContent>{summary.screened}</CardContent></Card><Card><CardHeader><CardTitle>Independent review complete</CardTitle></CardHeader><CardContent>{summary.reviewed}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>Evidence governance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Operational activation: DISABLED · Live astronaut telemetry: NOT CONNECTED · Public NASA research metadata: ON-DEMAND (P35.1) · Medical interpretation: NOT AUTHORIZED.</p><p>Metadata and preliminary source screening do not establish measurement validity, causal relationships, or flight readiness.</p>{errors.length > 0 && <p role="alert">Source registry integrity issues: {errors.join("; ")}</p>}</CardContent></Card>
    <NasaResearchImport />
    <section aria-label="Scientific source registry" className="space-y-4"><div className="flex flex-wrap gap-3"><input aria-label="Search scientific sources" className="min-w-60 rounded border bg-background p-2" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search source, title or issuer" /><select aria-label="Evidence category" className="rounded border bg-background p-2" value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div>
    <p className="text-sm text-muted-foreground">{visible.length} references shown</p><div className="grid gap-4 md:grid-cols-2">{visible.map(source => <Card key={source.id}><CardHeader><CardTitle className="text-lg">{source.title}</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p className="text-muted-foreground">{source.issuer} · {source.id}</p><p>Readiness: <strong>{evidenceReadiness(source).replaceAll("_", " ")}</strong></p><p>Access: {source.accessScope}</p><p>Repository provenance: <code className="break-all text-xs">{source.sourceFile}</code></p><p>Screened: {source.verifiedAt ?? "not recorded"} · Full-text appraisal: {source.reviewedFullText ? "recorded" : "not complete"}</p><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open original NASA reference ↗</a></CardContent></Card>)}</div></section>
  </main>;
}
