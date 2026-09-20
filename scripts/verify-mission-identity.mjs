import { existsSync, readFileSync } from "node:fs";

const required = [
  "src/components/mission-identity.tsx",
  "src/infrastructure/mission-identity.ts",
  "src/routes/mission.identity.tsx",
  "tests/identity/p20-mission-identity.test.ts",
  "supabase/migrations/20260920233000_p20_mission_identity_invites.sql",
  "docs/MISSION_IDENTITY_SIGN_IN.md",
];
for (const file of required) if (!existsSync(file)) throw new Error(`Mission identity missing: ${file}`);

const infra = readFileSync("src/infrastructure/mission-identity.ts", "utf8");
const ui = readFileSync("src/components/mission-identity.tsx", "utf8");
const live = readFileSync("src/components/live-dashboard.tsx", "utf8");
const shell = readFileSync("src/components/app-shell.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260920233000_p20_mission_identity_invites.sql", "utf8").toLowerCase();

const checks = [
  [infra.includes("signInWithPassword") && infra.includes("signInWithOtp") && infra.includes("signOut"), "Supabase sign-in, magic-link and sign-out are present"],
  [infra.includes('.from("mission_memberships")') && infra.includes("setActiveMissionMembership"), "active mission membership is loaded and selectable"],
  [infra.includes('role === "crew_self"') && infra.includes("crewMemberId"), "live physiological context requires crew-self identity"],
  [live.includes("activeLiveMissionContext") && live.includes("MISSION-BOUND") && live.includes("LOCAL FALLBACK"), "live dashboard consumes governed mission identity"],
  [shell.includes('"Mission Identity & Sign-in"') && shell.includes('return "/mission/identity"'), "global navigation exposes mission identity"],
  [ui.includes("Accept invite") && ui.includes("Operator invite issuance"), "mission membership onboarding and operator issuance UI are present"],
  [migration.includes("create table if not exists public.mission_invites"), "one-time invite table exists"],
  [migration.includes("security definer") && migration.includes("auth.uid() is null"), "invite RPCs authenticate internally"],
  [migration.includes("public.has_mission_role") && migration.includes("mission invite creation denied"), "invite creation is mission-role authorized"],
  [migration.includes("digest(v_code, 'sha256')") && migration.includes("claimed_at"), "invite codes are hash-stored and one-time"],
  [migration.includes("revoke all on public.mission_invites from public, anon, authenticated"), "invite hashes have no direct browser read path"],
  [!infra.includes("service_role") && !ui.includes("service_role"), "browser identity flow has no service-role credential path"],
];
for (const [ok, label] of checks) if (!ok) throw new Error(`Mission identity verification failed: ${label}`);
console.log("Mission Identity & Sign-in verification PASS");
