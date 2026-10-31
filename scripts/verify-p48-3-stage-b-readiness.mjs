import { readFileSync, existsSync } from 'node:fs';
const required = [
  'src/domain/companion/crew-revalidation.ts',
  'src/components/astronaut-daily-health-companion.tsx',
  'tests/domain/p482-crew-revalidation.test.ts',
  'docs/P48_3_STAGE_B_ACCEPTANCE.md',
];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`P48.3 missing: ${file}`);
}
const page = readFileSync(required[1], 'utf8');
const controller = readFileSync(required[0], 'utf8');
const assertions = [
  ['focused controller', page.includes('createCrewEvidenceController')],
  ['tab visibility revalidation', page.includes('visibilitychange') && page.includes('controller.suspend()')],
  ['auth revalidation', page.includes('onAuthStateChange')],
  ['no unconditional reload', !page.includes('window.location.reload()')],
  ['late response invalidation', controller.includes('generation')],
  ['fail-closed contract', readFileSync(required[3], 'utf8').includes('Never bypass RLS')],
];
for (const [label, passed] of assertions) {
  if (!passed) throw new Error(`P48.3 check failed: ${label}`);
  console.log(`PASS ${label}`);
}
console.log('P48.3 Stage B readiness: 6/6 static checks passed. Real-user acceptance remains pending.');
