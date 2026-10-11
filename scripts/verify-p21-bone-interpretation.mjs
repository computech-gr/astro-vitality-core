import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const graph = read('data/scientific/bone-health-interpretation-graph.v1.json');
const catalog = read(graph.sourceCatalog);
const ledger = read(graph.sourceReviewLedger);
const ids = new Set(catalog.variables.map(v => v.id));
const reviewed = new Map(ledger.entries.map(e => [e.handbookId, e]));
assert.equal(ids.size, 63);
assert.equal(reviewed.size, 63);
assert.equal(graph.operationalActivation, false);
assert.equal(graph.relationshipEvidenceStatus, 'pending_independent_review');
assert.ok(graph.relationships.length >= 12);
const edgeIds = new Set();
for (const edge of graph.relationships) {
  assert.ok(!edgeIds.has(edge.id), `Duplicate edge: ${edge.id}`);
  edgeIds.add(edge.id);
  for (const id of [edge.fromHandbookId, edge.toHandbookId]) {
    assert.ok(ids.has(id), `Unknown handbook ID: ${id}`);
    assert.equal(reviewed.get(id)?.reviewStatus, 'pending_independent_review');
    assert.equal(reviewed.get(id)?.operationalActivation, false);
  }
  assert.notEqual(edge.fromHandbookId, edge.toHandbookId);
  assert.ok(edge.explanation.length >= 35);
  assert.equal(edge.evidenceStatus, 'pending_independent_review');
  assert.equal(edge.operationalActivation, false);
  assert.equal(edge.causalInferenceAllowed, false);
  assert.equal(edge.clinicalRuleAllowed, false);
}
for (const [key, value] of Object.entries(graph.displayRules)) assert.equal(value, true, `Safety flag ${key} must be true`);
console.log(`P21.5 PASS: ${graph.relationships.length} reference-only relationships, 63 pending reviews, zero clinical activation`);
