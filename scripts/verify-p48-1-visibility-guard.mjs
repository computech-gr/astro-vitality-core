import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const s = readFileSync('src/components/astronaut-daily-health-companion.tsx', 'utf8');
assert.match(s, /document\.addEventListener\("visibilitychange", revalidateOnReturn\)/);
assert.match(s, /document\.removeEventListener\("visibilitychange", revalidateOnReturn\)/);
assert.match(s, /window\.location\.reload\(\)/);
assert.match(s, /getCloudMissionContext\(\)/);
assert.match(s, /loadCrewScientificEvidence\(/);
console.log('P48.1 visibility guard static checks: PASS');
