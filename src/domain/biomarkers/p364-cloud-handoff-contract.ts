/** P36.4: explicit synthetic-only server handoff contract. No network or persistence. */
export type SyntheticCloudHandoff = Readonly<{
  schema: "mitochondria.p36.4.synthetic-cloud-handoff.v1";
  syntheticOnly: true;
  missionId: string;
  crewMemberId: string;
  observedOn: string;
  sourceFilename: string;
  sourceSha256: string;
  observations: readonly Readonly<{
    metricId: string;
    value: string;
    unit: string;
    sourceExcerpt: string;
  }>[];
}>;

export function validateSyntheticCloudHandoff(input: SyntheticCloudHandoff): boolean {
  if (input.schema !== "mitochondria.p36.4.synthetic-cloud-handoff.v1" || input.syntheticOnly !== true) return false;
  if (!input.missionId || !input.crewMemberId || !/^\d{4}-\d{2}-\d{2}$/.test(input.observedOn)) return false;
  if (!input.sourceFilename || input.sourceFilename.length > 255 || !/^[a-f0-9]{64}$/.test(input.sourceSha256)) return false;
  if (!input.observations.length || input.observations.length > 100) return false;
  const ids = new Set<string>();
  for (const observation of input.observations) {
    if (!observation.metricId || ids.has(observation.metricId) || !observation.unit || !observation.sourceExcerpt || observation.sourceExcerpt.length > 500) return false;
    if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(observation.value)) return false;
    ids.add(observation.metricId);
  }
  return true;
}
