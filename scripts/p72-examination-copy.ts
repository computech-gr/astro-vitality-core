/**
 * P72 operator tool: Alex Morgan synthetic examinations → target mission/crew.
 *
 *   bun scripts/p72-examination-copy.ts dry-run  --rows <source.json> --existing <target-ids.json> --out <dir>
 *   bun scripts/p72-examination-copy.ts seal     --rows ... --existing ... --out <dir> --actor <uuid> --approval <ref>
 *   bun scripts/p72-examination-copy.ts withdraw --existing <target-ids.json> --rows ... --out <dir> --actor <uuid> --approval <ref>
 *
 * Inputs are read-only exports of observation_sync_events (source scope rows; target scope event IDs).
 * Needs MITO_OBSERVATION_SYNC_KEY_V<n> in the environment (never printed). dry-run writes no SQL.
 * seal writes single-statement, idempotent SQL batches (ON CONFLICT DO NOTHING + one audit row per batch);
 * withdraw writes the append-only rollback (status "erroneous" events for copies). Nothing is executed here.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveScopeKeys, openEvent, readMasterKeys, sealEvent } from "../src/lib/observation-sync.server";
import {
  buildP72CopyPlan,
  p72PlanDigest,
  P72_COPY_VERSION,
  P72_SOURCE_SCOPE,
  P72_TARGET_SCOPE,
} from "../src/domain/examination-copy/p72-copy-plan";
import type { ObservationSyncEvent } from "../src/domain/health-intelligence/observation-sync";

const [mode, ...rest] = process.argv.slice(2);
const arg = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const need = (name: string) => {
  const v = arg(name);
  if (!v) throw new Error(`--${name} is required`);
  return v;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;

interface Row { event_id: string; observation_id: string; event_kind: string; mission_id: string; crew_member_id: string; provenance: string; key_version: number; iv: string; ciphertext: string; fingerprint: string }

async function main() {
  if (!mode || !["dry-run", "seal", "withdraw"].includes(mode)) throw new Error("mode must be dry-run, seal or withdraw");
  const out = need("out");
  mkdirSync(out, { recursive: true });
  const keys = readMasterKeys((n) => process.env[n]);
  if (!keys.size) throw new Error("observation sync key material is not configured");
  const rows = JSON.parse(readFileSync(need("rows"), "utf8")) as Row[];
  const existing = new Set<string>(JSON.parse(readFileSync(need("existing"), "utf8")) as string[]);
  const sourceKeys = new Map<number, Awaited<ReturnType<typeof deriveScopeKeys>>>();
  const sources = [];
  for (const r of rows) {
    if (r.mission_id !== P72_SOURCE_SCOPE.missionId || r.crew_member_id !== P72_SOURCE_SCOPE.crewMemberId || r.provenance !== "synthetic")
      throw new Error(`row ${r.event_id} is outside the source scope`);
    const master = keys.get(r.key_version);
    if (!master) throw new Error(`missing key version ${r.key_version}`);
    if (!sourceKeys.has(r.key_version)) sourceKeys.set(r.key_version, await deriveScopeKeys(master, r.key_version, P72_SOURCE_SCOPE));
    sources.push({ event: await openEvent(sourceKeys.get(r.key_version)!, P72_SOURCE_SCOPE, r), sourceFingerprint: r.fingerprint });
  }
  const plan = await buildP72CopyPlan(sources, existing);
  const digest = await p72PlanDigest(plan);
  writeFileSync(join(out, "p72-copy-manifest.json"), JSON.stringify({ digest, ...plan, entries: plan.entries.map(({ copy: _c, ...e }) => e) }, null, 1));
  console.log(JSON.stringify({ mode, digest, counts: plan.counts }));
  if (mode === "dry-run") return;

  const actor = need("actor");
  const approval = need("approval");
  if (!UUID.test(actor)) throw new Error("--actor must be the approving account UUID");
  if (!/^[A-Za-z0-9:._-]{8,160}$/.test(approval)) throw new Error("--approval must be a plain reference");
  const version = Math.max(...keys.keys());
  const targetKeys = await deriveScopeKeys(keys.get(version)!, version, P72_TARGET_SCOPE);

  let events: { event: ObservationSyncEvent; pair: [string, string] }[];
  if (mode === "seal") {
    events = plan.entries.filter((e) => e.decision === "copy" && e.copy).map((e) => ({ event: e.copy!, pair: [e.sourceObservationId, e.copyObservationId] }));
  } else {
    const copied = plan.entries.filter((e) => e.decision === "already_copied");
    const withdrawn = new Set([...existing].filter((id) => id.endsWith(":status")));
    events = [];
    for (const e of copied) {
      if (withdrawn.has(`${e.copyObservationId}:status`)) continue;
      const src = sources.find((s) => s.event.observation.id === e.sourceObservationId)!;
      const fresh = await buildP72CopyPlan([src], new Set());
      const base = fresh.entries[0]?.copy?.observation;
      if (!base) continue;
      events.push({
        event: { eventId: `${e.copyObservationId}:status`, eventKind: "status", observation: { ...base, status: "erroneous", statusReason: `P72 synthetic copy withdrawn (${approval}).` } },
        pair: [e.sourceObservationId, e.copyObservationId],
      });
    }
  }
  const BATCH = 20;
  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH);
    const values = [];
    for (const { event } of batch) {
      const s = await sealEvent(targetKeys, P72_TARGET_SCOPE, event);
      values.push(`(${[P72_TARGET_SCOPE.missionId, P72_TARGET_SCOPE.crewMemberId, "synthetic", s.eventId, s.observationId, s.eventKind, s.cipherAlg].map(q).join(",")},${s.keyVersion},${q(s.iv)},${q(s.ciphertext)},${q(s.fingerprint)},${q(actor)}::uuid)`);
    }
    const meta = JSON.stringify({ copyVersion: P72_COPY_VERSION, mode, approval, planDigest: digest, sourceMissionId: P72_SOURCE_SCOPE.missionId, sourceCrewMemberId: P72_SOURCE_SCOPE.crewMemberId, batch: i / BATCH + 1, pairs: batch.map((b) => b.pair) });
    const sql = `with ins as (
  insert into public.observation_sync_events(mission_id, crew_member_id, provenance, event_id, observation_id, event_kind, cipher_alg, key_version, iv, ciphertext, fingerprint, uploaded_by)
  values
  ${values.join(",\n  ")}
  on conflict (mission_id, crew_member_id, provenance, event_id) do nothing
  returning event_id
)
insert into public.audit_events(mission_id, actor_user_id, action, target_type, target_id, metadata)
select ${q(P72_TARGET_SCOPE.missionId)}, ${q(actor)}::uuid, ${q(mode === "seal" ? "p72_synthetic_examination_copy" : "p72_synthetic_examination_copy_withdrawn")}, 'observation_sync', ${q(P72_TARGET_SCOPE.crewMemberId)},
  ${q(meta)}::jsonb || jsonb_build_object('inserted', count(*))
from ins having count(*) > 0;
`;
    writeFileSync(join(out, `p72-${mode}-batch-${String(i / BATCH + 1).padStart(2, "0")}.sql`), sql);
  }
  console.log(JSON.stringify({ mode, batches: Math.ceil(events.length / BATCH), events: events.length }));
}

await main();
