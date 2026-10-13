import { generateSyntheticMissionDataset } from "./generator";
import type { SyntheticMissionDataset, SyntheticMissionEvent, SyntheticScenarioId } from "./contracts";

export const P31_MISSION_ID = "synthetic-mars-transit-day-120";
export const P31_CREW = [
  { id: "synthetic-crew-01", label: "Crew 01", scenario: "mission_day_127_fatigue_recovery", seed: 120101 },
  { id: "synthetic-crew-02", label: "Crew 02", scenario: "sensor_artifact_dropout", seed: 120202 },
  { id: "synthetic-crew-03", label: "Crew 03", scenario: "co2_context_event", seed: 120303 },
  { id: "synthetic-crew-04", label: "Crew 04", scenario: "radiation_context_event", seed: 120404 },
] as const satisfies ReadonlyArray<{ id: string; label: string; scenario: SyntheticScenarioId; seed: number }>;

export interface P31CrewStream {
  crewId: string;
  label: string;
  scenarioId: SyntheticScenarioId;
  seed: number;
  dataset: SyntheticMissionDataset;
}

export interface P31MissionReplay {
  missionId: typeof P31_MISSION_ID;
  syntheticOnly: true;
  scenarioLabel: "Mars Transit — Mission Day 120";
  crew: P31CrewStream[];
  timeline: Array<{ crewId: string; crewLabel: string; event: SyntheticMissionEvent }>;
  summary: { crewCount: number; observationCount: number; poorQualityCount: number; offlineTransitions: number };
}

/** Read-only deterministic simulation; never writes to local queues, Supabase, or real mission records. */
export function generateP31MultiCrewMission(): P31MissionReplay {
  const crew: P31CrewStream[] = P31_CREW.map((member) => {
    const base = generateSyntheticMissionDataset(member.scenario, member.seed);
    const events: SyntheticMissionEvent[] = base.events.map((event) => {
      const id = `p31:${member.id}:${event.id}`;
      if (event.kind !== "observation") return { ...event, id };
      const observation = event.envelope.observation;
      return {
        ...event,
        id,
        envelope: {
          ...event.envelope,
          observation: {
            ...observation,
            id,
            mission: { missionId: P31_MISSION_ID, crewMemberId: member.id },
            source: { ...observation.source, sourceId: `p31:${member.id}:${observation.source.sourceId}` },
            provenance: { ...observation.provenance, ingestionId: `p31:${member.id}:${observation.provenance.ingestionId}` },
            tags: [...observation.tags, "p31:multi-crew", `p31:crew:${member.id}`],
          },
          context: {
            ...event.envelope.context,
            tags: [...event.envelope.context.tags, "p31:multi-crew", `p31:crew:${member.id}`],
          },
        },
      };
    });
    return {
      crewId: member.id,
      label: member.label,
      scenarioId: member.scenario,
      seed: member.seed,
      dataset: { ...base, events },
    };
  });
  const timeline = crew.flatMap((member) =>
    member.dataset.events.map((event) => ({ crewId: member.crewId, crewLabel: member.label, event })),
  ).sort((a, b) => a.event.occurredAt.localeCompare(b.event.occurredAt) ||
    a.crewId.localeCompare(b.crewId) || a.event.id.localeCompare(b.event.id));
  return {
    missionId: P31_MISSION_ID,
    syntheticOnly: true,
    scenarioLabel: "Mars Transit — Mission Day 120",
    crew,
    timeline,
    summary: {
      crewCount: crew.length,
      observationCount: timeline.filter((item) => item.event.kind === "observation").length,
      poorQualityCount: timeline.filter((item) => item.event.kind === "observation" &&
        item.event.envelope.observation.quality.level === "poor").length,
      offlineTransitions: timeline.filter((item) => item.event.kind === "connectivity" &&
        item.event.state === "offline").length,
    },
  };
}
