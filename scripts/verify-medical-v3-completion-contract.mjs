import { readFileSync } from 'node:fs';
const contract = readFileSync('docs/MEDICAL_V3_SYNTHETIC_COMPLETION_CONTRACT.md', 'utf8');
const must = ['disposable/non-production', 'never copy, sync, promote', 'server canonical SHA-256', '429', 'PENDING_NIKOLAS_REVIEW', 'Do not run production migrations', 'Do not enable `MITO_MEDICAL_AI_REAL_DATA_ENABLED`'];
for (const clause of must) {
  if (!contract.includes(clause)) throw new Error(`Missing medical v3 safeguard: ${clause}`);
}
console.log('PASS: synthetic-only v3 completion contract contains all mandatory release boundaries');
