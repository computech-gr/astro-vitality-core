import fs from "node:fs";
import assert from "node:assert/strict";
const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const ledger = JSON.parse(read("data/validation/p32-independent-review-gates.v1.json"));
assert.equal(ledger.gates.length,8);
assert.equal(ledger.independentApproval,false);
assert.equal(ledger.clinicalValidation,false);
assert.equal(new Set(ledger.gates.map(g=>g.id)).size,8);
for(const g of ledger.gates){assert.equal(g.status,"pending_independent_review");assert.equal(g.reviewer,null);assert.equal(g.reviewedAt,null);assert.equal(g.signedEvidence,null);assert.ok(read(g.sourceFile).length>0);}
assert.ok(read("src/components/validation-usability.tsx").includes("<IndependentScientificReview />"));
assert.ok(read("src/components/independent-scientific-review.tsx").includes("NOT APPROVED"));
console.log("P32 independent review verifier: PASS (8 pending; no fabricated signoff)");
