import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnexpectedMigrations } from "./migration-policy.mjs";

const root = process.cwd();
const failures = [];
const required = [
  "Dockerfile",
  ".dockerignore",
  "docker-compose.yml",
  "supabase/seed.sql",
  "scripts/setup-local.mjs",
  "scripts/generate-release-sample.ts",
  "docs/LOCAL_REPRODUCIBILITY.md",
  "docs/API_ADAPTER_REFERENCE.md",
  "docs/RELEASE_CANDIDATE.md",
  "docs/RELEASE_CHECKLIST.md",
  "data/release/README.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/scientific_change.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/pull_request_template.md",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const script of ["verify:p19", "setup:local", "sample:release", "docker:up", "docker:down"]) {
  if (!pkg.scripts?.[script]) failures.push(`package.json missing ${script}`);
}
if (!String(pkg.scripts?.check ?? "").includes("verify:p19")) failures.push("Full check must include verify:p19");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p19")) failures.push("CI must run P19 verifier");

const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
for (const token of ["bun install --frozen-lockfile", "bun run build", ".output/server/index.mjs"]) {
  if (!dockerfile.includes(token)) failures.push(`Dockerfile missing ${token}`);
}

const compose = readFileSync(join(root, "docker-compose.yml"), "utf8");
if (compose.includes("SERVICE_ROLE")) failures.push("docker-compose must not expose service-role credentials");
if (!compose.includes("host.docker.internal")) failures.push("docker-compose must bridge server-side local Supabase access");

const setup = readFileSync(join(root, "scripts/setup-local.mjs"), "utf8");
for (const token of ["supabase", "db", "reset", ".env.local", "ANON_KEY"]) {
  if (!setup.includes(token)) failures.push(`local setup missing ${token}`);
}
if (setup.includes("SERVICE_ROLE_KEY")) failures.push("local setup must not write/read a service-role key into app config");

const seed = readFileSync(join(root, "supabase/seed.sql"), "utf8").toLowerCase();
for (const token of ["synthetic-mission-127", "synthetic-crew-01", "synthetic"]) {
  if (!seed.includes(token)) failures.push(`seed.sql missing ${token}`);
}
if (/encrypted_password|password\s*=|password\s*:/i.test(seed)) failures.push("seed.sql must not ship a reusable demo password");

const releaseDoc = readFileSync(join(root, "docs/RELEASE_CANDIDATE.md"), "utf8").toLowerCase();
for (const token of ["independent machine", "docker", "local supabase", "not clinically validated", "v0.x"]) {
  if (!releaseDoc.includes(token)) failures.push(`release candidate docs missing ${token}`);
}

const localDoc = readFileSync(join(root, "docs/LOCAL_REPRODUCIBILITY.md"), "utf8").toLowerCase();
for (const token of ["fresh-clone", "supabase cli", "docker", "bun run setup:local", "bun run check", "sample:release"]) {
  if (!localDoc.includes(token)) failures.push(`local reproducibility docs missing ${token}`);
}

const unexpectedMigrations = findUnexpectedMigrations(root);
if (unexpectedMigrations.length) failures.push(`Unexpected Supabase migrations: ${unexpectedMigrations.join(", ")}`);

if (failures.length) {
  console.error("P19 Open-Source Release Candidate verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P19 Open-Source Release Candidate verification PASS");
