import { P35SubmissionReadiness } from "@/components/p35-submission-readiness";
import { P35FinalAcceptance } from "@/components/p35-final-acceptance";
import { P354IntegrationReadiness } from "@/components/p354-integration-readiness";
import evidenceLedger from "../../data/submission/p20-evidence.v1.json";
import { CheckCircle2, ExternalLink, Film, MonitorPlay, Rocket, ShieldCheck, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CHALLENGE_2026_URL,
  P20_DEMO_STEPS,
  SPACE_APPS_2026_URL,
  summarizeSubmissionEvidence,
  type SubmissionEvidence,
} from "@/domain/challenge-submission";

const evidence = evidenceLedger.evidence as SubmissionEvidence[];

const statusLabel: Record<SubmissionEvidence["status"], string> = {
  ready: "READY",
  pending_human: "PENDING TEAM EVIDENCE",
  pending_external: "PENDING EXTERNAL RUNTIME",
  blocked: "BLOCKED",
};

export function ChallengeSubmissionPage() {
  const summary = summarizeSubmissionEvidence(evidence);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 pb-16 pt-28 lg:px-8" id="main-content">
      <div className="grid gap-7 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="section-kicker">P20 · Challenge Demo & Submission</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Judge-ready story. <span className="text-primary">Evidence stays honest.</span>
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
            This page is the controlled demo runbook for The Mitochondria. It links the live device path,
            deterministic Mission Day 127 fallback, explainable intelligence, bounded action guidance, offline
            operation and governed ground synchronization without claiming evidence the team has not yet recorded.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild><a href="/mission/live"><MonitorPlay /> Start demo</a></Button>
            <Button variant="outline" asChild><a href={CHALLENGE_2026_URL} target="_blank" rel="noopener noreferrer">Official challenge <ExternalLink /></a></Button>
          </div>
        </div>
        <Card className="border-signal/30 bg-surface">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="text-signal" /> Final submission gate</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              {summary.finalSubmissionReady ? <CheckCircle2 className="text-signal" /> : <TriangleAlert className="text-primary" />}
              {summary.finalSubmissionReady ? "READY FOR FINAL SUBMISSION" : "NOT YET FINAL-SUBMISSION READY"}
            </p>
            <p>{summary.ready} ready · {summary.pendingHuman} team evidence pending · {summary.pendingExternal} external runtime pending · {summary.blocked} blocked.</p>
            <p>No pending item may be converted to PASS by assumption.</p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-10" aria-labelledby="demo-heading">
        <div className="flex items-center gap-3"><Film className="text-signal" /><h2 id="demo-heading" className="font-display text-2xl font-semibold">Three-minute narrative</h2></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {P20_DEMO_STEPS.map((step) => (
            <a key={step.minute} href={step.route} className="border border-border bg-surface p-5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="flex items-center justify-between gap-4"><span className="font-mono text-xs text-primary">{step.minute}</span><Rocket className="size-4 text-muted-foreground" /></div>
              <h3 className="mt-2 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.message}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="evidence-heading">
        <h2 id="evidence-heading" className="font-display text-2xl font-semibold">Submission evidence</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {evidence.map((item) => (
            <Card key={item.id}>
              <CardHeader><CardTitle className="flex min-w-0 flex-wrap items-start justify-between gap-2 text-base"><span className="min-w-0 break-words">{item.id} · {item.title}</span><span className="font-mono text-[0.65rem] text-muted-foreground">{statusLabel[item.status]}</span></CardTitle></CardHeader>
              <CardContent className="min-w-0 break-words text-sm leading-6 text-muted-foreground">{item.evidence}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <P35SubmissionReadiness />
      <P354IntegrationReadiness />
      <P35FinalAcceptance />

      <section className="mt-10 border border-border bg-surface p-5 text-sm leading-6 text-muted-foreground">
        <p>The Mitochondria is an independent open-source NASA Space Apps Challenge project. It is not NASA-endorsed, is not clinically validated and does not provide autonomous diagnosis or treatment.</p>
        <p className="mt-3">Official event hub: <a className="text-primary underline" href={SPACE_APPS_2026_URL} target="_blank" rel="noopener noreferrer">NASA Space Apps 2026</a>.</p>
      </section>
    </main>
  );
}
