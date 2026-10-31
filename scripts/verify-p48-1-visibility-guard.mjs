// P48.1 verifier, updated for P48.2: the unconditional reload was replaced by focused,
// fail-closed revalidation. This asserts the replacement and that the reload never returns.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const s = readFileSync("src/components/astronaut-daily-health-companion.tsx", "utf8");
const c = readFileSync("src/domain/companion/crew-revalidation.ts", "utf8");
assert.ok(!s.includes("window.location.reload()"), "P48.1 reload must not be reinstated");
assert.match(s, /document\.addEventListener\("visibilitychange", onVisibility\)/);
assert.match(s, /document\.removeEventListener\("visibilitychange", onVisibility\)/);
assert.match(s, /controller\.suspend\(\)/);
assert.match(s, /controller\.revalidate\("return"\)/);
assert.match(s, /getCloudMissionContext/);
assert.match(s, /loadCrewScientificEvidence/);
assert.match(c, /generation/);
console.log("P48.1 visibility guard (P48.2-aware) static checks: PASS");
