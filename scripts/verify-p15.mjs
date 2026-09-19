import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.cwd();
const failures = [];
const required = [
  "src/domain/ground-research/contracts.ts",
  "src/domain/ground-research/access.ts",
  "src/domain/ground-research/deidentify.ts",
  "src/infrastructure/ground-research/supabase-transport.ts",
  "src/infrastructure/ground-research/runtime.ts",
  "src/infrastructure/ground-research/repository.ts",
  "src/components/ground-research-console.tsx",
  "src/routes/mission.ground.tsx",
  "tests/ground-research/p15-ground-research.test.ts",
  "docs/GROUND_RESEARCH_CONSOLE.md",
  "supabase/migrations/20260919190000_p15_ground_research_console.sql",
];
for (const f of required) if (!existsSync(join(root, f))) failures.push(`missing ${f}`);
const sql = readFileSync(
  join(root, "supabase/migrations/20260919190000_p15_ground_research_console.sql"),
  "utf8",
);
for (const t of [
  "enable row level security",
  "force row level security",
  "ingest_mission_event",
  "export_research_mission",
  "audit_events",
  "mission_memberships",
  "research export denied",
  "mission access denied",
  "mission_research_keys",
  "force row level security",
])
  if (!sql.toLowerCase().includes(t.toLowerCase())) failures.push(`migration missing ${t}`);
const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
if (!rootRoute.includes("initializeGroundSyncRuntime"))
  failures.push("P15 must bind reconnect/authenticated sync runtime");
if (!rootRoute.includes("@/infrastructure/ground-research"))
  failures.push("P15 root runtime import missing");
const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes('label === "Ground & Research Console"'))
  failures.push("Ground & Research Console navigation not activated");
if (!shell.includes('return "/mission/ground"')) failures.push("P15 ground route missing");
const p14 = readFileSync(join(root, "docs/OFFLINE_MISSION_MODE.md"), "utf8");
if (!p14.includes("P15")) failures.push("P14/P15 sync handoff documentation missing");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p15"] !== "node scripts/verify-p15.mjs")
  failures.push("verify:p15 script missing");
if (!String(pkg.scripts?.check ?? "").includes("verify:p15"))
  failures.push("full check missing verify:p15");
if (failures.length) {
  console.error("P15 Ground / Research Console verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P15 Ground / Research Console verification PASS");
