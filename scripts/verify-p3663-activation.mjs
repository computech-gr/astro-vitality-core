#!/usr/bin/env node
// Offline pre-deployment gate. Never connects to or modifies a database.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const names = [
  'supabase/pending/20261017000000_p36_biomarker_review_foundation.sql',
  'supabase/pending/20261018000000_p364_synthetic_submission.sql',
  'supabase/pending/20261019000000_p365_synthetic_review_history.sql',
];
const expected = ['6906fd46','ba064704','d01743d6'];
const errors = [];
const migrations = names.map((path,i) => {
  try {
    const sha256=createHash('sha256').update(readFileSync(path)).digest('hex');
    if (!sha256.startsWith(expected[i])) errors.push(`Fingerprint mismatch: ${path}`);
    return {order:i+14,path,sha256};
  } catch {errors.push(`Missing: ${path}`);return {order:i+14,path,sha256:null};}
});
for(const path of ['supabase/pending/20261018000000_p364_synthetic_submission.rollback.sql','supabase/pending/20261019000000_p365_synthetic_review_history.rollback.sql']){
  try {readFileSync(path);} catch {errors.push(`Missing rollback: ${path}`);}
}
const evidenceFile = process.argv[2];
let evidence;
if (!evidenceFile) errors.push('Private restore evidence JSON path required as first argument');
else {
  try {evidence=JSON.parse(readFileSync(evidenceFile,'utf8'));}
  catch {errors.push('Cannot parse private restore evidence JSON');}
}
if (evidence) {
  for(const key of ['cloudProjectId','supportReference','checkpointUtc','verifiedBy','restoreOperator','restoreProcedure','retentionUntilUtc','coverageConfirmation']){
    if(typeof evidence[key] !== 'string' || !evidence[key].trim()) errors.push(`Missing restore evidence: ${key}`);
  }
  const checkpoint=Date.parse(evidence.checkpointUtc),expiry=Date.parse(evidence.retentionUntilUtc);
  if(!Number.isFinite(checkpoint)||!Number.isFinite(expiry)||expiry<=Date.now()) errors.push('Checkpoint/retention timestamp invalid or expired');
  if(evidence.confirmedLovableCloud !== true) errors.push('Lovable Cloud identity not confirmed');
  if(evidence.baselineMigration !== 13) errors.push('Expected baseline migration 13 not confirmed');
  if(evidence.ownerApproval !== true) errors.push('Explicit owner approval not recorded');
}
// Intentionally never print the private evidence object or identifiers.
console.log(JSON.stringify({status:errors.length?'BLOCKED':'OFFLINE_EVIDENCE_READY_LIVE_CHECKS_REQUIRED',migrations,errors,databaseChanged:false,featureFlagChanged:false},null,2));
if(errors.length) process.exitCode=1;
