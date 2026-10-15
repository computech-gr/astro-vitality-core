#!/usr/bin/env node
// Static, offline, read-only handoff verification. Does not inspect or modify Cloud.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const paths = [
  'supabase/pending/20261017000000_p36_biomarker_review_foundation.sql',
  'supabase/pending/20261018000000_p364_synthetic_submission.sql',
  'supabase/pending/20261019000000_p365_synthetic_review_history.sql',
];
const errors=[];
const migrations=paths.map(path=>{
  if(!existsSync(path)){errors.push('Missing '+path);return {path,sha256:null};}
  return {path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')};
});
for(const p of ['supabase/pending/20261018000000_p364_synthetic_submission.rollback.sql','supabase/pending/20261019000000_p365_synthetic_review_history.rollback.sql'])if(!existsSync(p))errors.push('Missing '+p);
const doc='docs/P36_6_2_ACTIVATION_HANDOFF.md';
if(!existsSync(doc))errors.push('Missing '+doc);
else {const s=readFileSync(doc,'utf8');for(const term of ['HARD STOP','P36_CLOUD_SUBMISSION_ENABLED','FV01-TEST-B','MISSION_TEST','pending_review'])if(!s.includes(term))errors.push('Missing handoff guard '+term);}
console.log(JSON.stringify({status:errors.length?'BLOCKED':'STATIC_HANDOFF_READY_LIVE_BACKUP_UNVERIFIED',migrations,errors,cloudChangesMade:false},null,2));
if(errors.length)process.exitCode=1;
