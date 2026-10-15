#!/usr/bin/env node
// P36.6 read-only release preflight. Never connects to or modifies Supabase.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const paths = [
 'supabase/pending/20261017000000_p36_biomarker_review_foundation.sql',
 'supabase/pending/20261018000000_p364_synthetic_submission.sql',
 'supabase/pending/20261019000000_p365_synthetic_review_history.sql',
];
const failures = [];
const sql = paths.map(p => { if (!existsSync(p)) {failures.push(`Missing ${p}`);return '';} return readFileSync(p,'utf8'); });
for (const [i,s] of sql.entries()) {
 if (!s) continue;
 if (/\bdrop\s+(table|schema)\b/i.test(s)) failures.push(`Destructive DROP in ${paths[i]}`);
 if (/\b(grant\s+all|grant\s+(select|insert|update|delete)\s+on\s+public\.p36)/i.test(s)) failures.push(`Broad P36 grant in ${paths[i]}`);
}
if (!/force row level security/i.test(sql[0])) failures.push('Missing forced RLS foundation');
if (!/synthetic/i.test(sql[1])) failures.push('Missing synthetic submission restriction');
if (!/auth\.uid\(\)/i.test(sql[2])) failures.push('Missing authenticated history check');
for (const p of ['supabase/pending/20261018000000_p364_synthetic_submission.rollback.sql','supabase/pending/20261019000000_p365_synthetic_review_history.rollback.sql']) if (!existsSync(p)) failures.push(`Missing rollback ${p}`);
const hashes=paths.map((path,i)=>({path,sha256:createHash('sha256').update(sql[i]).digest('hex')}));
console.log(JSON.stringify({status:failures.length?'BLOCKED':'STATIC_PREFLIGHT_PASS_NOT_LIVE_APPROVAL',migrationOrder:paths,hashes,failures,requires:['independent SQL review','live schema and migration history inspection','verified backup/recovery checkpoint','live least-privilege checks','owner-authorized deployment','GitHub CI and secrets review']},null,2));
if(failures.length) process.exitCode=1;
