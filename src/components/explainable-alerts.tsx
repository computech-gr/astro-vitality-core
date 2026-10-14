"use client";

import { useEffect, useState } from "react";
import { getCloudMissionContext } from "@/infrastructure/mission-records";
import { loadCrewScientificEvidence } from "@/infrastructure/scientific-evidence";
import type { ScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";
import { summarizeP353 } from "@/domain/health-intelligence/p353-review";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  DatabaseZap,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const alertStates = [
  {
    state: "INFORMATION",
    meaning: "Evidence is present, but the reviewed pattern is incomplete or does not justify an operational review state.",
  },
  {
    state: "REVIEW",
    meaning: "A reviewed multi-signal pattern matched with sufficient independent evidence and should be reviewed by the astronaut or authorized human operator.",
  },
  {
    state: "DATA QUALITY",
    meaning: "Poor, missing or conflicting evidence blocks health interpretation. The correct response is to inspect data quality or repeat measurement.",
  },
  {
    state: "RESEARCH ONLY",
    meaning: "The relationship is scientifically interesting but is explicitly prevented from becoming an operational alert.",
  },
] as const;

const safeguards = [
  "No alert is a diagnosis or treatment recommendation.",
  "Research-only findings cannot become operational alerts.",
  "Poor-quality evidence fails closed to a data-quality state.",
  "Confidence, uncertainty, confounders and missing context stay visible.",
  "Medical escalation is separately governed by Action & Protocol Guidance.",
];

export function ExplainableAlertsPage() {
  const [memberships, setMemberships] = useState<Array<{missionId: string; crewMemberId: string}>>([]);
  const [selection, setSelection] = useState("");
  const [report, setReport] = useState<ScientificEvidenceReport | null>(null);
  const [status, setStatus] = useState("Checking authenticated mission membership...");
  useEffect(() => {
    let cancelled = false;
    void getCloudMissionContext().then((context) => {
      if (cancelled) return;
      const own = context.signedIn && !context.error ? context.memberships.filter(
        (m): m is typeof m & {crewMemberId: string} => m.role === "crew_self" && Boolean(m.crewMemberId),
      ) : [];
      setMemberships(own);
      setSelection(own.length ? `${own[0]!.missionId}|${own[0]!.crewMemberId}` : "");
      if (!own.length) setStatus("No verified Crew Self membership. Private evidence is not available.");
    }).catch(() => { if (!cancelled) setStatus("Unable to verify mission membership."); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const chosen = memberships.find((m) => `${m.missionId}|${m.crewMemberId}` === selection);
    if (!chosen) { setReport(null); return; }
    let cancelled = false;
    setReport(null);
    setStatus("Loading read-only evidence...");
    void loadCrewScientificEvidence(chosen.missionId, chosen.crewMemberId).then((result) => {
      if (cancelled) return;
      setReport(result.report);
      setStatus(result.reason ?? (result.report ? "Evidence projection ready" : "No authorized evidence"));
    }).catch(() => { if (!cancelled) setStatus("Evidence unavailable. No interpretation performed."); });
    return () => { cancelled = true; };
  }, [selection, memberships]);
  const summary = report ? summarizeP353(report) : null;
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="section-kicker">P12/P13 boundary · Explainable Alerts</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Surface attention. <span className="text-primary">Preserve the evidence trail.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Explainable Alerts is the operational review surface for governed Health Intelligence findings. It does not create values, infer diagnoses or bypass the protocol boundary.
            </p>
            <Button variant="outline" asChild className="mt-5">
              <a href="/mission/intelligence">Health Intelligence</a>
            </Button>
          </div>
          <Card className="border-border bg-surface">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <ShieldCheck className="text-signal" /> Fail-closed by design
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              A finding can only become an operational review state when reviewed evidence, data quality and context requirements are satisfied. Otherwise the surface remains informational, data-quality blocked or research-only.
            </CardContent>
          </Card>
        </div>

        <section className="mt-10" aria-label="P35.3 crew evidence review">
          <Card><CardHeader><CardTitle>P35.3 · Crew evidence review (non-diagnostic)</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">Read-only, membership-scoped evidence. Descriptive history is not an approved personal baseline. This panel never activates clinical or operational alerts.</p>
              {memberships.length > 1 && <label className="block">Mission <select className="ml-2 rounded border bg-background p-2" value={selection} onChange={(e) => setSelection(e.target.value)}>{memberships.map((m) => <option key={`${m.missionId}|${m.crewMemberId}`} value={`${m.missionId}|${m.crewMemberId}`}>{m.missionId}</option>)}</select></label>}
              <p role="status" className="text-muted-foreground">{status}</p>
              {summary && <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded border p-3"><p className="text-muted-foreground">Recorded observations</p><p className="font-mono text-xl">{summary.observationCount}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Data-quality blocked metrics</p><p className="font-mono text-xl">{summary.qualityBlocked}</p></div>
                  <div className="rounded border p-3"><p className="text-muted-foreground">Operational alerts</p><p className="font-mono text-xl">DISABLED</p></div>
                </div>
                {summary.metrics.length === 0 && <p>No usable numeric observations. No findings generated.</p>}
                {summary.metrics.map((metric) => <div key={`${metric.metricCode}|${metric.unit}`} className="rounded border p-3 space-y-1">
                  <p className="font-mono break-all">{metric.metricCode} · {metric.unit}</p>
                  <p>Latest: {metric.latestValue} · {metric.latestAt} · Quality: {metric.quality}</p>
                  <p>State: {metric.state.replaceAll("_", " ")} · Observations: {metric.count}</p>
                  {metric.descriptiveMean !== null && <p>Historical descriptive mean: {metric.descriptiveMean.toFixed(2)} (not an approved baseline)</p>}
                </div>)}
                <p className="text-muted-foreground">Reviewed pattern coverage: {summary.coverageCount} with required roles observed; {summary.researchOnlyCount} research-only. Coverage does not constitute a matched pattern or alert.</p>
              </>}
            </CardContent></Card>
        </section>

        <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Explainable alert state">
          <Card>
            <CardHeader>
              <DatabaseZap className="text-primary" />
              <CardTitle className="text-sm">Current session</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">NO ACTIVE EVIDENCE</p>
              <p className="mt-3 text-sm text-muted-foreground">
                No alert is fabricated when mission evidence is absent. Findings appear only from real or explicitly synthetic evidence supplied to the governed intelligence engine.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <AlertTriangle className="text-primary" />
              <CardTitle className="text-sm">Alert semantics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">ATTENTION, NOT DIAGNOSIS</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Alerts communicate what changed, why it matched, confidence, uncertainty, missing data and confounders.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CircleHelp className="text-primary" />
              <CardTitle className="text-sm">Next governed step</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">PROTOCOL BOUNDARY</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Any operational response is handled by the separate Action & Protocol Guidance layer.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <a href="/mission/guidance">
                  Open guidance <ArrowRight />
                </a>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold">Attention states</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {alertStates.map((item) => (
              <Card key={item.state}>
                <CardHeader>
                  <CardTitle className="text-base font-mono">{item.state}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">{item.meaning}</CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="bg-deep">
            <CardHeader>
              <CardTitle>Explainability contract</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Every alert-facing finding preserves the same evidence, source IDs, confidence breakdown, missing roles, missing context, confounders, uncertainty and scientific guardrails produced by Health Intelligence.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Safety rails</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {safeguards.map((item) => (
                  <div key={item} className="flex gap-3 border border-border/70 bg-background/40 p-3 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
