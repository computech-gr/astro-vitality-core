import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const ui = readFileSync('src/components/offline-mission.tsx', 'utf8');
assert.match(ui, /Authenticated persistence validation/);
assert.match(ui, /dataset\.cloudContext\.error/);
assert.match(ui, /dataset\.cloud\.length >= 300/);
assert.match(ui, /does not create records/);
console.log('P23G authenticated validation handoff: PASS');
