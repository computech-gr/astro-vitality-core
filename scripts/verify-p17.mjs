import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnexpectedMigrations } from "./migration-policy.mjs";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/simulation/contracts.ts",
  "src/domain/simulation/prng.ts",
  "src/domain/simulation/scenarios.ts",
  "src/domain/simulation/generator.ts",
  "src/domain/simulation/replay.ts",
  "src/domain/simulation/index.ts",
  "src/components/synthetic-mission.tsx",
  "src/routes/mission.simulation.tsx",
  "tests/simulation/p17-synthetic-mission.test.ts",
  "docs/SIMULATION_SYNTHETIC_DATASET.md",
  "data/synthetic/scenario-manifests.v1.json",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const contracts = readFileSync(join(root, "src/domain/simulation/contracts.ts"), "utf8");
for (const token of [
  "mission_day_127_fatigue_recovery",
  "sensor_artifact_dropout",
  "co2_context_event",
  "radiation_context_event",
  "syntheticOnly: true",
]) {
  if (!contracts.includes(token)) failures.push(`P17 contracts missing ${token}`);
}

const generator = readFileSync(join(root, "src/domain/simulation/generator.ts"), "utf8");
for (const token of [
  "classification: \"synthetic\"",
  "synthetic:true",
  "phys.heart_rate",
  "phys.hrv_rmssd",
  "phys.spo2",
  "cognition.pvt_median_rt",
  "environment.co2",
  "radiation.dose_rate",
  "lab.glucose",
  "motion_artifact",
  "guardrail:non-causal",
  "guardrail:no-risk-score",
  "Synthetic network-loss event",
]) {
  if (!generator.includes(token)) failures.push(`P17 generator missing ${token}`);
}
if (generator.toLowerCase().includes("diagnosis")) failures.push("P17 generator must not encode diagnosis logic");
if (generator.toLowerCase().includes("clinical threshold")) failures.push("P17 generator must not encode clinical thresholds");

const scenarios = readFileSync(join(root, "src/domain/simulation/scenarios.ts"), "utf8");
if (!scenarios.toLowerCase().includes("no co2-to-cognition causality")) failures.push("P17 CO2 scenario must carry non-causal guardrail");
if (!scenarios.includes("No biological radiation-risk score")) failures.push("P17 radiation scenario must prohibit risk scoring");

const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes('label === "Mission Scenario"')) failures.push("Mission Scenario menu item must activate P17 route");
if (!shell.includes('return "/mission/simulation"')) failures.push("P17 navigation route missing");

const component = readFileSync(join(root, "src/components/synthetic-mission.tsx"), "utf8");
for (const token of ["Synthetic-only safety boundary", "Deterministic replay", "Export JSON", "fingerprint"]) {
  if (!component.toLowerCase().includes(token.toLowerCase())) failures.push(`P17 UI missing ${token}`);
}

const tests = readFileSync(join(root, "tests/simulation/p17-synthetic-mission.test.ts"), "utf8");
for (const token of ["deterministically", "missing-data interval", "explicitly non-causal", "no biological risk score", "partial replay"]) {
  if (!tests.toLowerCase().includes(token.toLowerCase())) failures.push(`P17 tests missing gate: ${token}`);
}

const docs = readFileSync(join(root, "docs/SIMULATION_SYNTHETIC_DATASET.md"), "utf8");
for (const token of ["Mission Day 127", "clinical reference ranges", "no imputation", "synthetic"])
  if (!docs.toLowerCase().includes(token.toLowerCase())) failures.push(`P17 docs missing ${token}`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p17"] !== "node scripts/verify-p17.mjs") failures.push("package.json must expose verify:p17");
if (!String(pkg.scripts?.check ?? "").includes("verify:p17")) failures.push("Full check must include verify:p17");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p17")) failures.push("CI must run P17 verifier");

const unexpectedMigrations = findUnexpectedMigrations(root);
if (unexpectedMigrations.length) failures.push(`Unexpected Supabase migrations: ${unexpectedMigrations.join(", ")}`);

if (failures.length) {
  console.error("P17 Simulation & Synthetic Mission Dataset verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P17 Simulation & Synthetic Mission Dataset verification PASS");
