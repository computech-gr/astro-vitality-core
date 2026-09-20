import { readFileSync, existsSync } from "node:fs";

const required = [
  "src/components/recorded-mission-data.tsx",
  "src/routes/mission.records.tsx",
  "src/infrastructure/mission-records.ts",
  "tests/offline/p20-recorded-mission-data.test.ts",
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`Recorded mission data missing: ${file}`);
}

const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const offline = readFileSync("src/components/offline-mission.tsx", "utf8");
const records = readFileSync("src/components/recorded-mission-data.tsx", "utf8");
const infra = readFileSync("src/infrastructure/mission-records.ts", "utf8");
const seo = readFileSync("src/infrastructure/seo.ts", "utf8");

const checks = [
  [shell.includes('"Recorded Mission Data"') && shell.includes('return "/mission/records"'), "global navigation exposes Recorded Mission Data"],
  [shell.includes('"Offline Mission Mode"') && shell.includes('return "/mission/offline"'), "global navigation exposes Offline Mission Mode"],
  [offline.includes("syncRecordedMissionQueue") && offline.includes("/mission/records"), "offline console exposes governed sync and recorded-data navigation"],
  [records.includes("Recorded Mission Data") && records.includes("SUPABASE") && records.includes("LOCAL"), "history UI distinguishes local and Supabase storage"],
  [infra.includes('.from("mission_events")') && infra.includes('.from("mission_memberships")'), "cloud history is mission/RLS scoped"],
  [infra.includes("synchronizeGroundQueueIfAuthenticated"), "existing governed Supabase sync transport is reused"],
  [seo.includes('"/mission/records"'), "recorded data route stays noindex as an operational console"],
  [!records.includes("service_role") && !infra.includes("service_role"), "no privileged browser credential path was introduced"],
];

for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Recorded mission data verification failed: ${label}`);
}
console.log("Recorded mission data verification PASS");
