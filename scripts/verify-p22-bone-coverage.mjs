import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
const read = (p) => fs.readFileSync(p, "utf8");
const audit = JSON.parse(read("data/scientific/bone-health-coverage-audit.v1.json"));
const catalogRaw = read("data/scientific/bone-health-handbook-v7.catalog.json");
const catalog = JSON.parse(catalogRaw);
assert.equal(
  crypto.createHash("sha256").update(catalogRaw).digest("hex"),
  audit.catalogSha256,
  "Scientific catalog changed: re-audit against original handbook before updating baseline",
);
assert.equal(audit.total, 63);
assert.equal(audit.variables.length, 63);
assert.equal(catalog.variables.length, 63);
const ids = new Set();
for (let i = 0; i < 63; i++) {
  const expected = audit.variables[i],
    actual = catalog.variables[i];
  assert.deepEqual(
    {
      id: actual.id,
      name: actual.name,
      category: actual.category,
      handbookEvidenceTier: actual.handbookEvidenceTier,
      reviewStatus: actual.reviewStatus,
    },
    expected,
  );
  assert.ok(!ids.has(actual.id));
  ids.add(actual.id);
  assert.equal(actual.reviewStatus, "pending_independent_review");
  assert.equal(actual.operationalStatus, "reference_only");
}
const ts = read("src/domain/bone-health/catalog.ts");
const match = ts.match(/export const BONE_HEALTH_VARIABLES = (\[[\s\S]*?\]) as const;/);
assert.ok(match, "Cannot locate runtime catalog");
const runtime = JSON.parse(match[1]);
assert.equal(runtime.length, 63);
for (let i = 0; i < 63; i++)
  assert.deepEqual(runtime[i], {
    id: audit.variables[i].id,
    name: audit.variables[i].name,
    category: audit.variables[i].category,
    reviewStatus: audit.variables[i].reviewStatus,
  });
const entry = read("src/components/bone-health-entry.tsx");
const importer = read("src/domain/bone-health/import.ts");
const document = read("src/domain/bone-health/document-extraction.ts");
assert.match(
  entry,
  /if\s*\(!query\)\s*return\s+BONE_HEALTH_VARIABLES\s*;/,
  "Empty search must expose the full catalog",
);
assert.match(entry, /BONE_HEALTH_VARIABLES\.filter\s*\(/, "Search must filter the full catalog");
assert.match(
  entry,
  /filteredVariables\.map\s*\(/,
  "Manual entry must render catalog-derived options",
);
assert.ok(importer.includes("BONE_HEALTH_VARIABLES.filter"), "CSV importer must use catalog");
assert.ok(document.includes("BONE_HEALTH_VARIABLES.flatMap"), "Document matching must use catalog");
assert.ok(document.includes("selected:false"), "Document extraction must remain opt-in");
assert.equal(audit.capabilityBoundaries.clinicalInterpretation, false);
assert.equal(audit.capabilityBoundaries.independentScientificApproval, false);
console.log(
  "P22.3c PASS: 63/63 handbook entries match frozen audit, runtime catalog, manual/CSV/document pathways; OCR not guaranteed; no clinical activation.",
);
