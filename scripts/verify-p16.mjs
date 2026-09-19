import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnexpectedMigrations } from "./migration-policy.mjs";

const root = process.cwd();
const failures = [];
const required = [
  "docs/security/THREAT_MODEL.md",
  "docs/security/MISUSE_CASES.md",
  "docs/security/SECURITY_HARDENING.md",
  "src/security/headers.ts",
  "scripts/security-audit.mjs",
  "tests/security/p16-security-hardening.test.ts",
  "supabase/migrations/20260919170410_cfadc7d4-72db-42ad-a76e-4181cc0c70f4.sql",
  "supabase/migrations/20260919170720_1329f21c-6181-4172-a04d-ced64437d340.sql",
  ".github/workflows/security.yml",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const migration = readFileSync(join(root, "supabase/migrations/20260919170410_cfadc7d4-72db-42ad-a76e-4181cc0c70f4.sql"), "utf8").toLowerCase();
for (const token of [
  "-- p16 security & safety hardening",
  "mission operator event scope denied",
  "deidentify_research_jsonb",
  "payload too large",
  "invalid idempotency key",
  "set search_path = public, pg_temp",
]) if (!migration.includes(token)) failures.push(`P16 migration missing ${token}`);

const server = readFileSync(join(root, "src/server.ts"), "utf8");
if (!server.includes("applySecurityHeaders")) failures.push("SSR boundary must apply P16 security headers");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p16"] !== "node scripts/verify-p16.mjs") failures.push("verify:p16 script missing");
if (pkg.scripts?.["security:audit"] !== "node scripts/security-audit.mjs") failures.push("security:audit script missing");
if (!String(pkg.scripts?.check ?? "").includes("verify:p16")) failures.push("full check missing verify:p16");
if (!String(pkg.scripts?.check ?? "").includes("security:audit")) failures.push("full check missing security:audit");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p16")) failures.push("quality CI missing P16 verifier");
if (!workflow.includes("bun run security:audit")) failures.push("quality CI missing security audit");

const unexpected = findUnexpectedMigrations(root);
if (unexpected.length) failures.push(`unexpected migrations: ${unexpected.join(", ")}`);

const corrective = readFileSync(
  join(root, "supabase/migrations/20260919170720_1329f21c-6181-4172-a04d-ced64437d340.sql"),
  "utf8",
).toLowerCase();
for (const token of ["extensions", "ingest_mission_event", "export_research_mission"])
  if (!corrective.includes(token)) failures.push(`P16 corrective migration missing ${token}`);

if (failures.length) {
  console.error("P16 Security & Safety Hardening verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P16 Security & Safety Hardening verification PASS");
