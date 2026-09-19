import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "README.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CITATIONS.md",
  "CODE_OF_CONDUCT.md",
  ".env.example",
  ".github/workflows/quality.yml",
  "docs/ARCHITECTURE.md",
  "docs/DEVELOPMENT.md",
  "docs/OPEN_SOURCE.md",
  "docs/SECURITY_MODEL.md",
  "docs/REPOSITORY_STRUCTURE.md",
];

for (const file of required) {
  if (!existsSync(join(root, file))) failures.push(`Missing required foundation file: ${file}`);
}

const gitignore = readFileSync(join(root, ".gitignore"), "utf8");
for (const rule of [".env", ".env.*", "!.env.example"]) {
  if (!gitignore.split(/\r?\n/).includes(rule))
    failures.push(`.gitignore is missing exact rule: ${rule}`);
}

const config = readFileSync(join(root, "src/infrastructure/config.ts"), "utf8");
if (!config.includes("https://mitochondria.edocinfo.com")) {
  failures.push("Canonical production origin is missing from infrastructure config");
}

const eslintConfig = readFileSync(join(root, "eslint.config.js"), "utf8");
if (/ignores\s*:\s*\[[^\]]*["\']src\/integrations\/supabase\/\*\*[^\]]*\]/s.test(eslintConfig)) {
  failures.push("Generated Supabase integration files must not be blanket-excluded from linting");
}

const migrationsDir = join(root, "supabase", "migrations");
// P15 introduces the first governed cloud persistence boundary. The Lovable migration
// system records each applied migration under its own generated filename, so the P15
// ground/research console migration and its execute-hardening follow-up are expected.
const EXPECTED_MIGRATIONS = new Set([
  "20260919190000_p15_ground_research_console.sql",
  "20260919164826_c7dfa3eb-b9a5-4bce-9ae7-aa4b712120d9.sql",
  "20260919164849_0a37122b-370c-4662-9148-8a0b58f146c5.sql",
]);
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const unexpected = sql.filter((name) => !EXPECTED_MIGRATIONS.has(name));
  if (unexpected.length) failures.push(`Unexpected Supabase migrations: ${unexpected.join(", ")}`);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (
      ["node_modules", ".git", "dist", ".output", ".vinxi", ".tanstack", ".nitro"].includes(entry)
    )
      continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

let trackedFiles;
let gitAvailable = true;
try {
  trackedFiles = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => join(root, file));
} catch {
  gitAvailable = false;
  trackedFiles = walk(root).filter((file) => relative(root, file) !== ".env");
}

if (gitAvailable) {
  const forbiddenTracked = trackedFiles
    .map((file) => relative(root, file).replaceAll("\\", "/"))
    .filter((file) => file === ".env" || (file.startsWith(".env.") && file !== ".env.example"));
  if (forbiddenTracked.length) {
    failures.push(`Environment file(s) must not be tracked: ${forbiddenTracked.join(", ")}`);
  }
}

const secretPatterns = [
  /["\']sb_secret_[A-Za-z0-9._-]+["\']/i,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["\'][^"\']+["\']/i,
  /DATABASE_PASSWORD\s*=\s*["\'][^"\']+["\']/i,
  /JWT_SECRET\s*=\s*["\'][^"\']+["\']/i,
];
for (const file of trackedFiles) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (rel === ".env.example" || rel === "scripts/verify-foundation.mjs") continue;
  if (!/\.(?:ts|tsx|js|mjs|cjs|json|md|toml|ya?ml|txt)$/i.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of secretPatterns) {
    if (pattern.test(text))
      failures.push(`Possible private credential assignment found in tracked file: ${rel}`);
  }
}

if (failures.length) {
  console.error("P2 foundation verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("P2 foundation verification PASS");
