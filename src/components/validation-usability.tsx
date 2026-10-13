import { RealDeviceAcceptance } from "@/components/real-device-acceptance";
import { IndependentScientificReview } from "@/components/independent-scientific-review";
import evidenceLedger from "../../data/validation/p18-evidence.v1.json";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Gauge, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  P18_KNOWN_LIMITATIONS,
  P18_VALIDATION_PLAN,
  summarizeValidation,
  type ValidationEvidence,
} from "@/domain";

const evidence = evidenceLedger.evidence as ValidationEvidence[];

const label: Record<ValidationEvidence["status"], string> = {
  pass: "PASS",
  fail: "FAIL",
  pending_human: "PENDING HUMAN REVIEW",
  known_limitation: "KNOWN LIMITATION",
};

export function ValidationUsabilityPage() {
  const summary = summarizeValidation(evidence);
  const evidenceById = new Map(evidence.map((item) => [item.criterionId, item]));

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-5 pb-16 pt-28 lg:px-8" id="main-content">
      <div className="max-w-3xl">
        <p className="section-kicker">P18 · Validation & Usability</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Evidence before closure.</h1>
        <p className="mt-5 text-base leading-7 text-muted-foreground">
          Scientific review, scenario validation, accessibility, cognitive load, latency and hardware limitations are
          recorded explicitly. A pending critical criterion cannot be presented as a pass.
        </p>
      </div>

      <section aria-label="Validation summary" className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm">Passed</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{summary.passed}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Pending human</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{summary.pendingHuman}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Known limitations</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{summary.knownLimitations}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">P18 closure</CardTitle></CardHeader><CardContent className="flex items-center gap-2 text-sm font-semibold">{summary.readyForP18Closure ? <CheckCircle2 className="text-signal" /> : <AlertTriangle className="text-primary" />}{summary.readyForP18Closure ? "READY" : "NOT YET"}</CardContent></Card>
      </section>

      <section className="mt-10" aria-labelledby="criteria-heading">
        <div className="flex items-center gap-3"><ClipboardCheck className="text-signal" /><h2 id="criteria-heading" className="font-display text-2xl font-semibold">Validation criteria</h2></div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {P18_VALIDATION_PLAN.map((criterion) => {
            const item = evidenceById.get(criterion.id);
            const status = item?.status ?? "pending_human";
            return (
              <Card key={criterion.id}>
                <CardHeader>
                  <CardTitle className="flex items-start justify-between gap-4 text-base"><span>{criterion.id} · {criterion.title}</span><span className="font-mono text-[0.65rem] text-muted-foreground">{label[status]}</span></CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm leading-6 text-muted-foreground">
                  <p>{criterion.acceptance}</p>
                  <p><strong className="text-foreground">Method:</strong> {criterion.method.replace("_", " ")} · {criterion.critical ? "critical" : "noncritical"}</p>
                  {item?.evidence && <p><strong className="text-foreground">Evidence:</strong> {item.evidence}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-10" aria-labelledby="limitations-heading">
        <div className="flex items-center gap-3"><ShieldCheck className="text-signal" /><h2 id="limitations-heading" className="font-display text-2xl font-semibold">Known limitations</h2></div>
        <div className="mt-5 space-y-4">
          {P18_KNOWN_LIMITATIONS.map((item) => (
            <div key={item.id} className="border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">{item.title}</h3><span className="font-mono text-xs uppercase text-muted-foreground">Impact: {item.impact}</span></div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.statement}</p>
              <p className="mt-2 text-sm leading-6"><strong>Mitigation:</strong> {item.mitigation}</p>
            </div>
          ))}
        </div>
      </section>

      <IndependentScientificReview />
      <RealDeviceAcceptance />

      <section className="mt-10 border border-border bg-surface p-5 text-sm leading-6 text-muted-foreground">
        <div className="flex gap-3"><Gauge className="mt-0.5 size-5 shrink-0 text-signal" /><p>Latency evidence is an engineering observation of the local path, not a medical threshold. Target-hardware battery drain remains a documented limitation until a real instrumented wearable session is available. P18 does not claim clinical validation.</p></div>
      </section>
    </main>
  );
}
