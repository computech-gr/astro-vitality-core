import { useMemo, useState } from "react";
import { MultiCrewSimulation } from "@/components/multi-crew-simulation";
import {
  Activity,
  AlertTriangle,
  CloudOff,
  Download,
  FlaskConical,
  Play,
  RadioTower,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  generateSyntheticMissionDataset,
  SYNTHETIC_SCENARIOS,
  syntheticDatasetFingerprint,
  type SyntheticScenarioId,
} from "@/domain";

const scenarioOrder: SyntheticScenarioId[] = [
  "mission_day_127_fatigue_recovery",
  "sensor_artifact_dropout",
  "co2_context_event",
  "radiation_context_event",
];

function downloadDataset(dataset: ReturnType<typeof generateSyntheticMissionDataset>) {
  const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${dataset.manifest.id}.synthetic.v1.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function SyntheticMissionPage() {
  const [scenarioId, setScenarioId] = useState<SyntheticScenarioId>("mission_day_127_fatigue_recovery");
  const [runNumber, setRunNumber] = useState(0);
  const dataset = useMemo(
    () => generateSyntheticMissionDataset(scenarioId),
    [scenarioId, runNumber],
  );
  const fingerprint = syntheticDatasetFingerprint(dataset);
  const observations = dataset.events.filter((event) => event.kind === "observation");
  const firstObservations = observations.slice(0, 8);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto max-w-7xl px-5 py-10 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="section-kicker">P17 · Simulation & Synthetic Mission Dataset</p>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
              Repeat the mission. <span className="text-primary">Know the expected story.</span>
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground">
              Deterministic synthetic scenarios exercise sensor streams, environmental context, artifacts,
              missing data, connectivity loss and recovery without using real medical records.
            </p>
            <Button variant="outline" asChild className="mt-5">
              <a href="/mission/live">Live dashboard</a>
            </Button>
          </div>
          <Card className="border-signal/30 bg-surface">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-base">
                <ShieldCheck className="text-signal" /> Synthetic-only safety boundary
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Scenario values exist to test software behavior. They are not clinical ranges, not astronaut data
              and not evidence that a simulated relationship is causal.
            </CardContent>
          </Card>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Synthetic scenarios">
          {scenarioOrder.map((id) => {
            const scenario = SYNTHETIC_SCENARIOS[id];
            const active = id === scenarioId;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setScenarioId(id)}
                className={`min-h-40 border p-5 text-left transition-colors ${
                  active ? "border-primary bg-primary/10" : "border-border bg-surface hover:bg-accent"
                }`}
              >
                <span className="font-mono text-xs uppercase text-primary">seed {scenario.seed}</span>
                <h2 className="mt-3 font-display text-lg font-semibold">{scenario.displayName}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{scenario.description}</p>
              </button>
            );
          })}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <Card className="bg-deep">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Play className="text-primary" /> Deterministic replay
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Events</p>
                  <p className="mt-2 font-mono text-lg">{dataset.events.length}</p>
                </div>
                <div className="border border-border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Observations</p>
                  <p className="mt-2 font-mono text-lg">{dataset.summary.observations}</p>
                </div>
                <div className="border border-border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Poor quality</p>
                  <p className="mt-2 font-mono text-lg">{dataset.summary.poorQualityObservations}</p>
                </div>
                <div className="border border-border p-3">
                  <p className="text-xs uppercase text-muted-foreground">Fingerprint</p>
                  <p className="mt-2 font-mono text-lg">{fingerprint}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setRunNumber((value) => value + 1)}>
                  <RefreshCw /> Regenerate same seed
                </Button>
                <Button variant="outline" onClick={() => downloadDataset(dataset)}>
                  <Download /> Export JSON
                </Button>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Regenerating the same scenario and seed must preserve the same fingerprint and event sequence.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Activity className="text-primary" /> Scenario coverage
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {dataset.manifest.expectedFeatures.map((feature) => (
                  <div key={feature} className="border border-border/70 bg-background/40 p-3 text-sm">
                    {feature}
                  </div>
                ))}
              </div>
              <div className="mt-5 border-l-2 border-signal pl-4 text-sm leading-6 text-muted-foreground">
                {dataset.manifest.limitations.join(" ")}
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="text-primary" /> Data quality
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Artifact and dropout scenarios make poor, degraded and missing data visible instead of silently
              filling values.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CloudOff className="text-primary" /> Connectivity
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Mission Day 127 includes a deterministic offline/reconnect sequence for P14/P15 store-and-forward
              demonstration.
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RadioTower className="text-primary" /> Shared timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              Physiological, cognitive, laboratory, habitat and radiation observations share canonical timestamps
              and provenance.
            </CardContent>
          </Card>
        </section>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="section-kicker">Preview</p>
              <h2 className="mt-2 font-display text-2xl font-semibold">First canonical observations</h2>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {dataset.summary.metricCodes.length} canonical metrics · baseline v{dataset.manifest.scientificBaselineVersion}
            </p>
          </div>
          <div className="mt-5 overflow-x-auto border border-border">
            <table className="w-full min-w-[50rem] text-left text-sm">
              <thead className="bg-surface text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Metric</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Quality</th>
                  <th className="px-4 py-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {firstObservations.map((event) => {
                  const observation = event.envelope.observation;
                  return (
                    <tr key={event.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">{observation.observedAt}</td>
                      <td className="px-4 py-3 font-mono text-xs">{observation.metric.code}</td>
                      <td className="px-4 py-3">
                        {observation.value.number ?? "—"} {observation.metric.unit ?? ""}
                      </td>
                      <td className="px-4 py-3 uppercase">{observation.quality.level}</td>
                      <td className="px-4 py-3 text-muted-foreground">{observation.source.sourceId}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <MultiCrewSimulation />

        <section className="mt-10 border border-border bg-surface p-5 text-sm leading-6 text-muted-foreground">
          <div className="flex gap-3">
            <FlaskConical className="mt-0.5 size-5 shrink-0 text-signal" />
            <p>
              The simulator is a reproducibility and demonstration instrument. Production sensor adapters remain
              separate, and synthetic records are always classified and tagged as synthetic so they cannot be
              mistaken for real crew medical data.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
