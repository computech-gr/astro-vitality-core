import { ArrowLeft, CheckCircle2, ClipboardCheck, ExternalLink, ShieldAlert, Stethoscope } from "lucide-react";

import logoAsset from "@/assets/mitochondria-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PROTOCOL_LIBRARY_V1_1 } from "@/domain";

const safetyRules = [
  "Action cards are linked to reviewed protocol categories, never free-form medical advice.",
  "Research-only findings cannot generate operational actions.",
  "Data-quality findings route to repeat/quality checks before health interpretation.",
  "Medical escalation requires a separately governed trigger with authority and version.",
  "Acknowledgements preserve protocol version, finding identity, actor and timestamp.",
  "No action card is a diagnosis, treatment prescription or autonomous flight-rule change.",
];

export function ActionGuidancePage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border bg-deep/80 backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-4 px-5 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Back to The Mitochondria home">
            <img src={logoAsset.url} alt="" className="h-10 w-auto" />
            <span className="text-sm font-semibold uppercase tracking-wider">The Mitochondria</span>
          </a>
          <Button variant="outline" asChild>
            <a href="/mission/intelligence"><ArrowLeft />Health Intelligence</a>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="section-kicker">P13 · Action & Protocol Guidance</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Explain the next step. <span className="text-primary">Keep humans in control.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Reviewed findings can map to bounded protocol categories for repeat measurement, recovery/workload review,
              hydration/nutrition review, exercise countermeasure review and environmental review. Medical escalation remains
              separately governed.
            </p>
          </div>
          <Card className="border-border bg-surface">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base"><ShieldAlert className="text-signal" />No active session guidance</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              This page does not fabricate a health finding. Action cards are created only when a real or explicitly synthetic P12 finding is supplied to the governed P13 engine.
            </CardContent>
          </Card>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Protocol guidance contract">
          <Card>
            <CardHeader><ClipboardCheck className="text-primary" /><CardTitle className="text-sm">Protocol library</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-sm">{PROTOCOL_LIBRARY_V1_1.length} VERSIONED PROTOCOLS</p><p className="mt-3 text-sm text-muted-foreground">Each protocol preserves authority, version, source IDs, safety wording and acknowledgement semantics.</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CheckCircle2 className="text-primary" /><CardTitle className="text-sm">Acknowledgement</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-sm">REQUIRED FOR ACTION CARDS</p><p className="mt-3 text-sm text-muted-foreground">Acknowledgement records preserve actor, time, finding, protocol version and state. Persistence is deferred to P14/P15.</p></CardContent>
          </Card>
          <Card>
            <CardHeader><Stethoscope className="text-primary" /><CardTitle className="text-sm">Medical escalation</CardTitle></CardHeader>
            <CardContent><p className="font-mono text-sm">GOVERNED TRIGGER ONLY</p><p className="mt-3 text-sm text-muted-foreground">P13 never infers escalation from a pattern alone. A separate authority/versioned trigger is mandatory.</p></CardContent>
          </Card>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold">Reviewed protocol categories</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {PROTOCOL_LIBRARY_V1_1.map((protocol) => (
              <Card key={protocol.id}>
                <CardHeader><CardTitle className="text-lg">{protocol.title}</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{protocol.purpose}</p>
                  <p><span className="text-foreground">Class:</span> {protocol.actionClass} · <span className="text-foreground">Status:</span> {protocol.status.replaceAll("_", " ")}</p>
                  <ol className="space-y-2">
                    {protocol.steps.map((step) => <li key={step.id} className="border-l border-primary/40 pl-3"><span className="text-foreground">{step.label}:</span> {step.instruction}</li>)}
                  </ol>
                  <p className="font-mono text-xs">{protocol.sourceIds.join(" · ")}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="bg-deep">
            <CardHeader><CardTitle>Safety wording</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              {safetyRules.map((rule) => <div key={rule} className="flex gap-3"><CheckCircle2 className="mt-1 size-4 shrink-0 text-signal" /><span>{rule}</span></div>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Scientific governance</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>The v1.1 biologist review permits bounded categories such as repeat measurement/quality check, recovery/workload review, hydration/nutrition review, exercise-countermeasure review, environmental correction/review and medical escalation.</p>
              <p>Clinical thresholds, treatment instructions and flight-rule changes remain outside this software-defined library unless a qualified medical/mission authority supplies a separately governed rule.</p>
              <a href="https://www.spaceappschallenge.org/2026/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">NASA Space Apps 2026 <ExternalLink className="size-3.5" /></a>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
