import type { SyntheticMissionDataset, SyntheticReplayFrame, SyntheticReplayOptions } from "./contracts";

export function replaySyntheticMission(
  dataset: SyntheticMissionDataset,
  visitor: (frame: SyntheticReplayFrame) => void,
  options: SyntheticReplayOptions = {},
): void {
  const start = Math.max(0, options.fromIndex ?? 0);
  const end = Math.min(dataset.events.length, options.untilIndex ?? dataset.events.length);
  for (let index = start; index < end; index += 1) {
    visitor({ index, total: dataset.events.length, event: dataset.events[index] });
  }
}

export function syntheticDatasetFingerprint(dataset: SyntheticMissionDataset): string {
  const payload = JSON.stringify({
    id: dataset.manifest.id,
    version: dataset.manifest.version,
    seed: dataset.manifest.seed,
    events: dataset.events.map((event) => {
      if (event.kind !== "observation") return event;
      const observation = event.envelope.observation;
      return {
        kind: event.kind,
        id: event.id,
        occurredAt: event.occurredAt,
        metricCode: observation.metric.code,
        value: observation.value,
        quality: observation.quality,
        tags: observation.tags,
      };
    }),
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
