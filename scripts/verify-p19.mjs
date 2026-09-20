import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  "scripts/serve-dist.mjs",
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

const releaseWorkflow = readFileSync(join(root, ".github/workflows/release-candidate.yml"), "utf8");
for (const token of ["supabase/setup-cli", "bun run setup:local", "docker compose", "curl --fail"]) {
  if (!releaseWorkflow.includes(token)) failures.push(`release-candidate workflow missing ${token}`);
}

const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
for (const token of ["bun install --frozen-lockfile", "bun run build", "/app/dist", "scripts/serve-dist.mjs"]) {
  if (!dockerfile.includes(token)) failures.push(`Dockerfile missing ${token}`);
}
if (dockerfile.includes(".output/server/index.mjs")) failures.push("Dockerfile must not depend on the unused .output Nitro path");

const selfHostServer = readFileSync(join(root, "scripts/serve-dist.mjs"), "utf8");
for (const token of ["dist/server/index.mjs", "dist/client", "handler.fetch", "server.listen"]) {
  if (!selfHostServer.includes(token)) failures.push(`self-host runtime missing ${token}`);
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

const migrationDir = join(root, "supabase/migrations");
const migrationNames = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
const expectedMigrations = [
  "20260919164826_c7dfa3eb-b9a5-4bce-9ae7-aa4b712120d9.sql",
  "20260919164849_0a37122b-370c-4662-9148-8a0b58f146c5.sql",
  "20260919170410_cfadc7d4-72db-42ad-a76e-4181cc0c70f4.sql",
  "20260919170720_1329f21c-6181-4172-a04d-ced64437d340.sql",
  "20260920233000_p20_mission_identity_invites.sql",
  "20260920235600_p20_mission_crew_operations.sql",
];
if (JSON.stringify(migrationNames) !== JSON.stringify(expectedMigrations)) {
  failures.push(`P19 fresh-clone migration chain must contain the governed applied migrations; found: ${migrationNames.join(", ")}`);
}
const hashes = new Map();
for (const name of migrationNames) {
  const sql = readFileSync(join(migrationDir, name));
  const hash = createHash("sha256").update(sql).digest("hex");
  const previous = hashes.get(hash);
  if (previous) failures.push(`duplicate migration content: ${previous} and ${name}`);
  else hashes.set(hash, name);
}

const releaseDoc = readFileSync(join(root, "docs/RELEASE_CANDIDATE.md"), "utf8").toLowerCase();
for (const token of ["independent machine", "docker", "local supabase", "not clinically validated", "v0.x", "six-migration chain"]) {
  if (!releaseDoc.includes(token)) failures.push(`release candidate docs missing ${token}`);
}

const localDoc = readFileSync(join(root, "docs/LOCAL_REPRODUCIBILITY.md"), "utf8").toLowerCase();
for (const token of ["fresh-clone", "supabase cli", "docker", "bun run setup:local", "bun run check", "sample:release", "dist/server/index.mjs"]) {
  if (!localDoc.includes(token)) failures.push(`local reproducibility docs missing ${token}`);
}

const unexpectedMigrations = findUnexpectedMigrations(root);
if (unexpectedMigrations.length) failures.push(`Unexpected Supabase migrations: ${unexpectedMigrations.join(", ")}`);

if (failures.length) {
  console.error("P19 Open-Source Release Candidate verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P19 Open-Source Release Candidate verification PASS");
