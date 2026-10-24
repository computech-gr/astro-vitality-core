import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = (path) => readFileSync(path, 'utf8');
const route = read('src/routes/api.medical-ai-draft.ts');
const rpc = read('src/lib/medical-governance.functions.ts');
const sqlPath = 'supabase/pending/20261024000000_medical_governance_v3.sql';
assert(existsSync(sqlPath), 'Staged migration must remain pending');
const sql = read(sqlPath);
const gates = [
  ['real-data transfer denied', route.includes('if (provenance === "real")')],
  ['server authorization required', route.includes('ground_medical') && route.includes('membershipError')],
  ['server evidence resolver required', route.includes('medical_v3_ai_evidence')],
  ['server evidence equality required', route.includes('JSON.stringify(verified) !== JSON.stringify(snapshot.evidence)') && route.includes('evidence.length !== snapshot.evidence.length') && route.includes('row[key as keyof typeof row] !== trusted[key as keyof typeof trusted]') && route.includes('evidence: snapshot.evidence')],
  ['atomic quota reservation required', route.includes('medical_v3_reserve_ai')],
  ['quota rejection 429', route.includes('status: 429')],
  ['quota released in finally', route.includes('finally') && route.includes('medical_v3_release_ai')],
  ['provider nonretention request', route.includes('store: false')],
  ['persistent review behind feature gate', rpc.includes('MITO_MEDICAL_GOVERNANCE_V3_ENABLED')],
  ['pending migration has authoritative evidence resolver', sql.includes('medical_v3_authoritative_evidence')],
  ['pending migration contains synthetic-only scope', sql.includes('synthetic')],
];
for (const [name, ok] of gates) {
  assert(ok, `FAIL: ${name}`);
  process.stdout.write(`PASS: ${name}\n`);
}
console.log('Static release guards passed. NOT proof of runtime safety, deployment, clinical validity, or migration approval.');
