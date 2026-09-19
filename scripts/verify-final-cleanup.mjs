import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
const guide = readFileSync(join(root, "src/components/project-guide.tsx"), "utf8");
const security = readFileSync(join(root, "docs/SECURITY_SCANNER_FINDINGS.md"), "utf8");
const p15 = readFileSync(join(root, "supabase/migrations/20260919164826_c7dfa3eb-b9a5-4bce-9ae7-aa4b712120d9.sql"), "utf8").toLowerCase();
const p16 = readFileSync(join(root, "supabase/migrations/20260919170410_cfadc7d4-72db-42ad-a76e-4181cc0c70f4.sql"), "utf8").toLowerCase();

for (const token of [
  '/project/guide#roadmap',
  '/project/guide#resources-references',
  '/project/guide#team',
  '"System Architecture": guideHref("system-architecture")',
  '"Biomarkers & Signals": guideHref("biomarkers-signals")',
]) {
  if (!shell.includes(token)) failures.push(`navigation cleanup missing ${token}`);
}

for (const id of [
  "our-mission",
  "scientific-foundation",
  "personal-baselines",
  "platform-overview",
  "system-architecture",
  "open-source-mission",
  "team",
  "resources-references",
]) {
  if (!guide.includes(`id: "${id}"`)) failures.push(`project guide missing ${id}`);
}

for (const token of ["intentional deny-by-default", "intentional RPC-only write architecture", "Do **not** use a global \"fix all\""]) {
  if (!security.includes(token)) failures.push(`security scanner review missing ${token}`);
}

const securityControls = [
  [p15, "alter table public.mission_research_keys force row level security", "research keys forced RLS"],
  [p15, "revoke all on public.mission_research_keys from authenticated", "research keys browser privileges revoked"],
  [p15, "revoke insert, update, delete on public.mission_events, public.audit_events from authenticated", "direct event/audit writes revoked"],
  [p16, "revoke all on function public.ensure_mission_research_key() from public, anon, authenticated", "internal research-key helper not browser callable"],
  [p16, "grant execute on function public.ingest_mission_event(jsonb,text) to authenticated", "governed ingestion RPC exposed to signed-in callers"],
  [p16, "if auth.uid() is null then raise exception 'authentication required'", "SECURITY DEFINER routines fail closed without authentication"],
];
for (const [text, token, label] of securityControls) {
  if (!text.includes(token)) failures.push(`security control missing: ${label}`);
}

if (failures.length) {
  console.error("Final navigation/security cleanup verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("Final navigation/security cleanup verification PASS");
