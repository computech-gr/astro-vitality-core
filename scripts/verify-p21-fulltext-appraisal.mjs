import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const ledger = read('data/scientific/bone-health-fulltext-appraisal.v1.json');
const upstream = read('data/scientific/bone-health-primary-study-extraction.v1.json');
const graph = read('data/scientific/bone-health-interpretation-graph.v1.json');
assert.equal(ledger.schemaVersion,'1.0');
assert.equal(ledger.operationalActivation,false);
assert.equal(ledger.fullTextVerifiedCount,0);
assert.equal(ledger.independentApprovals,0);
assert.equal(ledger.studies.length,upstream.studies.length);
assert.equal(ledger.relationshipCoverage.length,graph.relationships.length);
const byId = new Map(upstream.studies.map(s => [s.studyId,s]));
assert.equal(byId.size,upstream.studies.length);
const seen = new Set();
const validRelationships = new Set(graph.relationships.map(r=>r.id));
for (const s of ledger.studies) {
 assert.ok(byId.has(s.studyId)); assert.ok(!seen.has(s.studyId)); seen.add(s.studyId);
 const original=byId.get(s.studyId);
 assert.equal(s.pmid,original.pmid);
 assert.equal(s.sourceUrl,original.sourceUrl);
 assert.deepEqual([...s.linkedRelationshipIds].sort(),[...original.linkedRelationshipIds].sort());
 assert.ok(s.linkedRelationshipIds.every(id=>validRelationships.has(id)));
 assert.equal(s.fullTextAccess.status,'not_verified');
 assert.equal(s.fullTextAccess.verifiedUrl,null);
 assert.equal(s.extraction.fullTextChecked,false);
 assert.equal(s.extraction.methodsVerified,false);
 assert.equal(s.extraction.assaysSpecimensUnitsVerified,false);
 assert.equal(s.extraction.effectEstimate,null);
 assert.equal(s.extraction.uncertaintyInterval,null);
 assert.equal(s.extraction.exactLocator,null);
 assert.equal(s.review.decision,'pending_independent_review');
 assert.equal(s.review.claimSupportVerified,false);
 assert.equal(s.review.independentReviewer,null);
 assert.equal(s.operationalActivation,false);
}
const seenRelations = new Set();
for (const c of ledger.relationshipCoverage) {
 assert.ok(validRelationships.has(c.relationshipId)); assert.ok(!seenRelations.has(c.relationshipId));seenRelations.add(c.relationshipId);
 assert.deepEqual([...c.candidateStudyIds].sort(),upstream.studies.filter(s=>s.linkedRelationshipIds.includes(c.relationshipId)).map(s=>s.studyId).sort());
 assert.equal(c.fullTextSupported,false);
 assert.equal(c.independentReviewStatus,'pending_independent_review');
}
console.log(`P21.10 PASS: ${ledger.studies.length} full-text appraisal slots, ${ledger.relationshipCoverage.length} relationships; 0 verified full texts, 0 approvals, 0 activation`);
