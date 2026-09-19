import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnexpectedMigrations } from "./migration-policy.mjs";

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

const unexpectedMigrations = findUnexpectedMigrations(root);
if (unexpectedMigrations.length) {
  failures.push(`Unexpected Supabase migrations: ${unexpectedMigrations.join(", ")}`);
}

if (failures.length) {
  console.error("P7 medical & lab integration verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P7 medical & lab integration verification PASS");
