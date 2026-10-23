import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const component = readFileSync("src/components/scientific-research-candidates.tsx", "utf8");
const page = readFileSync("src/components/health-intelligence.tsx", "utf8");
const workflow = readFileSync(".github/workflows/p41-full-validation.yml", "utf8");
const proposals = JSON.parse(readFileSync("data/scientific/p43-semantic-decision-proposals.v1.json", "utf8"));
assert.equal(proposals.rows.length, 54, "P43 source must have 54 rows");
assert.ok(proposals.rows.every((row) => row.independent_decision === "PENDING_INDEPENDENT_SCIENTIFIC_REVIEW"));
assert.ok(proposals.rows.every((row) => row.catalog_merge_authorized === false && row.operational_activation === false));
for (const marker of ["type=\"search\"", "aria-label=\"Search provisional scientific proposals\"", "setVisibleCount(12)", "filtered.slice(0, visibleCount)", "Show 12 more", "Independent review pending", "No patient data, Cloud writes"]) {
  assert.ok(component.includes(marker), `Missing research UX safeguard: ${marker}`);
}
assert.ok(page.includes("<ScientificResearchCandidates />"), "Explorer must remain on Health Intelligence page");
assert.ok(page.includes("loadCrewScientificEvidence(selected.missionId, selected.crewMemberId)"), "Mission-scoped Crew Self evidence must remain intact");
assert.ok(workflow.includes("bun run check") && workflow.includes("verify-p45-final-ux.mjs"), "CI must run full check and P45 verifier");
console.log("P45 PASS: 54 read-only proposals, accessible search, bounded rendering, preserved Crew Self evidence and CI gate");
