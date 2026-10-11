import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const load = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const appraisal = load('data/scientific/bone-health-evidence-appraisal.v1.json');
const graph = load(appraisal.sourceGraph);
const catalog = load(appraisal.sourceCatalog);
const ledger = load(appraisal.sourceReviewLedger);
const variables = new Set(catalog.variables.map(v => v.id));
const reviews = new Map(ledger.entries.map(v => [v.handbookId, v]));
const edges = new Map(graph.relationships.map(v => [v.id, v]));
assert.equal(appraisal.operationalActivation, false);
assert.equal(appraisal.independentReviewComplete, false);
assert.equal(graph.operationalActivation, false);
assert.equal(edges.size, graph.relationships.length);
assert.equal(appraisal.relationships.length, edges.size);
assert.equal(edges.size, 16);
const seen = new Set();
for (const record of appraisal.relationships) {
 assert.ok(!seen.has(record.relationshipId), `Duplicate appraisal: ${record.relationshipId}`);
 seen.add(record.relationshipId);
 const edge = edges.get(record.relationshipId);
 assert.ok(edge, `Unknown relationship: ${record.relationshipId}`);
 assert.equal(record.fromHandbookId, edge.fromHandbookId);
 assert.equal(record.toHandbookId, edge.toHandbookId);
 assert.ok(variables.has(record.fromHandbookId) && variables.has(record.toHandbookId));
 assert.equal(record.sourceDocumentSha256, catalog.source.sha256);
 assert.equal(record.claimUnderReview, edge.explanation);
 assert.equal(record.claimScope, 'biological_context_only');
 assert.equal(record.reviewStatus, 'pending_independent_review');
 assert.equal(record.reviewDecision, 'defer');
 assert.equal(record.evidenceRetrievalStatus, 'not_started');
 assert.deepEqual(record.primaryEvidence, []);
 for (const k of ['studyPopulationReview','flightVsAnalogEvidenceReview','measurementCompatibilityReview','confounderAssessment','temporalityAndCausalityReview','limitationsReview']) assert.equal(record[k], 'pending');
 assert.equal(record.independentReviewer, null);
 assert.equal(record.reviewDate, null);
 for (const k of ['approvalForEducationalDisplay','approvalForOperationalUse','clinicalRuleAllowed','causalInferenceAllowed']) assert.equal(record[k], false);
 for (const id of [record.fromHandbookId,record.toHandbookId]) {
  assert.equal(reviews.get(id)?.reviewStatus, 'pending_independent_review');
  assert.equal(reviews.get(id)?.operationalActivation, false);
 }
}
for (const id of edges.keys()) assert.ok(seen.has(id), `Missing appraisal: ${id}`);
console.log(`P21.6 PASS: ${seen.size} evidence appraisal records, no approvals, no clinical activation`);
