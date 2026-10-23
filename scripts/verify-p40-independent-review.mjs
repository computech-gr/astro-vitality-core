import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const load = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));
const ledger = load("data/scientific/p40-independent-review-ledger.v1.json");
const p38 = load("data/scientific/p38-nikolas-reconciliation.v1.json");
const p39 = load("data/scientific/p39-semantic-review-candidates.v1.json");
assert.equal(ledger.rows.length, 216);
assert.equal(p38.rows.length, 216);
assert.equal(p39.mapping_rows.length, 54);
const ids = new Set();
const candidates = new Map(p39.mapping_rows.map((r) => [r.source_id, r]));
for (let i = 0; i < ledger.rows.length; i++) {
  const r = ledger.rows[i];
  assert.equal(r.source_id, p38.rows[i].source_id);
  assert(!ids.has(r.source_id));
  ids.add(r.source_id);
  assert.equal(r.review_decision, "PENDING_INDEPENDENT_SCIENTIFIC_REVIEW");
  assert.equal(r.clinical_activation, false);
  assert.equal(r.reviewer, null);
  assert.equal(r.evidence_reference, null);
  assert.equal(r.candidate_catalog_id, candidates.get(r.source_id)?.existing_id ?? null);
}
assert.equal(ledger.rows.filter((r) => r.candidate_catalog_id !== null).length, 54);
console.log("P40 PASS: 216 pending review decisions, 54 candidates, zero approvals/activations");
