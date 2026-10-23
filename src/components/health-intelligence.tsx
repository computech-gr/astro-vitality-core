"use client";

import { useEffect, useState } from "react";
import { ScientificResearchCandidates } from "@/components/scientific-research-candidates";
import { getCloudMissionContext } from "@/infrastructure/mission-records";
import { loadCrewScientificEvidence } from "@/infrastructure/scientific-evidence";
import type { ScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  DatabaseZap,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";

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
  const [report, setReport] = useState<ScientificEvidenceReport | null>(null);
  const [status, setStatus] = useState("Checking authenticated mission context...");
  const [selection, setSelection] = useState("");
  const [missions, setMissions] = useState<Array<{ missionId: string; crewMemberId: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    void getCloudMissionContext()
      .then((context) => {
        if (cancelled) return;
        const own = context.memberships.filter(
          (m): m is typeof m & { crewMemberId: string } =>
            m.role === "crew_self" && Boolean(m.crewMemberId),
        );
        setMissions(own);
        setSelection(own.length ? `${own[0]!.missionId}|${own[0]!.crewMemberId}` : "");
        if (!own.length)
          setStatus("Private evidence requires an active Crew Self mission membership.");
      })
      .catch(() => {
        if (!cancelled) setStatus("Unable to verify mission membership.");
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!selection) return;
    const selected = missions.find((m) => `${m.missionId}|${m.crewMemberId}` === selection);
    if (!selected) return;
    let cancelled = false;
    setReport(null);
    setStatus("Loading read-only mission evidence...");
    void loadCrewScientificEvidence(selected.missionId, selected.crewMemberId)
      .then((result) => {
        if (cancelled) return;
        setReport(result.report);
        setStatus(
          result.reason ??
            (result.report?.observations.length
              ? "Evidence loaded"
              : "No usable numeric mission evidence yet"),
        );
      })
      .catch(() => {
        if (!cancelled) setStatus("Evidence unavailable. No health interpretation was performed.");
      });
    return () => {
      cancelled = true;
    };
  }, [selection, missions]);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="section-kicker">P12 · Health Intelligence v1</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Explain the pattern. <span className="text-primary">Show the uncertainty.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Governed trends and reviewed cross-domain relationships can be evaluated against
              personal context without turning correlations into diagnoses.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <a href="/mission/alerts">
                Open explainable alerts <ArrowRight />
              </a>
            </Button>
          </div>
          <Card className="border-border bg-surface">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <ShieldCheck className="text-signal" />
                Scientific baseline v1.1
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              The reviewed biomarker matrix constrains pattern definitions and guardrails.
              Protocol/action guidance remains a separate P13 responsibility.
            </CardContent>
          </Card>
        </div>

        <section className="mt-10 space-y-4" aria-label="Live scientific evidence">
          <Card>
            <CardHeader>
              <CardTitle>Mission-scoped scientific evidence · Crew Self</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {missions.length > 1 && (
                <label className="block">
                  Active mission{" "}
                  <select
                    className="ml-2 rounded border bg-background p-2"
                    value={selection}
                    onChange={(event) => setSelection(event.target.value)}
                  >
                    {missions.map((m) => (
                      <option
                        key={`${m.missionId}|${m.crewMemberId}`}
                        value={`${m.missionId}|${m.crewMemberId}`}
                      >
                        {m.missionId}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p role="status" className="text-muted-foreground">
                {status}
              </p>
              {report && (
                <>
                  <p>
                    {report.observations.length} numeric observations · {report.metrics.length}{" "}
                    metric/unit series · {report.patterns.length} governed pattern definitions
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {report.metrics.map((metric) => (
                      <div
                        key={`${metric.metricCode}|${metric.unit}`}
                        className="rounded border p-3"
                      >
                        <p className="font-semibold">{metric.metricCode}</p>
                        <p>
                          Latest: {metric.latest.value} {metric.unit} · {metric.latest.quality}{" "}
                          quality
                        </p>
                        <p className="text-muted-foreground">
                          {new Date(metric.latest.observedAt).toLocaleString()} · {metric.count}{" "}
                          samples · {metric.status.replaceAll("_", " ")}
                        </p>
                        {metric.previous && (
                          <p>
                            Previous: {metric.previous.value} {metric.unit} · Δ{" "}
                            {metric.changeFromPrevious?.toPrecision(4)} {metric.unit} (descriptive,
                            not a trend)
                          </p>
                        )}
                        {metric.baseline && (
                          <p>
                            Historical mean: {metric.baseline.mean.toPrecision(4)} {metric.unit}{" "}
                            from {metric.baseline.count} good-quality prior samples (NOT an approved
                            personal baseline)
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <h3 className="font-semibold">
                    Cross-domain evidence coverage — not medical findings
                  </h3>
                  <div className="grid gap-2 md:grid-cols-2">
                    {report.patterns.map((pattern) => (
                      <div key={pattern.id} className="rounded border p-3">
                        <p className="font-semibold">{pattern.name}</p>
                        <p>{pattern.status.replaceAll("_", " ")}</p>
                        <p className="text-muted-foreground">
                          Observed roles: {pattern.observedRoles.join(", ") || "none"}
                        </p>
                        <p className="text-muted-foreground">
                          Missing: {pattern.missingRoles.join(", ") || "none"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Sources: {pattern.sources.join(", ")}
                        </p>
                      </div>
                    ))}
                  </div>
                  <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                    {report.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </section>
        <section className="mt-10 grid gap-4 md:grid-cols-3" aria-label="Health Intelligence state">
          <Card>
            <CardHeader>
              <DatabaseZap className="text-primary" />
              <CardTitle className="text-sm">Evidence</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">NO SESSION EVIDENCE</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Mission-scoped measurements appear above only for an authenticated Crew Self member.
                No fabricated findings or clinical thresholds.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <BrainCircuit className="text-primary" />
              <CardTitle className="text-sm">Reviewed patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">
                {REVIEWED_INTELLIGENCE_PATTERNS_V1_1.length} DEFINITIONS
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Required evidence roles, scientific sources and interpretation guardrails are
                preserved per pattern.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <AlertTriangle className="text-primary" />
              <CardTitle className="text-sm">Action guidance</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">P13 PROTOCOL BOUNDARY AVAILABLE</p>
              <p className="mt-3 text-sm text-muted-foreground">
                Reviewed findings may map to bounded protocol categories; medical escalation remains
                separately governed.
              </p>
              <Button asChild variant="outline" className="mt-4">
                <a href="/mission/guidance">
                  Open guidance <ArrowRight />
                </a>
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="mt-12 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="bg-deep">
            <CardHeader>
              <FlaskConical className="text-signal" />
              <CardTitle>Explainability contract</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Every finding carries what changed, why it matched, contributing observations, missing
              evidence, confounders, confidence breakdown, uncertainty reasons, scientific source
              IDs and non-diagnostic guardrails.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Safety rails</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {safeguards.map((item) => (
                  <div
                    key={item}
                    className="flex gap-3 border border-border/70 bg-background/40 p-3 text-sm"
                  >
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-signal" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <ScientificResearchCandidates />

        <section className="mt-12">
          <h2 className="font-display text-2xl font-semibold">Reviewed v1.1 pattern catalogue</h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {REVIEWED_INTELLIGENCE_PATTERNS_V1_1.map((pattern) => (
              <Card key={pattern.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{pattern.displayName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{pattern.summary}</p>
                  <p>
                    <span className="text-foreground">Evidence:</span>{" "}
                    {pattern.evidenceLevel.replaceAll("_", " ")} ·{" "}
                    <span className="text-foreground">Status:</span>{" "}
                    {pattern.operationalStatus.replaceAll("_", " ")}
                  </p>
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
