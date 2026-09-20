import { existsSync, readFileSync } from "node:fs";

const required = [
  "src/app/live-dashboard/contracts.ts",
  "src/app/live-dashboard/store.ts",
  "src/app/live-dashboard/index.ts",
  "src/components/live-dashboard.tsx",
  "src/routes/mission.live.tsx",
  "tests/app/p9-live-dashboard.test.ts",
  "docs/LIVE_DASHBOARD.md",
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`P9 missing required file: ${file}`);
}
const component = readFileSync("src/components/live-dashboard.tsx", "utf8");
for (const token of [
  "Scan Bluetooth sensor",
  "ENCRYPTED LOCAL + GOVERNED SYNC QUEUE",
  "technical recency indicators",
  "Simple self-check",
]) {
  if (!component.includes(token))
    throw new Error(`P9 live dashboard missing required UI boundary: ${token}`);
}
const store = readFileSync("src/app/live-dashboard/store.ts", "utf8");
if (!store.includes("DASHBOARD_FRESHNESS_MS"))
  throw new Error("P9 missing technical freshness state model");
if (store.includes("clinicalThreshold") || store.includes("diagnos"))
  throw new Error("P9 store must not introduce clinical interpretation");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (!packageJson.scripts?.["verify:p9"])
  throw new Error("P9 verifier is not wired into package scripts");
console.log("P9 live dashboard verification PASS");
