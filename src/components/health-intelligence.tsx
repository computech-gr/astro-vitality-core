import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  DatabaseZap,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";

import logoAsset from "@/assets/mitochondria-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { REVIEWED_INTELLIGENCE_PATTERNS_V1_1 } from "@/domain";

const safeguards = [
  "Personal baseline and matched context precede interpretation",
  "Poor quality and missing context reduce or block confidence",
  "Independent domains matter more than a simple abnormal-signal count",
  "Research-only relationships cannot become operational alerts",
  "No diagnosis, treatment, flight-rule change or autonomous escalation",
  "Every finding preserves evidence, sources, confounders and uncertainty",
];

export function HealthIntelligencePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-deep/80 backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Back to The Mitochondria home">
            <img src={logoAsset.url} alt="" className="h-10 w-auto" />
            <span className="text-sm font-semibold uppercase tracking-wider">The Mitochondria</span>
          </a>
          <Button variant="outline" asChild><a href="/mission/live"><ArrowLeft />Live dashboard</a></Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="section-kicker">P12 · Health Intelligence v1</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Explain the pattern. <span className="text-primary">Show the uncertainty.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Governed trends and reviewed cross-domain relationships can be evaluated against personal context without turning correlations into diagnoses.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <a href="/mission/alerts">
                Open explainable alerts <ArrowRight />
              </a>
            </Button>
          </div>
          <Card className="border-border bg-surface">
            <CardHeader><CardTitle className="flex items-center gap-3 text-base"><ShieldCheck className="text-signal" />Scientific baseline v1.1</CardTitle></CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">The reviewed biomarker matrix constrains pattern definitions and guardrails. Protocol/action guidance remains a separate P13 responsibility.</CardContent>
          </Card>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Health Intelligence state">
          <Card><CardHeader><DatabaseZap className="text-primary" /><CardTitle className="text-sm">Evidence</CardTitle></CardHeader><CardContent><p className="font-mono text-sm">NO SESSION EVIDENCE</p><p className="mt-3 text-sm text-muted-foreground">This page generates no synthetic health values. Findings appear only when real or explicitly synthetic mission evidence is supplied to the engine.</p></CardContent></Card>
          <Card><CardHeader><BrainCircuit className="text-primary" /><CardTitle className="text-sm">Reviewed patterns</CardTitle></CardHeader><CardContent><p className="font-mono text-sm">{REVIEWED_INTELLIGENCE_PATTERNS_V1_1.length} DEFINITIONS</p><p className="mt-3 text-sm text-muted-foreground">Required evidence roles, scientific sources and interpretation guardrails are preserved per pattern.</p></CardContent></Card>
          <Card><CardHeader><AlertTriangle className="text-primary" /><CardTitle className="text-sm">Action guidance</CardTitle></CardHeader><CardContent><p className="font-mono text-sm">P13 PROTOCOL BOUNDARY AVAILABLE</p><p className="mt-3 text-sm text-muted-foreground">Reviewed findings may map to bounded protocol categories; medical escalation remains separately governed.</p><Button asChild variant="outline" className="mt-4"><a href="/mission/guidance">Open guidance <ArrowRight /></a></Button></CardContent></Card>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="bg-deep"><CardHeader><FlaskConical className="text-signal" /><CardTitle>Explainability contract</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Every finding carries what changed, why it matched, contributing observations, missing evidence, confounders, confidence breakdown, uncertainty reasons, scientific source IDs and non-diagnostic guardrails.</CardContent></Card>
          <Card><CardHeader><CardTitle>Safety rails</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2">{safeguards.map((item) => <div key={item} className="flex gap-3 border border-border/70 bg-background/40 p-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" /><span>{item}</span></div>)}</div></CardContent></Card>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold">Reviewed v1.1 pattern catalogue</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {REVIEWED_INTELLIGENCE_PATTERNS_V1_1.map((pattern) => (
              <Card key={pattern.id}>
                <CardHeader><CardTitle className="text-lg">{pattern.displayName}</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{pattern.summary}</p>
                  <p><span className="text-foreground">Evidence:</span> {pattern.evidenceLevel.replaceAll("_", " ")} · <span className="text-foreground">Status:</span> {pattern.operationalStatus.replaceAll("_", " ")}</p>
                  <p className="font-mono text-xs">{pattern.sourceIds.join(" · ")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
