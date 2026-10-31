import { readFileSync } from 'node:fs';
const file = 'src/components/astronaut-daily-health-companion.tsx';
const source = readFileSync(file, 'utf8');
const checks = [
  ['mission context', source.includes('getCloudMissionContext')],
  ['evidence loader', source.includes('loadCrewScientificEvidence')],
  ['visibility handling', source.includes('visibilitychange')],
  ['crew scope filter', source.includes('crew_self')],
  ['privacy state', source.includes('setReport(null)')],
];
for (const [label, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
if (checks.some(([,ok]) => !ok)) process.exitCode = 1;
