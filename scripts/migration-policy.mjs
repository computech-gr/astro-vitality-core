import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const P15_MIGRATIONS = new Set([
  "20260919164826_c7dfa3eb-b9a5-4bce-9ae7-aa4b712120d9.sql",
  "20260919164849_0a37122b-370c-4662-9148-8a0b58f146c5.sql",
]);

const GOVERNED_MIGRATION_MARKERS = [
  "-- P16 Security & Safety Hardening",
  "-- P20 Mission Identity & Sign-in",
  "-- P20 Mission & Crew Operations",
  "-- P20 Secure Bootstrap & Auth Readiness",
  "-- P23A: append-only, crew/mission-scoped structured index",
  "-- P24: Explicit, operator-authorized reuse",
];

export function isGovernedMigration(root, name) {
  if (P15_MIGRATIONS.has(name)) return true;
  const path = join(root, "supabase", "migrations", name);
  if (!existsSync(path)) return false;
  const sql = readFileSync(path, "utf8");
  return GOVERNED_MIGRATION_MARKERS.some((marker) => sql.includes(marker));
}

export function findUnexpectedMigrations(root) {
  const dir = join(root, "supabase", "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => !isGovernedMigration(root, name));
}
