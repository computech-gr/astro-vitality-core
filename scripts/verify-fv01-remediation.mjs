import { existsSync, readFileSync } from "node:fs";

const proposed = "supabase/proposed/20261014000000_fv01_security_privacy_remediation.sql";
const applied = "supabase/migrations/20261014000000_fv01_security_privacy_remediation.sql";
const path = existsSync(applied) ? applied : proposed;
if (!existsSync(path)) throw new Error("FV-01 migration missing");
const sql = readFileSync(path, "utf8");
const norm = sql.toLowerCase().replace(/\s+/g, " ");
for (const marker of [
  "-- FV-01 Security & Privacy Remediation",
  "and mm.active",
  "identifier_unavailable",
  "unique_violation",
  "crew assignment inactive for mission",
  "mission closed for new events",
  "'scope','operational'",
  "research export rate limit",
  "mission_not_closed",
  "existing crew-self binding differs",
  "crew_self_binding_conflict",
  "audit_events is append-only",
  "mission end is immutable after close",
  "mission_research_snapshots",
  "closed mission cannot be reopened",
  "crew assignments are frozen after mission close",
  "snapshot_unavailable",
  "revoke insert, update, delete, truncate",
]) if (!sql.includes(marker) && !norm.includes(marker.toLowerCase())) throw new Error(`FV-01 marker missing: ${marker}`);
if (/grant\s+[^;]*\s+to\s+(public|anon)\b/i.test(sql)) throw new Error("FV-01 must not grant to public/anon");
if (/grant\s+(insert|update|delete|all)\b[^;]*\bto\s+[^;]*\b(authenticated|anon|public)\b/i.test(sql)) throw new Error("FV-01 must not broaden table privileges");
const d = (norm.match(/security definer/g) ?? []).length;
const p = (norm.match(/security definer set search_path/g) ?? []).length;
if (d !== p) throw new Error("FV-01 SECURITY DEFINER without pinned search_path");
const id = readFileSync("src/infrastructure/mission-identity.ts", "utf8");
if (!id.includes("shouldClearSelection") || !id.includes("readActiveSelection")) throw new Error("FV-01-11 client binding missing");
console.log(`FV-01 remediation verifier: PASS (${path === applied ? "APPLIED" : "PROPOSED — not applied"})`);
