import fs from 'node:fs';
import assert from 'node:assert/strict';
const catalog = JSON.parse(fs.readFileSync('data/scientific/bone-health-handbook-v7.catalog.json','utf8'));
const intake = JSON.parse(fs.readFileSync('data/scientific/knowledge-intake.v1.json','utf8'));
assert.equal(catalog.variables.length,63);
assert.equal(new Set(catalog.variables.map(x=>x.id)).size,63);
assert.equal(new Set(catalog.variables.map(x=>x.name)).size,63);
assert.equal(new Set(catalog.variables.map(x=>x.category)).size,6);
assert.equal(catalog.operationalActivation,false);
assert.equal(intake.operationalActivation,false);
for(const v of catalog.variables){
 assert.ok(v.name && v.measurementDescription && v.biologicalInterpretation && v.implementationNotes);
 assert.ok(['A','B','C'].includes(v.handbookEvidenceTier));
 assert.equal(v.reviewStatus,'pending_independent_review');
 assert.equal(v.operationalStatus,'reference_only');
}
assert.ok(intake.sources?.some(x=>x.id==='bone-handbook-v7' && x.variableCount===63 && x.sha256===catalog.source.sha256));
console.log('P21.1 bone handbook catalog: 63 variables, 6 groups, no operational activation — PASS');
