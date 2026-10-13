import { useMemo, useState } from "react";
import { generateP31MultiCrewMission } from "@/domain/simulation/multi-crew";
import { Button } from "@/components/ui/button";

export function MultiCrewSimulation() {
  const mission = useMemo(() => generateP31MultiCrewMission(), []);
  const [crewId, setCrewId] = useState<string>("all");
  const [limit, setLimit] = useState(20);
  const filtered = mission.timeline.filter((row) => crewId === "all" || row.crewId === crewId);
  const download = () => {
    const blob = new Blob([JSON.stringify(mission, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "p31-mars-transit-day-120.synthetic.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="mt-12 space-y-5 border border-border bg-surface p-5" aria-labelledby="p31-heading">
      <div>
        <p className="section-kicker">P31 · Multi-astronaut mission simulation</p>
        <h2 id="p31-heading" className="mt-2 font-display text-2xl font-semibold">Mars Transit — Mission Day 120</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Four isolated, deterministic synthetic crew streams. Read-only demo; no database writes,
          real astronaut records, diagnoses, clinical thresholds or causal inference.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4" aria-label="Synthetic mission summary">
        <div><strong>{mission.summary.crewCount}</strong><p className="text-xs text-muted-foreground">Synthetic crew</p></div>
        <div><strong>{mission.summary.observationCount}</strong><p className="text-xs text-muted-foreground">Observations</p></div>
        <div><strong>{mission.summary.poorQualityCount}</strong><p className="text-xs text-muted-foreground">Poor-quality samples</p></div>
        <div><strong>{mission.summary.offlineTransitions}</strong><p className="text-xs text-muted-foreground">Offline transitions</p></div>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        {mission.crew.map((member) => (
          <button type="button" key={member.crewId}
            aria-pressed={crewId === member.crewId}
            onClick={() => { setCrewId(member.crewId); setLimit(20); }}
            className={`border p-3 text-left ${crewId === member.crewId ? "border-primary bg-primary/10" : "border-border"}`}>
            <strong>{member.label}</strong>
            <p className="mt-1 text-xs text-muted-foreground">{member.scenarioId.replaceAll("_", " ")}</p>
            <p className="mt-1 font-mono text-xs">seed {member.seed}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => { setCrewId("all"); setLimit(20); }}>All crew</Button>
        <Button variant="outline" onClick={download}>Download synthetic replay JSON</Button>
        <span className="text-xs text-muted-foreground">{filtered.length} events · showing {Math.min(limit, filtered.length)}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead><tr className="border-b border-border">
            <th scope="col" className="p-2">UTC</th><th scope="col" className="p-2">Crew</th>
            <th scope="col" className="p-2">Event</th><th scope="col" className="p-2">Details</th>
          </tr></thead>
          <tbody>{filtered.slice(0, limit).map(({ crewId: id, crewLabel, event }) => (
            <tr key={`${id}:${event.id}`} className="border-b border-border/50">
              <td className="p-2 font-mono text-xs">{event.occurredAt}</td>
              <td className="p-2">{crewLabel}</td>
              <td className="p-2">{event.kind}</td>
              <td className="p-2 text-muted-foreground">{event.kind === "observation"
                ? `${event.envelope.observation.metric.code} · ${event.envelope.observation.quality.level}`
                : event.kind === "connectivity" ? event.state : event.label}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {limit < filtered.length && <Button variant="outline" onClick={() => setLimit((n) => n + 20)}>Show more events</Button>}
      <p className="text-xs text-muted-foreground">Simulation-only event ordering; this view does not sync, ingest, or expose authenticated mission data.</p>
    </section>
  );
}
