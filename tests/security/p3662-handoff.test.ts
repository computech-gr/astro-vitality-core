import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

test('P36.6.2 requires independent release-specific restore proof', () => {
  const doc=readFileSync('docs/P36_6_2_ACTIVATION_HANDOFF.md','utf8');
  expect(doc).toContain('HARD STOP');
  expect(doc).toContain('not sufficient');
  expect(doc).toContain('P36_CLOUD_SUBMISSION_ENABLED=true');
});
test('P36.6.2 preserves synthetic-only scope and mission identity', () => {
  const doc=readFileSync('docs/P36_6_2_ACTIVATION_HANDOFF.md','utf8');
  expect(doc).toContain('FV01-TEST-B');
  expect(doc).toContain('MISSION_TEST');
  expect(doc).toContain('clinical activation DISABLED');
});
