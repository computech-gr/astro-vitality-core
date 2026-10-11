import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const ui = readFileSync("src/components/offline-mission.tsx", "utf8");
assert.match(ui, /loadRecordedMissionData\(300\)/);
assert.match(ui, /cloudState !== "authenticated"/);
assert.match(ui, /item\.state === "needs_review"/);
assert.match(ui, /border-border bg-card\/60/);
assert.doesNotMatch(ui, /putQueueItem\(/);
console.log("P23F PASS: read-only evidence and review surfaces present (browser validation pending)");
