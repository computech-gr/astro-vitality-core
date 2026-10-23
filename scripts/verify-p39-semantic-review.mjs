import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const mapping = read('data/scientific/p39-semantic-review-candidates.v1.json');
const immune = read('data/scientific/nikolas-immune-intake.v1.json');
const behavioral = read('data/scientific/nikolas-behavioral-intake.v1.json');
const catalog = read('data/scientific/p355-proposed-domain-catalog.v1.json');
const sources = new Map([...immune.entries, ...behavioral.entries].map((e) => [e.source_id, e]));
const targets = new Map(catalog.entries.map((e) => [e.id, e]));
assert.equal(sources.size, 216);
assert.equal(mapping.source_count, sources.size);
assert.equal(mapping.catalog_count, targets.size);
assert.equal(mapping.mapping_count, mapping.mapping_rows.length);
assert.equal(mapping.remaining_without_curated_mapping, sources.size - new Set(mapping.mapping_rows.map((r) => r.source_id)).size);
assert.equal(mapping.clinical_activation, false);
assert.equal(mapping.approval, 'NOT_APPROVED_FOR_OPERATIONAL_USE');
const seen = new Set();
for (const row of mapping.mapping_rows) {
  assert(sources.has(row.source_id), `Unknown source ${row.source_id}`);
  assert(targets.has(row.existing_id), `Unknown catalog ID ${row.existing_id}`);
  assert.equal(row.source_name, sources.get(row.source_id).name);
  assert.equal(row.existing_name, targets.get(row.existing_id).name);
  assert.equal(row.source_unit, sources.get(row.source_id).unit);
  assert.equal(row.scientific_approval, 'NOT_APPROVED_FOR_OPERATIONAL_USE');
  assert.equal(row.operational_activation, false);
  assert.equal(row.disposition, 'PROPOSED_FOR_HUMAN_REVIEW');
  assert.equal(row.unit_status, 'REVIEW_REQUIRED_EXISTING_CATALOG_HAS_NO_UNITS');
  assert(['alias', 'component', 'related_assay'].includes(row.relation_candidate));
  const key = `${row.source_id}:${row.existing_id}`;
  assert(!seen.has(key), `Duplicate mapping ${key}`);
  seen.add(key);
}
console.log(`P39 PASS: ${mapping.mapping_count} curated review links, ${mapping.remaining_without_curated_mapping} source records without curated mapping, zero approvals`);
