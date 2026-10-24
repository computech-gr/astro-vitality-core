import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ui = read("src/components/mission-identity.tsx");
const doc = read("docs/P23J_FIRST_OPERATOR_OWNER_HANDOFF.md");
assert.match(ui, /Activation prerequisites/);
assert.match(ui, /trusted computer/);
assert.match(ui, /Never send the secret/);
assert.match(
  ui,
  /cannot bypass\s+database permissions/,
  "Bootstrap UI must warn it cannot bypass database permissions",
);
assert.match(doc, /explicitly approve/i);
assert.match(doc, /does \*\*not\*\* arm bootstrap/);
assert.doesNotMatch(ui, /SUPABASE_SERVICE_ROLE_KEY/);
console.log("P23J owner handoff static verifier PASS (no live bootstrap performed)");
