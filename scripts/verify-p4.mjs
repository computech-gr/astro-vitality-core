import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/catalog/reviewed-mvp-v1.1.ts",
  "src/domain/metric-registry.ts",
  "src/domain/units.ts",
  "src/domain/ingestion.ts",
  "src/domain/serialization.ts",
  "src/domain/series.ts",
  "tests/domain/p4-canonical-data.test.ts",
  "docs/CANONICAL_HEALTH_DATA.md",
  "docs/SCIENTIFIC_BASELINE_V1_1.md",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`Missing required P4 file: ${file}`);

const catalog = readFileSync(join(root, "src/domain/catalog/reviewed-mvp-v1.1.ts"), "utf8");
for (const token of [
  'SCIENTIFIC_BASELINE_VERSION = "1.1"',
  "ffed3a7f3afb844963900bd53cbb9edd74588f613c925d323fd58ded0cce7273",
  '"radiation.absorbed_dose"',
  '"radiation.dose_equivalent"',
  '"phys.heart_rate"',
  '"cognition.pvt_median_rt"',
  '"environment.co2"',
]) if (!catalog.includes(token)) failures.push(`Reviewed catalogue missing required token: ${token}`);
if (catalog.includes('"review":"REMOVE"')) failures.push("Reviewed P4 catalogue must not promote matrix rows marked REMOVE");

const contracts = readFileSync(join(root, "src/domain/contracts.ts"), "utf8");
for (const token of ["CanonicalMetricDefinition", "ObservationEnvelope", "ObservationInterpretation", "RawSignalChunk", "MissionOperationalLimit", "ClinicalReferenceInterval"]) {
  if (!contracts.includes(token)) failures.push(`P4 contracts missing ${token}`);
}

const units = readFileSync(join(root, "src/domain/units.ts"), "utf8");
if (!units.includes("no scientifically governed conversion")) failures.push("Unit normalization must fail closed for ungoverned conversions");

const tests = readFileSync(join(root, "tests/domain/p4-canonical-data.test.ts"), "utf8");
for (const token of ["preserving source provenance and quality", "absorbed dose and dose equivalent", "refuses ungoverned analyte-specific conversions"]) {
  if (!tests.includes(token)) failures.push(`P4 tests missing required gate: ${token}`);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (packageJson.scripts?.["verify:p4"] !== "node scripts/verify-p4.mjs") failures.push("package.json must expose verify:p4");
if (!String(packageJson.scripts?.check ?? "").includes("verify:p4")) failures.push("Full check must include verify:p4");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p4")) failures.push("CI must run the P4 verifier");

const migrationsDir = join(root, "supabase", "migrations");
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const unexpected = sql.filter((name) => name !== "20260919190000_p15_ground_research_console.sql");
  if (unexpected.length) failures.push(`This P4 canonical-domain patch must not add database migrations: ${unexpected.join(", ")}`);
}

if (failures.length) {
  console.error("P4 canonical data verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P4 canonical data verification PASS");
