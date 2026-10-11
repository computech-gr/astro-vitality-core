import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const sql = readFileSync(new URL('../supabase/migrations/20261011000000_p23_unified_mission_record_index.sql', import.meta.url), 'utf8');
for (const token of [
  'create table if not exists public.crew_health_record_index',
  'references public.mission_events(id)',
  'enable row level security',
  'force row level security',
  'revoke insert, update, delete',
  'crew_health_record_index_scoped_read',
  'public.has_mission_role',
  'm.crew_member_id = crew_health_record_index.crew_member_id',
  'after insert on public.mission_events',
  'on conflict (event_id) do nothing',
]) assert.ok(sql.includes(token), `Missing P23A guard: ${token}`);
assert.ok(!/\bgrant\s+(?:all|insert|update|delete)\s+on\s+public\.crew_health_record_index\s+to\s+authenticated/i.test(sql));
console.log('P23A schema static checks PASS (migration not executed; RLS requires live DB validation)');
