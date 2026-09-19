import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/integrations/environmental-telemetry/contracts.ts",
  "src/integrations/environmental-telemetry/common.ts",
  "src/integrations/environmental-telemetry/environmental-adapter.ts",
  "src/integrations/environmental-telemetry/radiation-adapter.ts",
  "src/integrations/environmental-telemetry/index.ts",
  "tests/integrations/p8-environmental-radiation.test.ts",
  "docs/ENVIRONMENTAL_RADIATION_TELEMETRY.md",
];

for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Missing required P8 file: ${file}`);
}

const contracts = readFileSync(
  join(root, "src/integrations/environmental-telemetry/contracts.ts"),
  "utf8",
);
for (const token of [
  "environment.co2",
  "environment.oxygen_fraction",
  "environment.cabin_pressure",
  "radiation.absorbed_dose",
  "radiation.dose_equivalent",
  "radiation.dose_rate",
]) {
  if (!contracts.includes(token)) failures.push(`P8 contracts missing ${token}`);
}

const env = readFileSync(
  join(root, "src/integrations/environmental-telemetry/environmental-adapter.ts"),
  "utf8",
);
if (!env.includes('metric.domain === "environmental"')) {
  failures.push("Environmental adapter must fail closed to reviewed environmental metrics");
}
if (!env.includes("compartment:")) {
  failures.push("Environmental telemetry must preserve compartment context");
}

const radiation = readFileSync(
  join(root, "src/integrations/environmental-telemetry/radiation-adapter.ts"),
  "utf8",
);
if (!radiation.includes("RADIATION_METRIC_CODES")) {
  failures.push("Radiation adapter must constrain accepted dose quantities explicitly");
}
if (!radiation.includes('metric.domain === "radiation"')) {
  failures.push("Radiation adapter must fail closed to reviewed radiation metrics");
}

const tests = readFileSync(
  join(root, "tests/integrations/p8-environmental-radiation.test.ts"),
  "utf8",
);
for (const token of [
  "habitat telemetry exposes only reviewed canonical environmental metrics",
  "preserve compartment/location context",
  "keeps absorbed dose and dose equivalent as distinct quantities",
]) {
  if (!tests.includes(token)) failures.push(`P8 test coverage missing: ${token}`);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p8"] !== "node scripts/verify-p8.mjs") {
  failures.push("package.json must expose verify:p8");
}
if (!String(pkg.scripts?.check ?? "").includes("verify:p8")) {
  failures.push("Full check must include verify:p8");
}

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p8")) failures.push("CI must run the P8 verifier");

const migrationsDir = join(root, "supabase", "migrations");
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  if (sql.length) failures.push(`P8 must not add database migrations: ${sql.join(", ")}`);
}

if (failures.length) {
  console.error(
    "P8 environmental & radiation telemetry verification FAILED:\n- " + failures.join("\n- "),
  );
  process.exit(1);
}

console.log("P8 environmental & radiation telemetry verification PASS");
