import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=(p)=>JSON.parse(fs.readFileSync(p,'utf8'));
const p=read('data/scientific/bone-health-independent-review-handoff.v1.json');
const ledger=read('data/scientific/bone-health-review-ledger.v1.json');
const decisions=read('data/scientific/bone-health-relationship-decision-matrix.v1.json');
const studies=read('data/scientific/bone-health-primary-study-extraction.v1.json');
assert.equal(p.scientificReviewComplete,false);assert.equal(p.operationalActivation,false);
assert.equal(p.metricReviewTasks.length,63);assert.equal(p.relationshipReviewTasks.length,16);assert.equal(p.studyAccessQueue.length,6);
assert.deepEqual(new Set(p.metricReviewTasks.map(x=>x.handbookId)),new Set(ledger.entries.map(x=>x.handbookId)));
assert.deepEqual(new Set(p.relationshipReviewTasks.map(x=>x.relationshipId)),new Set(decisions.relationshipDecisions.map(x=>x.relationshipId)));
assert.deepEqual(new Set(p.studyAccessQueue.map(x=>x.studyId)),new Set(studies.studies.map(x=>x.studyId)));
for(const t of p.metricReviewTasks){assert.equal(t.reviewState,'unassigned');assert.equal(t.reviewerDecision,null);assert.equal(t.reviewerName,null);assert.deepEqual(t.evidenceLinks,[]);}
for(const t of p.relationshipReviewTasks){assert.equal(t.reviewState,'unassigned');assert.equal(t.reviewerDecision,null);assert.equal(t.educationalApproval,false);assert.equal(t.clinicalRuleAllowed,false);assert.deepEqual(t.evidenceLinks,[]);}
console.log('P21.14 PASS: 63 metric tasks, 16 relationship tasks, 6 study handoffs, 0 approvals, 0 activation');
