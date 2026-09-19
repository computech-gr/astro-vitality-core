import { existsSync, readFileSync } from "node:fs";

const required = [
  "src/domain/baseline/contracts.ts",
  "src/domain/baseline/engine.ts",
  "src/domain/baseline/index.ts",
  "tests/domain/p10-personal-baseline.test.ts",
  "docs/PERSONAL_BASELINE_ENGINE.md",
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`P10 missing required file: ${file}`);
}
const engine = readFileSync("src/domain/baseline/engine.ts", "utf8");
for (const token of [
  "buildPersonalBaseline",
  "compareObservationToBaseline",
  "selectBaselineComparator",
  "launch_transition",
  "rollingWindowHours",
]) {
  if (!engine.includes(token))
    throw new Error(`P10 baseline engine missing required behavior: ${token}`);
}
if (
  engine.includes("clinicalThreshold") ||
  engine.includes("diagnosis") ||
  engine.includes("ACTION")
) {
  throw new Error(
    "P10 baseline engine must not introduce clinical thresholds, diagnoses or action classification",
  );
}
const dashboard = readFileSync("src/components/live-dashboard.tsx", "utf8");
if (!dashboard.includes("Personal baseline Δ") || !dashboard.includes("NO ALERTS / DIAGNOSIS")) {
  throw new Error(
    "P10 dashboard must expose baseline state while preserving the no-alert/no-diagnosis boundary",
  );
}
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (!packageJson.scripts?.["verify:p10"])
  throw new Error("P10 verifier is not wired into package scripts");
console.log("P10 personal baseline verification PASS");
