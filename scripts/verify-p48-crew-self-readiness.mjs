import { readFileSync, existsSync } from 'node:fs';
const read = p => { if (!existsSync(p)) throw new Error(`Missing ${p}`); return readFileSync(p,'utf8'); };
const page=read('src/components/astronaut-daily-health-companion.tsx');
const controller=read('src/domain/companion/crew-revalidation.ts');
const checks = [
 ['Mission identity resolved from canonical context', /loadContext:\s*getCloudMissionContext\b/.test(page) && /await deps\.loadContext\(\)/.test(controller)],
 ['Evidence loaded through existing infrastructure', /loadEvidence:\s*loadCrewScientificEvidence\b/.test(page) && /deps\.loadEvidence\(/.test(controller)],
 ['No authorized Crew Self fail-closed message', controller.includes('No authorized Crew Self mission context')],
 ['Synthetic example clearly identified', page.includes('SYNTHETIC DEMONSTRATION')],
 ['Time and source filtering available', page.includes('filterTrendObservations')],
 ['Existing reminder engine preserved', page.includes('createReminderPlan')],
];
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
console.log('\nNOTE: Static checks only. This does NOT prove Supabase RLS, identity provisioning, signed-in E2E isolation or actual data retrieval.');
if(checks.some(([,ok])=>!ok)) process.exitCode=1;
