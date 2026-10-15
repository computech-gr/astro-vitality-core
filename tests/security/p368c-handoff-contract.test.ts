import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const handoff = readFileSync('docs/P36_8C_IMPLEMENTATION_HANDOFF.md', 'utf8');
const design = readFileSync('docs/P36_8C_IMPLEMENTATION_DESIGN.md', 'utf8');

describe('P36.8C implementation handoff', () => {
  it('keeps migration deployment behind owner approval', () => {
    expect(handoff).toContain('DO NOT apply migration');
    expect(handoff).toContain('owner approves');
  });
  it('preserves synthetic-only nonclinical decision semantics', () => {
    expect(design).toContain('accepted_for_research');
    expect(design).toContain('rejected_for_research');
    expect(handoff).toContain('never clinical approval');
  });
  it('requires disposable integration and immutable values', () => {
    expect(handoff).toContain('disposable integration tests');
    expect(handoff).toContain('immutable values');
    expect(handoff).toContain('No MISSION_TEST changes');
  });
});
