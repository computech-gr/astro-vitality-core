import fs from "node:fs";
import assert from "node:assert/strict";
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const p39=read("data/scientific/p39-semantic-review-candidates.v1.json");
const p42=read("data/scientific/p42-semantic-triage.v1.json");
const p43=read("data/scientific/p43-semantic-decision-proposals.v1.json");
assert.equal(p43.rows.length,54);
assert.equal(p43.candidate_count,54);
assert.equal(new Set(p43.rows.map(r=>r.source_id)).size,54);
const a=new Map(p39.mapping_rows.map(r=>[r.source_id,r]));
const b=new Map(p42.rows.map(r=>[r.source_id,r]));
for (const r of p43.rows) {
  assert(a.has(r.source_id) && b.has(r.source_id));
  assert.equal(r.candidate_catalog_id,a.get(r.source_id).existing_id);
  assert.equal(r.p42_triage_bucket,b.get(r.source_id).triage_bucket);
  assert.equal(r.independent_decision,"PENDING_INDEPENDENT_SCIENTIFIC_REVIEW");
  assert.equal(r.reviewer,null);
  assert.equal(r.catalog_merge_authorized,false);
  assert.equal(r.operational_activation,false);
  assert(r.required_checks.length>=5);
}
console.log("P43 PASS: 54 reasoned semantic proposals, 0 independent approvals, 0 merges, 0 activations");
