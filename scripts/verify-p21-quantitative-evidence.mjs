import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url),'utf8'));
const q=read('data/scientific/bone-health-quantitative-evidence.v1.json');
const upstream=read(q.upstream);
const inspected=upstream.studies.filter(s=>s.fullTextAccessStatus==='public_full_text_inspected');
const expected=inspected.flatMap(s=>s.extractions.map(c=>({s,c})));
assert.equal(q.stage,'P21.12');
assert.equal(q.records.length,expected.length);
assert.equal(q.quantitativeClaimsApproved,0);
assert.equal(q.independentApprovals,0);
assert.equal(q.operationalActivation,false);
const ids=new Set();
for(const r of q.records){
  assert(!ids.has(r.claimId)); ids.add(r.claimId);
  const match=expected.find(({s,c})=>s.studyId===r.studyId && c.claimId===r.claimId);
  assert(match,`Unknown claim ${r.claimId}`);
  assert.equal(r.sourceLocator,match.c.sourceLocator);
  assert.equal(r.findingAsRecorded,match.c.finding);
  assert.equal(r.quantitativeExtractionStatus,'not_extracted');
  for(const k of ['effectEstimate','effectUnit','uncertainty','sampleDenominator','comparator','timepoint','assaySpecimen','sourceTableCell','transcriptionVerifiedBy']) assert.equal(r[k],null,`${r.claimId}: ${k} must not be invented`);
  assert.equal(r.requiresIndependentReview,true);
  assert.equal(r.operationalActivation,false);
}
assert.deepEqual(Object.keys(q.translationToAstronautGuidance).sort(),['act','evaluate','followUp','gather','readiness'].sort());
assert.equal(q.translationToAstronautGuidance.readiness,'design_specification_only_not_implemented');
console.log(`P21.12 PASS: ${q.records.length} qualitative claims traced; 0 invented quantitative estimates, 0 approvals, 0 activation`);
