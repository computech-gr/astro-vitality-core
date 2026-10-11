import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const read = p => readFileSync(p, "utf8");
assert.match(read("src/infrastructure/offline/sync.ts"), /needs_review/);
assert.match(read("src/infrastructure/ground-research/supabase-transport.ts"), /retryable/);
assert.match(read("src/components/bone-health-entry.tsx"), /loadGroundRoster/);
assert.match(read("src/domain/bone-health/history.ts"), /metricCode: entry.variableId/);
assert.match(read("supabase/migrations/20261011000000_p23_unified_mission_record_index.sql"), /new.payload ->> 'metricCode'/);
console.log("P23D static contract PASS (browser and cloud integration NOT TESTED)");
