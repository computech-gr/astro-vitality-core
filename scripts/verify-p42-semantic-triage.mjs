import fs from 'node:fs';
import assert from 'node:assert/strict';
const p39=JSON.parse(fs.readFileSync('data/scientific/p39-semantic-review-candidates.v1.json','utf8'));
const p42=JSON.parse(fs.readFileSync('data/scientific/p42-semantic-triage.v1.json','utf8'));
assert.equal(p42.rows.length,54);
assert.equal(p42.rows.length,p39.mapping_rows.length);
assert.equal(new Set(p42.rows.map(x=>x.source_id)).size,54);
for(let i=0;i<p42.rows.length;i++){
 const a=p42.rows[i],b=p39.mapping_rows[i];
 assert.equal(a.source_id,b.source_id);
 assert.equal(a.candidate_catalog_id,b.existing_id);
 assert.equal(a.p39_relation_candidate,b.relation_candidate);
 assert.equal(a.scientific_decision,'PENDING_INDEPENDENT_SCIENTIFIC_REVIEW');
 assert.equal(a.operational_activation,false);
 assert.ok(a.review_questions.length>=3);
}
console.log('P42 PASS: 54 review candidates, 0 approvals, 0 activations');
