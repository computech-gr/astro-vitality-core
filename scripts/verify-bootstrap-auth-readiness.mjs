import { existsSync, readFileSync } from "node:fs";

const required = [
  "supabase/migrations/20260921002000_p20_secure_bootstrap_auth_readiness.sql",
  "src/infrastructure/mission-auth-readiness.ts",
  "scripts/bootstrap-first-operator.mjs",
  "scripts/verify-remote-auth-config.mjs",
  "tests/identity/p20-bootstrap-auth-readiness.test.ts",
  "docs/SECURE_BOOTSTRAP_AUTH_READINESS.md",
];
for (const file of required) if (!existsSync(file)) throw new Error(`Bootstrap/auth readiness missing: ${file}`);

const migration = readFileSync(required[0], "utf8").toLowerCase();
const readiness = readFileSync(required[1], "utf8");
const bootstrap = readFileSync(required[2], "utf8");
const identityUi = readFileSync("src/components/mission-identity.tsx", "utf8");
const config = readFileSync("supabase/config.toml", "utf8").toLowerCase();
const pkg = JSON.parse(readFileSync("package.json", "utf8"));

const checks = [
  [migration.includes("create table if not exists public.mission_bootstrap_control"), "bootstrap control is durable"],
  [migration.includes("force row level security") && migration.includes("revoke all on public.mission_bootstrap_control from public, anon, authenticated"), "bootstrap state has no browser table path"],
  [migration.includes("revoke all on function public.configure_mission_bootstrap(text) from public, anon, authenticated") && migration.includes("grant execute on function public.configure_mission_bootstrap(text) to service_role"), "only service role can arm bootstrap"],
  [migration.includes("pg_advisory_xact_lock") && migration.includes("an active mission operator already exists"), "bootstrap is serialized and blocked after provisioning"],
  [migration.includes("digest(convert_to(p_bootstrap_secret") && migration.includes("bootstrap_one_time"), "bootstrap compares only a hash and is audited"],
  [bootstrap.includes("randomBytes(32)") && bootstrap.includes("SUPABASE_SERVICE_ROLE_KEY") && bootstrap.includes("signInWithPassword"), "trusted script separates server arming from authenticated user consumption"],
  [!bootstrap.includes("writeFile") && !bootstrap.includes("localStorage"), "bootstrap secret is not persisted by the script"],
  [readiness.includes('/auth/v1/settings') && readiness.includes('CONFIGURATION REQUIRED'), "browser checks explicit auth-provider readiness"],
  [identityUi.includes("loadMissionAuthReadiness") && identityUi.includes("CONFIGURATION REQUIRED"), "identity UI exposes configuration readiness before auth action"],
  [config.includes("[auth]") && config.includes("site_url = \"http://localhost:3000\"") && config.includes("[auth.email]"), "local auth configuration is version controlled"],
  [String(pkg.scripts?.["bootstrap:first-operator"] ?? "").includes("bootstrap-first-operator.mjs"), "bootstrap script is exposed as a package command"],
  [String(pkg.scripts?.["verify:bootstrap-auth-readiness"] ?? "").includes("verify-bootstrap-auth-readiness.mjs"), "bootstrap readiness verifier is exposed"],
  [String(pkg.scripts?.["verify:auth-remote"] ?? "").includes("verify-remote-auth-config.mjs"), "trusted remote auth verifier is exposed"],
  [String(pkg.scripts?.check ?? "").includes("verify:bootstrap-auth-readiness"), "full check includes bootstrap/auth readiness verifier"],
];
for (const [ok, label] of checks) if (!ok) throw new Error(`Bootstrap/auth readiness verification failed: ${label}`);
console.log("Secure Bootstrap & Auth Readiness verification PASS");
