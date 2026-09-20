import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

const config = read("src/integrations/supabase/config.ts");
for (const token of [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "getSupabaseBrowserConfigStatus",
  "supabaseConfigurationMessage",
]) {
  if (!config.includes(token)) failures.push(`Supabase config preflight missing ${token}`);
}
if (config.includes("SERVICE_ROLE")) {
  failures.push("Browser-safe Supabase config preflight must never reference a service-role key");
}

const client = read("src/integrations/supabase/client.ts");
if (!client.includes("getSupabaseBrowserConfigStatus")) {
  failures.push("Supabase browser client must use the configuration preflight");
}

const records = read("src/infrastructure/mission-records.ts");
for (const token of ['configuration: "configured"', 'configuration: "missing"']) {
  if (!records.includes(token)) failures.push(`Mission records cloud context missing ${token}`);
}
if (!records.includes("configuration_required")) {
  failures.push("Mission records sync must report configuration_required");
}

const ground = read("src/infrastructure/ground-research/runtime.ts");
if (!ground.includes("configuration_required")) {
  failures.push("Ground synchronization must fail closed with configuration_required");
}

const offline = read("src/components/offline-mission.tsx");
if (!offline.includes("configuration_required")) {
  failures.push("Offline Mission Mode UI missing the configuration_required state");
}
if (!offline.includes('replaceAll("_", " ").toUpperCase()')) {
  failures.push("Offline Mission Mode UI must render the cloud state as CONFIGURATION REQUIRED");
}
if (offline.includes("mitochondria-logo")) {
  failures.push("Offline Mission Mode must not render a duplicate page-local header logo");
}

const recorded = read("src/components/recorded-mission-data.tsx");
if (!recorded.includes("configuration_required")) {
  failures.push("Recorded Mission Data must report configuration_required");
}
if (!recorded.includes('configuration === "missing"')) {
  failures.push("Recorded Mission Data must surface missing cloud configuration");
}

const evidence = JSON.parse(read("data/submission/p20-evidence.v1.json"));
const items = Array.isArray(evidence.items) ? evidence.items : (evidence.evidence ?? []);
const byId = new Map(items.map((item) => [item.id, item]));
const hw = byId.get("P20-HW-001");
if (!hw) {
  failures.push("P20-HW-001 evidence item missing");
} else if (hw.state !== "ready" && hw.status !== "ready") {
  failures.push(`P20-HW-001 must be ready, found ${hw.state ?? hw.status}`);
}

const docs = read("docs/OFFLINE_MISSION_MODE.md");
if (!docs.includes("CONFIGURATION REQUIRED")) {
  failures.push("docs/OFFLINE_MISSION_MODE.md must document the CONFIGURATION REQUIRED state");
}

if (failures.length) {
  console.error("Cloud/offline readiness verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Cloud/offline readiness verification PASS");
