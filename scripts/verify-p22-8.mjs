import fs from 'node:fs';
const required=['scripts/verify-p22-ocr-pack.mjs','docs/P22_8_OFFLINE_OCR_DEVICE_VALIDATION.md'];
for(const p of required){if(!fs.existsSync(p)){console.error('P22.8 FAIL missing '+p);process.exit(1)}}
const src=fs.readFileSync(required[0],'utf8');
for(const token of ['createHash','eng.traineddata.gz','offline_device_test','not_performed','provenance.status']) if(!src.includes(token)){console.error('P22.8 FAIL missing '+token);process.exit(1)}
console.log('P22.8 PASS: integrity report and explicit device-test hold present; no offline readiness asserted.');
