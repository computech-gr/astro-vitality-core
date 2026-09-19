import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/cognitive-behavioral/contracts.ts",
  "src/domain/cognitive-behavioral/scoring.ts",
  "src/domain/cognitive-behavioral/ingestion.ts",
  "src/domain/cognitive-behavioral/index.ts",
  "src/app/readiness-assessment/contracts.ts",
  "src/app/readiness-assessment/store.ts",
  "src/components/readiness-assessment.tsx",
  "src/routes/mission.readiness.tsx",
  "tests/domain/p11-cognitive-behavioral.test.ts",
  "docs/COGNITIVE_BEHAVIORAL_MODULE.md",
];
for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Missing required P11 file: ${file}`);
}

const catalog = readFileSync(join(root, "src/domain/catalog/reviewed-mvp-v1.1.ts"), "utf8");
for (const token of [
  '"behavior.stress_state"',
  '"behavior.mood_affect_state"',
  '"cognition.working_memory_accuracy"',
  '"behavior.workload_tlx_mental_demand"',
  '"behavior.workload_tlx_frustration"',
]) {
  if (!catalog.includes(token)) failures.push(`P11 scientific catalogue extension missing ${token}`);
}

const scoring = readFileSync(join(root, "src/domain/cognitive-behavioral/scoring.ts"), "utf8");
if (!scoring.includes("typeof input.lapseThresholdMs")) failures.push("P11 must not invent a PVT lapse threshold");
if (!scoring.includes("deviceInputLatencyMs")) failures.push("P11 scoring must preserve input-latency awareness");

const component = readFileSync(join(root, "src/components/readiness-assessment.tsx"), "utf8");
for (const token of ["&lt; 3 MINUTES", "demo-only", "No readiness score", "KSS"]) {
  if (!component.includes(token)) failures.push(`P11 UI missing safeguard token: ${token}`);
}

const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes('Cognitive & Behavioral Health") return "/mission/readiness"')) {
  failures.push("Science → Cognitive & Behavioral Health must activate /mission/readiness");
}

const tests = readFileSync(join(root, "tests/domain/p11-cognitive-behavioral.test.ts"), "utf8");
for (const token of [
  "does not invent a lapse threshold",
  "task-linked",
  "under three minutes",
  "medical_sensitive",
]) {
  if (!tests.includes(token)) failures.push(`P11 tests missing gate: ${token}`);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (packageJson.scripts?.["verify:p11"] !== "node scripts/verify-p11.mjs") failures.push("package.json must expose verify:p11");
if (!String(packageJson.scripts?.check ?? "").includes("verify:p11")) failures.push("Full check must include verify:p11");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p11")) failures.push("CI must run the P11 verifier");

const migrationsDir = join(root, "supabase", "migrations");
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  if (sql.length) failures.push(`P11 must not add database migrations: ${sql.join(", ")}`);
}

if (failures.length) {
  console.error("P11 cognitive/behavioral verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P11 cognitive/behavioral verification PASS");
