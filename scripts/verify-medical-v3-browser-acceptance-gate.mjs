import { readFileSync, existsSync } from 'node:fs';
const contract = 'docs/MEDICAL_V3_ISOLATED_BROWSER_ACCEPTANCE.md';
if (!existsSync(contract)) throw new Error('Missing browser acceptance contract');
const text = readFileSync(contract, 'utf8');
for (const marker of ['disposable database', '1280px', '390px', 'exact observation IDs', 'zero provider calls', 'Production migration remains pending owner approval', 'EXACT final SHA']) {
  if (!text.includes(marker)) throw new Error(`Acceptance gate missing: ${marker}`);
}
console.log('Medical v3 isolated browser acceptance contract: PASS (static contract only; NOT browser acceptance)');
