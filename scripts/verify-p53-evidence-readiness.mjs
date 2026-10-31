#!/usr/bin/env node
// P53 inventory consistency only. Never reads private evidence or changes release gates.
import { readFileSync } from 'node:fs';
const file = 'data/release/p53-evidence-readiness.v1.json';
const errors = [];
let register;
try { register = JSON.parse(readFileSync(file, 'utf8')); }
catch { errors.push('Missing or invalid P53 readiness register'); }
const expected = ['P3663', 'P3664', 'P20'];
if (register) {
  if (register.version !== '1.0') errors.push('Unsupported version');
  if (!register.gates || Object.keys(register.gates).sort().join(',') !== expected.sort().join(',')) errors.push('Expected exactly P3663, P3664 and P20');
  for (const key of expected) {
    if (register.gates?.[key]?.status !== 'BLOCKED') errors.push(`${key} must remain BLOCKED in the preparation register`);
  }
  if (register.gates?.P3663?.ownerApprovalRecorded !== false || register.gates?.P3664?.ownerRiskAcceptanceRecorded !== false) errors.push('No owner approvals may be prefilled');
  if (register.gates?.P20?.official2026RulesSource !== null) errors.push('Do not prefill an unverified official source');
}
console.log(JSON.stringify({ phase: 'P53', status: errors.length ? 'INVALID' : 'PREPARATION_ONLY', releaseAuthorized: false, databaseChanged: false, errors }, null, 2));
if (errors.length) process.exitCode = 1;
