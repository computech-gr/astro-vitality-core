import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const x=read('data/scientific/bone-health-primary-study-extraction.v1.json');
const graph=read('data/scientific/bone-health-literature-screening.v1.json');
const ids=new Set(graph.relationships.map(r=>r.relationshipId));
assert.equal(x.operationalActivation,false);assert.equal(x.independentReviewComplete,false);
assert.equal(x.studies.length,6);assert.equal(x.relationshipCoverage.length,16);
assert.equal(new Set(x.studies.map(s=>s.studyId)).size,6);
for(const s of x.studies){assert.match(s.sourceUrl,/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/);assert.equal(s.fullTextVerified,false);assert.equal(s.independentReviewer,null);assert.equal(s.approvedForClinicalUse,false);assert.equal(s.quantitativeEffectSize,null);assert.equal(s.confidenceInterval,null);for(const id of s.linkedRelationshipIds)assert(ids.has(id));}
for(const r of x.relationshipCoverage){assert(ids.has(r.relationshipId));assert.equal(r.claimSupportVerified,false);assert.equal(r.independentReviewStatus,'pending_independent_review');for(const id of r.linkedStudyIds)assert(x.studies.some(s=>s.studyId===id));}
console.log('P21.9 PASS: 6 identified publications, 16 review slots, no clinical approval');
