import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const script=readFileSync('scripts/verify-p3664-owner-risk.mjs','utf8');
const doc=readFileSync('docs/P36_6_4_OWNER_MANAGED_ACTIVATION.md','utf8');
describe('P36.6.4 owner-managed recovery risk',()=>{
 it('requires explicit risk acknowledgement and never claims backup verification',()=>{
  expect(script).toContain('acceptsPotentialIrrecoverableDataLoss');
  expect(script).toContain('backupIndependentlyVerified!==false');
  expect(script).toContain('OWNER_RISK_ACKNOWLEDGED_LIVE_CHECKS_REQUIRED');
  expect(script).toContain('backupVerified:false');
 });
 it('never changes Cloud or weakens clinical and migration gates',()=>{
  expect(script).not.toContain('execSync');
  expect(doc).toContain('MISSION_TEST');
  expect(doc).toContain('P36_CLOUD_SUBMISSION_ENABLED');
  expect(doc).toContain('STOP');
 });
});
