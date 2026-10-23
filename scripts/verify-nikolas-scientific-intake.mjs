import fs from 'node:fs';
import assert from 'node:assert/strict';
const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const imm = load('data/scientific/nikolas-immune-intake.v1.json');
const bhp = load('data/scientific/nikolas-behavioral-intake.v1.json');
const cross = load('data/scientific/nikolas-cross-domain-context.v1.json');
assert.equal(bhp.entries.length,99);
assert.ok(imm.entries.length>=100);
for (const x of [...imm.entries,...bhp.entries]) {
 assert.equal(x.clinical_activation,false);
 assert.equal(x.review_required,true);
 assert.equal(x.approval,'NOT_APPROVED_FOR_OPERATIONAL_USE');
 assert.ok(x.source_id && x.name && x.source);
}
assert.equal(cross.status,'RESEARCH_ONLY');
assert.ok(cross.relationships.every(x=>x.interpretation));
console.log(`Nikolas intake verified: ${imm.entries.length} immune records, ${bhp.entries.length} behavioral records; all review-only.`);
