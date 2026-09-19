import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/integrations/medical-lab/contracts.ts",
  "src/integrations/medical-lab/csv.ts",
  "src/integrations/medical-lab/fhir.ts",
  "src/integrations/medical-lab/lab-ingestion.ts",
  "src/integrations/medical-lab/manual-entry.ts",
  "src/integrations/medical-lab/medical-device.ts",
  "tests/integrations/p7-medical-lab-integration.test.ts",
  "docs/MEDICAL_LAB_INTEGRATION.md",
];
for (const file of required)
  if (!existsSync(join(root, file))) failures.push(`Missing required P7 file: ${file}`);

const fhir = readFileSync(join(root, "src/integrations/medical-lab/fhir.ts"), "utf8");
if (!fhir.includes("metricMap"))
  failures.push("FHIR import must require an explicit canonical metric map");
if (!fhir.includes("not mapped to a reviewed canonical metric"))
  failures.push("FHIR import must fail closed on unmapped terminology");

const manual = readFileSync(join(root, "src/integrations/medical-lab/manual-entry.ts"), "utf8");
if (!manual.includes('importFormat: "manual"'))
  failures.push("Manual biomarker workflow must preserve manual provenance");

const medical = readFileSync(join(root, "src/integrations/medical-lab/medical-device.ts"), "utf8");
for (const token of ["phys.spo2", "phys.bp_systolic", "phys.bp_diastolic"])
  if (!medical.includes(token)) failures.push(`Medical-device boundary missing ${token}`);

const tests = readFileSync(
  join(root, "tests/integrations/p7-medical-lab-integration.test.ts"),
  "utf8",
);
for (const token of [
  "CSV biomarker import",
  "FHIR import",
  "manual biomarker fallback",
  "SpO2 and blood-pressure",
])
  if (!tests.includes(token)) failures.push(`P7 test coverage missing ${token}`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p7"] !== "node scripts/verify-p7.mjs")
  failures.push("package.json must expose verify:p7");
if (!String(pkg.scripts?.check ?? "").includes("verify:p7"))
  failures.push("Full check must include verify:p7");
const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p7")) failures.push("CI must run the P7 verifier");

const migrationsDir = join(root, "supabase", "migrations");
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const unexpected = sql.filter(
    (name) =>
      ![
        "20260919190000_p15_ground_research_console.sql",
        "20260919164826_c7dfa3eb-b9a5-4bce-9ae7-aa4b712120d9.sql",
        "20260919164849_0a37122b-370c-4662-9148-8a0b58f146c5.sql",
      ].includes(name),
  );
  if (unexpected.length)
    failures.push(`P7 must not add database migrations: ${unexpected.join(", ")}`);
}

if (failures.length) {
  console.error("P7 medical & lab integration verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P7 medical & lab integration verification PASS");
