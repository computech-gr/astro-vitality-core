import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url),'utf8');
const engine=read('src/domain/offline-mission/autonomy.ts');
const ui=read('src/components/offline-autonomy.tsx');
const page=read('src/components/offline-mission.tsx');
for (const [ok,msg] of [[engine.includes('decideForegroundSync'),'decision engine'],[engine.includes('retryDelayMs'),'backoff'],[ui.includes('visibilitychange'),'foreground visibility'],[ui.includes('getCloudMissionContext'),'membership check'],[ui.includes('syncRecordedMissionQueue'),'existing transport'],[page.includes('<OfflineAutonomy />'),'offline route integration']]) if(!ok) throw new Error(`P29 missing ${msg}`);
console.log('P29 offline autonomy verifier: PASS');
