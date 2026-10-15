#!/usr/bin/env node
// Offline owner-risk acknowledgement gate; never accesses Cloud or asserts a backup exists.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const paths = [
 'supabase/pending/20261017000000_p36_biomarker_review_foundation.sql',
 'supabase/pending/20261018000000_p364_synthetic_submission.sql',
 'supabase/pending/20261019000000_p365_synthetic_review_history.sql',
];
const prefixes = ['6906fd46','ba064704','d01743d6'];
const errors=[];
const migrations=paths.map((path,i)=>{
 try {const sha256=createHash('sha256').update(readFileSync(path)).digest('hex');if(!sha256.startsWith(prefixes[i]))errors.push(`Migration checksum mismatch: ${path}`);return {order:14+i,path,sha256};}
 catch {errors.push(`Missing migration: ${path}`);return {order:14+i,path,sha256:null};}
});
for(const path of ['supabase/pending/20261018000000_p364_synthetic_submission.rollback.sql','supabase/pending/20261019000000_p365_synthetic_review_history.rollback.sql']){
 try {readFileSync(path);}catch{errors.push(`Missing rollback script: ${path}`);}
}
let approval;
if(!process.argv[2])errors.push('Private owner-risk acknowledgement path required');
else try{approval=JSON.parse(readFileSync(process.argv[2],'utf8'));}catch{errors.push('Invalid private acknowledgement JSON');}
if(approval){
 if(approval.mode!=='OWNER_MANAGED_BACKUP_RISK_ACCEPTED')errors.push('Invalid approval mode');
 if(approval.ownerApproved!==true)errors.push('Owner approval missing');
 if(approval.backupIndependentlyVerified!==false)errors.push('Must explicitly acknowledge backup is NOT independently verified');
 if(approval.acceptsPotentialIrrecoverableDataLoss!==true)errors.push('Explicit data-loss risk acceptance missing');
 if(approval.authorizesMigrations14To16!==true)errors.push('Migration authorization missing');
 if(approval.syntheticOnly!==true)errors.push('Synthetic-only restriction missing');
 if(approval.baselineMigration!==13)errors.push('Expected baseline migration 13 not acknowledged');
 if(approval.externalSupabaseDeployDisabled!==true)errors.push('External Supabase deployment must be disabled');
 if(typeof approval.approvedAtUtc!=='string'||!Number.isFinite(Date.parse(approval.approvedAtUtc)))errors.push('Approval timestamp missing or invalid');
}
console.log(JSON.stringify({status:errors.length?'BLOCKED':'OWNER_RISK_ACKNOWLEDGED_LIVE_CHECKS_REQUIRED',backupVerified:false,liveChecksPerformed:false,databaseChanged:false,featureFlagChanged:false,migrations,errors},null,2));
if(errors.length)process.exitCode=1;
