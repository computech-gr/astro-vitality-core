import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const ledger = JSON.parse(readFileSync("data/scientific/p40-independent-review-ledger.v1.json", "utf8"));
const mapping = JSON.parse(readFileSync("data/scientific/p39-semantic-review-candidates.v1.json", "utf8"));
const text = readFileSync("data/scientific/p41-independent-review-workbook.v1.csv", "utf8").trimEnd();
const lines = text.split("\n");
const columns = lines.shift().split(",");
const parseCsv = (line) => {
  const cells = []; let current = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (quoted && line[i + 1] === '"') { current += '"'; i++; } else quoted = !quoted; }
    else if (ch === "," && !quoted) { cells.push(current); current = ""; }
    else current += ch;
  }
  assert.equal(quoted, false, "unterminated quoted CSV cell");
  cells.push(current); return cells;
};
const rows = lines.map((line) => {
  const cells = parseCsv(line);
  assert.equal(cells.length, columns.length);
  return Object.fromEntries(columns.map((column, i) => [column, cells[i]]));
});
assert.equal(rows.length, 216);
assert.equal(new Set(rows.map((r) => r.source_id)).size, 216);
const original = new Map(ledger.rows.map((r) => [r.source_id, r]));
const mapped = new Map(mapping.mapping_rows.map((r) => [r.source_id, r]));
assert.equal(mapped.size, 54);
for (const row of rows) {
  const source = original.get(row.source_id);
  assert.ok(source, `unknown source: ${row.source_id}`);
  for (const key of ["domain", "source_name", "source_unit", "candidate_catalog_id", "candidate_relation", "unit_review", "review_decision"]) {
    assert.equal(row[key], source[key] ?? "", `${row.source_id}: ${key}`);
  }
  assert.equal(row.candidate_catalog_name, mapped.get(row.source_id)?.existing_name ?? "");
  assert.equal(row.review_decision, "PENDING_INDEPENDENT_SCIENTIFIC_REVIEW");
  assert.equal(row.clinical_activation, "false");
  for (const key of ["reviewer", "reviewed_at_utc", "evidence_reference", "rationale"]) assert.equal(row[key], "");
  for (const key of ["protocol_specimen_method_checked", "unit_comparability_checked", "baseline_and_context_checked", "privacy_and_consent_checked"]) assert.equal(row[key], "NOT_REVIEWED");
}
assert.equal(rows.filter((r) => r.candidate_catalog_id !== "").length, 54);
console.log("P41 PASS: 216 review rows, 54 candidates, 162 unmapped, 0 approvals, 0 activations");
