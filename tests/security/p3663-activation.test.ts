import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const script=readFileSync('scripts/verify-p3663-activation.mjs','utf8');
const doc=readFileSync('docs/P36_6_3_GOVERNED_ACTIVATION.md','utf8');
describe('P36.6.3 governed activation',()=>{
 it('requires private restore evidence and validates migration fingerprints',()=>{
  expect(script).toContain('restore-evidence');
  expect(script).toContain('6906fd46');
  expect(script).toContain('ba064704');
  expect(script).toContain('d01743d6');
  expect(script).toContain('confirmedLovableCloud');
 });
 it('never automatically changes Cloud or enables flag',()=>{
  expect(script).not.toContain('supabase-js');
  expect(script).not.toContain('execSync');
  expect(doc).toContain('Keep `P36_CLOUD_SUBMISSION_ENABLED` **OFF**');
  expect(doc).toContain('MISSION_TEST');
 });
});
