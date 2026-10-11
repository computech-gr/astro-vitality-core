import fs from 'node:fs';
import assert from 'node:assert/strict';
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const d = load('data/scientific/bone-health-literature-screening.v1.json');
const g = load('data/scientific/bone-health-interpretation-graph.v1.json');
const p = load('data/scientific/bone-health-evidence-retrieval-plan.v1.json');
const a = load('data/scientific/bone-health-evidence-appraisal.v1.json');
assert.equal(d.operationalActivation,false);
assert.equal(d.independentReviewComplete,false);
assert.equal(d.sourceRegistry.length,4);
assert.equal(d.relationships.length,16);
const ids = new Set(d.sourceRegistry.map(x=>x.sourceId));
assert.equal(ids.size,4);
for (const s of d.sourceRegistry) {
 assert.match(s.url,/^https:\/\//);
 assert.equal(s.fullTextCriticalAppraisalComplete,false);
 assert.equal(s.primaryStudyExtractionComplete,false);
 assert.equal(s.independentReviewer,null);
}
const graphIds=new Set(g.relationships.map(x=>x.id));
const planIds=new Set(p.relationships.map(x=>x.relationshipId));
const appraisalIds=new Set(a.relationships.map(x=>x.relationshipId));
assert.equal(new Set(d.relationships.map(x=>x.relationshipId)).size,16);
for (const r of d.relationships) {
 assert.ok(graphIds.has(r.relationshipId) && planIds.has(r.relationshipId) && appraisalIds.has(r.relationshipId));
 assert.ok(r.candidateSourceIds.every(id=>ids.has(id)));
 assert.equal(r.sourceSupportForExactClaim,'not_assessed');
 assert.equal(r.primaryStudyDataExtracted,false);
 assert.equal(r.conflictingEvidenceAssessed,false);
 assert.equal(r.populationTransferabilityAssessed,false);
 assert.equal(r.assayAndUnitCompatibilityAssessed,false);
 assert.equal(r.reviewDecision,'defer');
 assert.equal(r.approvedForDisplay,false);
 assert.equal(r.approvedForOperationalUse,false);
 assert.equal(r.clinicalRuleAllowed,false);
 assert.equal(r.independentReviewer,null);
}
console.log('P21.8 PASS: 4 NASA sources screened, 16 relationships linked, 0 independent approvals, 0 activation');
