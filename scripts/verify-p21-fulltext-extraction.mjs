import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const data = load('data/scientific/bone-health-fulltext-extraction.v1.json');
const upstream = load('data/scientific/bone-health-fulltext-appraisal.v1.json');
const graph = load('data/scientific/bone-health-interpretation-graph.v1.json');
const ids = new Set(upstream.studies.map(s => s.studyId));
const relations = new Set(graph.relationships.map(r => r.id));
assert.equal(data.studies.length,6);
assert.equal(data.independentApprovals,0);
assert.equal(data.operationalActivation,false);
assert.equal(data.fullTextsInspected,1);
assert.equal(data.fullTextLinksLocatedNotExtracted,1);
assert.equal(data.remainingNotVerified,4);
let inspected=0, linkOnly=0, missing=0;
for (const s of data.studies) {
 assert(ids.has(s.studyId));
 assert(s.relationshipIds.every(id => relations.has(id)));
 assert.equal(s.independentReviewStatus,'pending_independent_review');
 assert.equal(s.independentReviewer,null);
 assert.equal(s.approvedForClinicalUse,false);
 assert.equal(s.operationalActivation,false);
 assert(s.extractions.every(x => x.sourceLocator && x.limitations && x.measurementContext));
 if(s.fullTextAccessStatus==='public_full_text_inspected') { inspected++; assert(s.fullTextUrl?.startsWith('https://pmc.ncbi.nlm.nih.gov/')); assert(s.extractions.length>=3); }
 else { assert.equal(s.extractions.length,0); if(s.fullTextAccessStatus==='full_text_link_located_not_extracted')linkOnly++; else missing++; }
}
assert.equal(inspected,1);assert.equal(linkOnly,1);assert.equal(missing,4);
console.log('P21.11 PASS — 1 inspected full text, 1 located link, 4 unverified; 0 approvals, 0 activation');
