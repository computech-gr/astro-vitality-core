import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];
const ignored = new Set(["node_modules", ".git", "dist", ".output", ".vinxi", ".tanstack", ".nitro"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".yml", ".yaml", ".sql", ".toml", ".txt"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (ignored.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

let tracked = [];
try {
  tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
} catch {
  tracked = walk(root).map((file) => relative(root, file));
  warnings.push("git unavailable; security audit scanned the working tree instead of tracked files");
}

if (tracked.includes(".env")) failures.push("tracked root .env is forbidden");

const secretPatterns = [
  [/sb_secret_[A-Za-z0-9._-]{16,}/, "Supabase secret key"],
  [/service_role[\s:=]+["']?[A-Za-z0-9._-]{24,}/i, "service-role credential"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/gh[pousr]_[A-Za-z0-9]{20,}/, "GitHub token"],
];

for (const name of tracked) {
  if (!textExtensions.has(extname(name)) && ![".env.example", ".gitignore"].includes(name)) continue;
  const path = join(root, name);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  for (const [pattern, label] of secretPatterns) {
    if (pattern.test(text)) failures.push(`${name}: possible ${label}`);
  }
}

const browserRoots = ["src/components", "src/routes", "src/app", "src/domain", "src/integrations", "src/infrastructure"];
for (const base of browserRoots) {
  const dir = join(root, base);
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    if (!/[.](?:ts|tsx)$/.test(file)) continue;
    const rel = relative(root, file);
    if (rel.endsWith(".server.ts") || rel.endsWith("client.server.ts")) continue;
    const text = readFileSync(file, "utf8");
    if (/client[.]server|supabaseAdmin|SUPABASE_SERVICE_ROLE_KEY/.test(text)) {
      failures.push(`${rel}: server-only Supabase privilege boundary referenced by browser-reachable code`);
    }
  }
}

for (const name of tracked.filter((entry) => entry.startsWith("supabase/migrations/") && entry.endsWith(".sql"))) {
  const sql = readFileSync(join(root, name), "utf8");
  const definerCount = (sql.match(/security\s+definer/gi) ?? []).length;
  const pinnedCount = (sql.match(/security\s+definer\s+set\s+search_path/gi) ?? []).length;
  if (definerCount !== pinnedCount) failures.push(`${name}: every SECURITY DEFINER function must pin search_path`);
  if (/grant\s+execute\s+on\s+function[\s\S]{0,180}\s+to\s+(?:public|anon)\b/i.test(sql)) {
    failures.push(`${name}: privileged function execution granted to public/anon`);
  }
}

if (!existsSync(join(root, "docs/security/THREAT_MODEL.md"))) failures.push("P16 threat model missing");
if (!existsSync(join(root, "docs/security/MISUSE_CASES.md"))) failures.push("P16 misuse-case register missing");

if (failures.length) {
  console.error("Security audit FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
for (const warning of warnings) console.warn(`Security audit warning: ${warning}`);
console.log("Security audit PASS");
