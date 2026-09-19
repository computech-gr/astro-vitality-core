import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnexpectedMigrations } from "./migration-policy.mjs";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/validation-usability/contracts.ts",
  "src/domain/validation-usability/catalog.ts",
  "src/domain/validation-usability/report.ts",
  "src/domain/validation-usability/index.ts",
  "src/components/validation-usability.tsx",
  "src/routes/mission.validation.tsx",
  "tests/validation/p18-validation-usability.test.ts",
  "docs/VALIDATION_USABILITY.md",
  "docs/KNOWN_LIMITATIONS.md",
  "data/validation/p18-evidence.v1.json",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const evidencePath = join(root, "data/validation/p18-evidence.v1.json");
if (existsSync(evidencePath)) {
  const ledger = JSON.parse(readFileSync(evidencePath, "utf8"));
  const evidence = Array.isArray(ledger.evidence) ? ledger.evidence : [];
  const criticalIds = ["SCI-001", "SCN-001", "SCN-002", "A11Y-001", "A11Y-002", "COG-001", "LAT-001", "WF-001", "WF-002", "WF-003"];
  for (const id of criticalIds) {
    const item = evidence.find((candidate) => candidate.criterionId === id);
    if (!item) failures.push(`P18 evidence missing ${id}`);
    else if (item.status !== "pass") failures.push(`P18 critical criterion ${id} is ${item.status}; actual validation evidence is required before closure`);
    else if (!item.checkedAt || !item.evidence) failures.push(`P18 critical criterion ${id} pass lacks checkedAt/evidence`);
  }
  const battery = evidence.find((candidate) => candidate.criterionId === "BAT-001");
  if (!battery || !["pass", "known_limitation"].includes(battery.status)) failures.push("BAT-001 must be measured or explicitly documented as a known limitation");
}

const docs = readFileSync(join(root, "docs/VALIDATION_USABILITY.md"), "utf8").toLowerCase();
for (const token of ["biologist", "accessibility", "cognitive", "latency", "battery", "known limitation", "clinical validation"]) {
  if (!docs.includes(token)) failures.push(`P18 validation docs missing ${token}`);
}
const limits = readFileSync(join(root, "docs/KNOWN_LIMITATIONS.md"), "utf8").toLowerCase();
for (const token of ["not clinically validated", "battery", "latency", "synthetic", "clinical/flight-medicine"]) {
  if (!limits.includes(token)) failures.push(`P18 known limitations missing ${token}`);
}

const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes("Validation & Limitations")) failures.push("P18 navigation item missing");
if (!shell.includes('return "/mission/validation"')) failures.push("P18 navigation route missing");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p18"] !== "node scripts/verify-p18.mjs") failures.push("package.json must expose verify:p18");
if (!String(pkg.scripts?.check ?? "").includes("verify:p18")) failures.push("Full check must include verify:p18");
const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p18")) failures.push("CI must run P18 verifier");

const unexpectedMigrations = findUnexpectedMigrations(root);
if (unexpectedMigrations.length) failures.push(`Unexpected Supabase migrations: ${unexpectedMigrations.join(", ")}`);

if (failures.length) {
  console.error("P18 Validation & Usability verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P18 Validation & Usability verification PASS");
