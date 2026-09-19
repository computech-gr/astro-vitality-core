import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnexpectedMigrations } from "./migration-policy.mjs";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/health-intelligence/contracts.ts",
  "src/domain/health-intelligence/trends.ts",
  "src/domain/health-intelligence/patterns.ts",
  "src/domain/health-intelligence/confidence.ts",
  "src/domain/health-intelligence/engine.ts",
  "src/domain/health-intelligence/index.ts",
  "src/components/health-intelligence.tsx",
  "src/routes/mission.intelligence.tsx",
  "tests/domain/p12-health-intelligence.test.ts",
  "docs/HEALTH_INTELLIGENCE_V1.md",
];
for (const file of required)
  if (!existsSync(join(root, file))) failures.push(`Missing required P12 file: ${file}`);

const patterns = readFileSync(join(root, "src/domain/health-intelligence/patterns.ts"), "utf8");
for (const token of [
  "sleep-fatigue-cognition-v1",
  "workload-recovery-autonomic-v1",
  "hydration-volume-orthostatic-v1",
  "co2-cognition-context-v1",
  "bone-unloading-renal-stone-v1",
  "microbiome-immune-research-v1",
  "Do not state that CO2 caused",
  "No generic dysbiosis score",
])
  if (!patterns.includes(token)) failures.push(`P12 reviewed pattern/guardrail missing: ${token}`);

const trends = readFileSync(join(root, "src/domain/health-intelligence/trends.ts"), "utf8");
if (!trends.includes("P12 ships no universal medical or physiological thresholds"))
  failures.push("P12 trend engine must require externally governed thresholds");

const engine = readFileSync(join(root, "src/domain/health-intelligence/engine.ts"), "utf8");
for (const token of [
  "missingData",
  "confounders",
  "uncertainty",
  "interpretationGuardrails",
  "data_quality",
  "research_only",
]) {
  if (!engine.includes(token)) failures.push(`P12 explainability engine missing ${token}`);
}
if (/diagnos(?:e|is)|treat(?:ment)?/i.test(engine))
  failures.push("P12 engine must not encode diagnosis or treatment logic");

const component = readFileSync(join(root, "src/components/health-intelligence.tsx"), "utf8");
for (const token of [
  "NO SESSION EVIDENCE",
  "Every finding preserves evidence",
  "Scientific baseline v1.1",
]) {
  if (!component.includes(token)) failures.push(`P12 UI safeguard missing: ${token}`);
}

const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes('label === "Health Intelligence" || label === "Explainable Alerts"'))
  failures.push("Platform Health Intelligence / Explainable Alerts must activate P12 route");
if (!shell.includes('return "/mission/intelligence"'))
  failures.push("P12 navigation route missing");

const tests = readFileSync(join(root, "tests/domain/p12-health-intelligence.test.ts"), "utf8");
for (const token of [
  "does not ship a universal threshold",
  "explicitly reduce confidence",
  "DATA QUALITY",
  "non-causal",
  "research-only relationships",
]) {
  if (!tests.includes(token)) failures.push(`P12 tests missing gate: ${token}`);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (packageJson.scripts?.["verify:p12"] !== "node scripts/verify-p12.mjs")
  failures.push("package.json must expose verify:p12");
if (!String(packageJson.scripts?.check ?? "").includes("verify:p12"))
  failures.push("Full check must include verify:p12");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p12")) failures.push("CI must run P12 verifier");

const unexpectedMigrations = findUnexpectedMigrations(root);
if (unexpectedMigrations.length) {
  failures.push(`Unexpected Supabase migrations: ${unexpectedMigrations.join(", ")}`);
}

if (failures.length) {
  console.error("P12 Health Intelligence verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P12 Health Intelligence verification PASS");
