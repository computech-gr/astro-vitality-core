import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.ok(pkg.scripts.check.includes('bun run typecheck'), 'full check must include typecheck');
assert.ok(pkg.scripts.check.includes('bun run build'), 'full check must include production build');
for (const [name, args] of [
  ['P41 verifier', ['scripts/verify-p41-review-workbook.mjs']],
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
  console.log(`${name}: PASS`);
}
console.log('P41.2 PASS: repository full-check script includes typecheck and build; P41 verifier passed.');
console.log('NOTE: This script does not replace executing the complete bun run check.');
