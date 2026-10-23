import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
const source = JSON.parse(read("data/scientific/p43-semantic-decision-proposals.v1.json"));
assert.equal(source.rows.length, 54);
assert.equal(new Set(source.rows.map((r) => r.source_id)).size, 54);
for (const row of source.rows) {
  assert.equal(row.independent_decision, "PENDING_INDEPENDENT_SCIENTIFIC_REVIEW");
  assert.equal(row.catalog_merge_authorized, false);
  assert.equal(row.operational_activation, false);
}
const ui = read("src/components/scientific-research-candidates.tsx");
const page = read("src/components/health-intelligence.tsx");
assert.match(ui, /p43-semantic-decision-proposals\.v1\.json/);
assert.match(ui, /Independent review pending/);
assert.match(ui, /162 P37 records/);
assert.match(page, /<ScientificResearchCandidates \/>/);
assert.doesNotMatch(ui, /supabase|fetch\(|\.insert\(|\.update\(/i);
console.log("P44 PASS: 54 research-only proposals rendered read-only; zero approvals/activations");
