#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const checks = [
  { id: 'restore', verifier: 'scripts/verify-p3663-activation.mjs', evidence: 'owner-authenticated restore/activation evidence' },
  { id: 'owner-risk', verifier: 'scripts/verify-p3664-owner-risk.mjs', evidence: 'owner-signed risk acknowledgement and live-check evidence' },
  { id: 'submission', verifier: 'scripts/verify-submission-gate.mjs', evidence: 'sealed mission-day-127 submission artifact and manifest' },
];
const rows = checks.map(({ id, verifier, evidence }) => {
  if (!existsSync(verifier)) return { id, status: 'ERROR', evidence, reason: 'verifier missing' };
  try { execFileSync(process.execPath, [verifier], { timeout: 30000, stdio: 'pipe', env: { ...process.env, OPENAI_API_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '' } }); return { id, status: 'PASS', evidence }; }
  catch (e) { return { id, status: 'BLOCKED', evidence, reason: [e.stderr, e.stdout].map(value => String(value || '').trim()).filter(Boolean).join('\n') || String(e.message) }; }
});
const summary = { checkedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'local-unverified', checks: rows, complete: rows.every(r => r.status === 'PASS') };
if (process.argv.includes('--json')) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
else for (const r of rows) process.stdout.write(`${r.id}: ${r.status} - ${r.evidence}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
 const md = ['## Medical v3 private evidence status', `Commit: ${summary.commit}`, '', '| Gate | Result | Required evidence |', '|---|---|---|', ...rows.map(r => `| ${r.id} | ${r.status} | ${r.evidence} |`), '', 'This diagnostic does not waive or replace any verifier.'];
 writeFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n', { flag: 'a' });
}
process.exitCode = summary.complete ? 0 : 1;
