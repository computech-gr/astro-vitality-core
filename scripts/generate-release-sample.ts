import { mkdirSync, writeFileSync } from "node:fs";

import { generateSyntheticMissionDataset, syntheticDatasetFingerprint } from "../src/domain";

const dataset = generateSyntheticMissionDataset("mission_day_127_fatigue_recovery");
const output = {
  releaseSampleVersion: "1.0",
  syntheticOnly: true,
  scenario: dataset.manifest.id,
  fingerprint: syntheticDatasetFingerprint(dataset),
  dataset,
};

mkdirSync("data/release", { recursive: true });
writeFileSync("data/release/mission-day-127.synthetic.json", `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote data/release/mission-day-127.synthetic.json (${output.fingerprint})`);
