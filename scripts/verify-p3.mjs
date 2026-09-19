import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/contracts.ts",
  "src/domain/validation.ts",
  "src/domain/index.ts",
  "tests/domain/contracts.test.ts",
  "tests/domain/mission-crew.test.ts",
  "docs/DOMAIN_MODEL.md",
  "docs/SCIENTIFIC_GOVERNANCE.md",
];

for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Missing required P3 file: ${file}`);
}

const contracts = readFileSync(join(root, "src/domain/contracts.ts"), "utf8");
for (const domain of ["biological", "cognitive", "behavioral", "psychological", "environmental", "radiation"]) {
  if (!contracts.includes(`\"${domain}\"`)) failures.push(`Health-signal taxonomy is missing required domain: ${domain}`);
}
for (const field of ["quality", "provenance", "classification", "nonDiagnostic", "CrewMember", "Mission", "CrewAssignment"]) {
  if (!contracts.includes(field)) failures.push(`P3 contracts are missing required safety/provenance field: ${field}`);
}

if (existsSync(join(root, "verify-foundation.mjs"))) {
  failures.push("Legacy root verify-foundation.mjs must be removed; scripts/verify-foundation.mjs is the single active foundation verifier");
}

for (const file of ["src/domain/contracts.ts", "src/domain/validation.ts", "src/domain/index.ts"]) {
  const text = readFileSync(join(root, file), "utf8");
  if (/from\s+["'](?:react|@supabase\/|@\/integrations\/supabase)/.test(text)) {
    failures.push(`Domain file must remain framework/vendor neutral: ${file}`);
  }
}

for (const pattern of [/\bdiagnosis\s*:/, /\btreatment\s*:/, /\bclinicalThreshold\s*:/, /\bmedicationRecommendation\s*:/]) {
  if (pattern.test(contracts)) failures.push(`P3 contracts contain a forbidden clinical-output field: ${pattern}`);
}

const validation = readFileSync(join(root, "src/domain/validation.ts"), "utf8");
for (const invariant of ["Derived observations require a derivation method", "Quality score must be between 0 and 1", "explicitly non-diagnostic"]) {
  if (!validation.includes(invariant)) failures.push(`P3 validator is missing required invariant: ${invariant}`);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (packageJson.scripts?.test !== "bun test") failures.push("package.json must expose `bun test` through the test script");
if (packageJson.scripts?.["verify:p3"] !== "node scripts/verify-p3.mjs") failures.push("package.json must expose the P3 verifier");
if (!String(packageJson.scripts?.check ?? "").includes("verify:p3")) failures.push("The full check command must include verify:p3");
if (!String(packageJson.scripts?.check ?? "").includes("bun run test")) failures.push("The full check command must include domain tests");

const readme = readFileSync(join(root, "README.md"), "utf8");
if (!readme.includes("P3") && !readme.includes("P4")) {
  failures.push("README current status must identify P3 or a later completed phase");
}

const migrationsDir = join(root, "supabase", "migrations");
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const unexpected = sql.filter((name) => name !== "20260919190000_p15_ground_research_console.sql");
  if (unexpected.length) failures.push(`P3 must not introduce Supabase migrations: ${unexpected.join(", ")}`);
}

for (const validator of ["validateCrewMember", "validateMission", "validateCrewAssignment"]) {
  if (!validation.includes(validator)) failures.push(`P3 validator is missing identity/mission invariant: ${validator}`);
}

if (failures.length) {
  console.error("P3 domain verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("P3 domain verification PASS");
