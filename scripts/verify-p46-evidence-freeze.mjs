import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (path) => readFileSync(path, "utf8");
const evidence = JSON.parse(read("data/submission/p46-acceptance-evidence.v1.json"));
assert.equal(evidence.phase, "P46");
assert.equal(evidence.release_classification, "RESEARCH_PROTOTYPE_NOT_CLINICALLY_VALIDATED");
assert.equal(evidence.p45_gitHub_evidence.result, "SUCCESS");
assert.equal(evidence.p45_gitHub_evidence.provenance, "USER_PROVIDED_GITHUB_SCREENSHOT");
assert.equal(evidence.scientific.p43_proposals, 54);
assert.equal(evidence.scientific.independent_approvals, 0);
assert.equal(evidence.scientific.operational_activations, 0);
const p43 = JSON.parse(read("data/scientific/p43-semantic-decision-proposals.v1.json"));
assert.equal(p43.rows.length, 54);
assert.ok(p43.rows.every((r) => r.independent_decision === "PENDING_INDEPENDENT_SCIENTIFIC_REVIEW"));
assert.ok(p43.rows.every((r) => r.catalog_merge_authorized === false && r.operational_activation === false));
for (const [path, expected] of Object.entries(evidence.frozen_source_sha256)) {
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.equal(actual, expected, `Frozen source changed: ${path}`);
}
const expectedGates = ["GATE-DEVICE-OCR", "GATE-CREW-ISOLATION", "GATE-SCIENTIFIC-REVIEW"];
for (const id of expectedGates) assert.equal(evidence.open_gates.find((g) => g.id === id)?.status, "OPEN");
assert.ok(evidence.open_gates.some((g) => g.id === "GATE-P46-CI" && g.status === "PENDING"));
assert.ok(Object.values(evidence.restrictions).every((v) => v === false));
const workflow = read(".github/workflows/p41-full-validation.yml");
assert.ok(workflow.includes("bun run check") && workflow.includes("verify-p46-evidence-freeze.mjs"));
console.log("P46 PASS: evidence freeze consistent, 54 review-only proposals, 0 approvals, 0 activations; open gates preserved");
