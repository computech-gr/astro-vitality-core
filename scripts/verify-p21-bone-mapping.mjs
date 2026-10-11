import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const catalog=read('data/scientific/bone-health-handbook-v7.catalog.json');
const mapping=read('data/scientific/bone-health-mapping.v1.json');
const registry=fs.readFileSync('src/domain/catalog/reviewed-mvp-v1.1.ts','utf8');
assert.equal(catalog.operationalActivation,false);
assert.equal(mapping.operationalActivation,false);
assert.equal(mapping.mappings.length,63);
assert.deepEqual(new Set(mapping.mappings.map(x=>x.handbookId)),new Set(catalog.variables.map(x=>x.id)));
const counts={};
for(const m of mapping.mappings){
 assert.equal(m.operationalActivation,false);
 assert.equal(m.reviewStatus,'pending_independent_review');
 assert.ok(['candidate_exact','related_not_equivalent','unmapped'].includes(m.mappingStatus));
 if(m.mappingStatus==='unmapped') assert.equal(m.canonicalMetricCode,null);
 else assert.ok(registry.includes(`"code":"${m.canonicalMetricCode}"`),`Unknown canonical code: ${m.canonicalMetricCode}`);
 counts[m.mappingStatus]=(counts[m.mappingStatus]??0)+1;
}
assert.deepEqual(counts,{candidate_exact:6,unmapped:52,related_not_equivalent:5});
console.log('P21.2 PASS — 63 mappings, 6 candidates, 5 related-not-equivalent, 52 unmapped; no activation');
