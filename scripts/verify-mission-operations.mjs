import { existsSync, readFileSync } from "node:fs";

const required = [
  "src/components/mission-operations.tsx",
  "src/infrastructure/mission-operations.ts",
  "src/routes/mission.operations.tsx",
  "tests/identity/p20-mission-operations.test.ts",
  "supabase/migrations/20260920235600_p20_mission_crew_operations.sql",
  "docs/MISSION_CREW_OPERATIONS.md",
];
for (const file of required) if (!existsSync(file)) throw new Error(`Mission operations missing: ${file}`);

const migration = readFileSync("supabase/migrations/20260920235600_p20_mission_crew_operations.sql", "utf8").toLowerCase();
const infra = readFileSync("src/infrastructure/mission-operations.ts", "utf8");
const ui = readFileSync("src/components/mission-operations.tsx", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const routeTree = readFileSync("src/routeTree.gen.ts", "utf8");
const seed = readFileSync("supabase/seed.sql", "utf8").toLowerCase();

const checks = [
  [migration.includes("create table if not exists public.mission_crew_assignments"), "mission-scoped crew registry exists"],
  [migration.includes("force row level security") && migration.includes("revoke all on public.mission_crew_assignments from public, anon, authenticated"), "crew registry has no direct browser mutation/read path"],
  [migration.includes("mission_memberships_active_crew_self_uq"), "active crew-self ownership is unique per mission crew slot"],
  [migration.includes("preserve already-governed mission/crew relationships") && migration.includes("from public.mission_events"), "existing mission/crew relationships are backfilled"],
  [seed.includes("insert into public.mission_crew_assignments") && seed.includes("synthetic-crew-01"), "fresh-clone synthetic crew is registered in the mission-scoped registry"],
  [migration.includes("create_mission_operation") && migration.includes("public.can_create_mission()"), "mission creation requires established operator standing"],
  [migration.includes("mission must retain at least one active operator"), "last operator deactivation is blocked"],
  [migration.includes("crew member is not active in this mission"), "invite acceptance and issuance are mission/crew bound"],
  [migration.includes("invalid mission lifecycle transition"), "mission lifecycle is forward-only"],
  [migration.includes("mission_operations_workspace_read") && migration.includes("crew_member_updated") && migration.includes("membership_deactivated"), "operations are audited"],
  [migration.includes("security definer") && migration.includes("auth.uid() is null"), "operation RPCs authenticate internally"],
  [infra.includes("get_mission_operations_workspace") && infra.includes("set_mission_membership_active"), "browser uses governed operation RPCs"],
  [ui.includes("Create planning mission") && ui.includes("Mission crew registry") && ui.includes("Issue mission-scoped invite"), "operator workflow is exposed end-to-end"],
  [shell.includes('"Mission & Crew Operations"') && shell.includes('return "/mission/operations"'), "global navigation exposes mission operations"],
  [routeTree.includes("/mission/operations"), "generated route tree includes mission operations"],
  [!infra.includes("service_role") && !ui.includes("service_role"), "browser operations have no service-role credential path"],
];
for (const [ok, label] of checks) if (!ok) throw new Error(`Mission operations verification failed: ${label}`);
console.log("Mission & Crew Operations verification PASS");
