#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const r=read('data/scientific/p38-nikolas-reconciliation.v1.json');
const imm=read('data/scientific/nikolas-immune-intake.v1.json').entries;
const beh=read('data/scientific/nikolas-behavioral-intake.v1.json').entries;
const catalog=read('data/scientific/p355-proposed-domain-catalog.v1.json').entries;
const normalize=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
assert.equal(r.rows.length,imm.length+beh.length);
assert.equal(new Set(r.rows.map(x=>x.source_id)).size,r.rows.length);
for (const row of r.rows){
 const source=[...imm,...beh].find(x=>x.source_id===row.source_id);
 assert(source); assert.equal(row.source_name,source.name);assert.equal(row.source_unit,source.unit??null);
 assert.equal(row.operational_activation,false);
 assert.equal(row.scientific_approval,'NOT_APPROVED_FOR_OPERATIONAL_USE');
 assert.equal(row.unit_check,'NOT_POSSIBLE_P355_NO_UNITS');
 const expected=catalog.filter(x=>x.domain===row.domain&&normalize(x.name)===normalize(row.source_name)).map(x=>x.id);
 assert.deepEqual(row.exact_normalized_name_matches,expected);
 assert.equal(row.disposition,expected.length?'EXACT_NAME_REVIEW_REQUIRED':'UNRESOLVED_MANUAL_REVIEW');
}
assert.equal(r.counts.source_total,r.rows.length);
assert.equal(r.counts.exact_normalized_name_matches,r.rows.filter(x=>x.exact_normalized_name_matches.length).length);
assert.equal(r.counts.unresolved,r.rows.filter(x=>!x.exact_normalized_name_matches.length).length);
console.log(`P38 PASS: ${r.rows.length} candidates, ${r.counts.exact_normalized_name_matches} exact-name review candidates, ${r.counts.unresolved} unresolved; 0 operational approvals`);
