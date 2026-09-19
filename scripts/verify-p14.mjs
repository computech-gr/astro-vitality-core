import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/offline-mission/contracts.ts",
  "src/domain/offline-mission/conflict.ts",
  "src/domain/offline-mission/protocol-cache.ts",
  "src/domain/offline-mission/index.ts",
  "src/infrastructure/offline/crypto.ts",
  "src/infrastructure/offline/store.ts",
  "src/infrastructure/offline/sync.ts",
  "src/infrastructure/offline/runtime.ts",
  "src/infrastructure/offline/service-worker.ts",
  "src/infrastructure/offline/index.ts",
  "src/components/offline-mission.tsx",
  "src/routes/mission.offline.tsx",
  "tests/offline/p14-offline-mission.test.ts",
  "docs/OFFLINE_MISSION_MODE.md",
  "public/sw.js",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const crypto = readFileSync(join(root, "src/infrastructure/offline/crypto.ts"), "utf8");
for (const token of ["AES-GCM", "false", "additionalData", "payloadHash"]) {
  if (!crypto.includes(token)) failures.push(`P14 encryption boundary missing ${token}`);
}

const store = readFileSync(join(root, "src/infrastructure/offline/store.ts"), "utf8");
for (const token of [
  "IndexedDbOfflineMissionStore",
  "Append-only record",
  "sync_queue",
  "CryptoKey",
]) {
  if (!store.includes(token)) failures.push(`P14 local store missing ${token}`);
}

const sync = readFileSync(join(root, "src/infrastructure/offline/sync.ts"), "utf8");
for (const token of [
  "idempotencyKey",
  "resolveSyncConflict",
  "pending",
  "in_flight",
  "conflict",
  "ReferenceMemorySyncTransport",
]) {
  if (!sync.includes(token)) failures.push(`P14 sync engine missing ${token}`);
}

const sw = readFileSync(join(root, "public/sw.js"), "utf8");
if (!sw.includes("/api/")) failures.push("P14 service worker must exclude API requests");
if (!sw.includes("supabase")) failures.push("P14 service worker must exclude Supabase requests");

const component = readFileSync(join(root, "src/components/offline-mission.tsx"), "utf8");
for (const token of [
  "Offline Mission Mode",
  "Encrypted local store",
  "Sync queue",
  "Protocol cache",
  "cloud is not in the critical",
]) {
  if (!component.toLowerCase().includes(token.toLowerCase()))
    failures.push(`P14 UI missing ${token}`);
}

const liveDashboard = readFileSync(join(root, "src/components/live-dashboard.tsx"), "utf8");
if (!liveDashboard.includes("persistOfflineMissionEvent"))
  failures.push("P14 must persist accepted live dashboard events locally");
const readiness = readFileSync(join(root, "src/components/readiness-assessment.tsx"), "utf8");
if (!readiness.includes("persistOfflineMissionEvent"))
  failures.push("P14 must persist accepted P11 readiness records locally");
const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
if (!rootRoute.includes("registerOfflineServiceWorker"))
  failures.push("P14 must register the offline application-shell service worker");

const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes('label === "Offline Mission Mode"'))
  failures.push("Offline Mission Mode menu item must activate P14 route");
if (!shell.includes('return "/mission/offline"')) failures.push("P14 navigation route missing");

const tests = readFileSync(join(root, "tests/offline/p14-offline-mission.test.ts"), "utf8");
for (const token of [
  "encrypted at rest",
  "append-only",
  "disconnect",
  "reconnect",
  "conflict resolution",
  "protocol cache",
]) {
  if (!tests.toLowerCase().includes(token.toLowerCase()))
    failures.push(`P14 tests missing gate: ${token}`);
}

const docs = readFileSync(join(root, "docs/OFFLINE_MISSION_MODE.md"), "utf8");
if (!docs.includes("does **not** grant unauthenticated browser writes"))
  failures.push("P14 docs must not falsely claim secure cloud persistence");

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (packageJson.scripts?.["verify:p14"] !== "node scripts/verify-p14.mjs")
  failures.push("package.json must expose verify:p14");
if (!String(packageJson.scripts?.check ?? "").includes("verify:p14"))
  failures.push("Full check must include verify:p14");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p14")) failures.push("CI must run P14 verifier");

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
    failures.push(`P14 must not add unsafe database migrations: ${unexpected.join(", ")}`);
}

if (failures.length) {
  console.error("P14 Offline Mission Mode verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P14 Offline Mission Mode verification PASS");
