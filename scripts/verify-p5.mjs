import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const failures = [];
const required = [
  "src/integrations/device-adapters/contracts.ts",
  "src/integrations/device-adapters/runtime.ts",
  "src/integrations/device-adapters/reference-adapter.ts",
  "src/integrations/device-adapters/index.ts",
  "tests/integrations/p5-device-adapter-sdk.test.ts",
  "docs/DEVICE_ADAPTER_SDK.md",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`Missing required P5 file: ${file}`);
const contracts = readFileSync(join(root, "src/integrations/device-adapters/contracts.ts"), "utf8");
for (const token of ["discover(", "connect(", "capabilities(", "stream(", "quality(", "normalize(", "disconnect(", "syncCursor(", "health(", "AdapterClockMetadata"]) if (!contracts.includes(token)) failures.push(`Adapter contract missing ${token}`);
const runtime = readFileSync(join(root, "src/integrations/device-adapters/runtime.ts"), "utf8");
for (const token of ["getCanonicalMetric", "ingestCanonicalObservation", "validateRawSignalChunk"]) if (!runtime.includes(token)) failures.push(`P5 runtime must reuse P4 boundary: ${token}`);
const reference = readFileSync(join(root, "src/integrations/device-adapters/reference-adapter.ts"), "utf8");
if (!reference.includes("not a product simulator")) failures.push("Reference adapter must explicitly remain a conformance fixture");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p5"] !== "node scripts/verify-p5.mjs") failures.push("package.json must expose verify:p5");
if (!String(pkg.scripts?.check ?? "").includes("verify:p5")) failures.push("Full check must include verify:p5");
const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p5")) failures.push("CI must run the P5 verifier");
const migrationsDir = join(root, "supabase", "migrations");
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  if (sql.length) failures.push(`P5 SDK must not add database migrations: ${sql.join(", ")}`);
}
if (failures.length) { console.error("P5 device adapter SDK verification FAILED:\n- " + failures.join("\n- ")); process.exit(1); }
console.log("P5 device adapter SDK verification PASS");
