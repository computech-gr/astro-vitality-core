import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = process.cwd();
const provenance = JSON.parse(fs.readFileSync(path.join(root, 'assets/ocr/eng.provenance.json'), 'utf8'));
const names = ['worker.min.js','tesseract-core.wasm.js','tesseract-core-simd.wasm.js','tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','eng.traineddata.gz'];
const folder = path.join(root,'public/ocr/v1');
const report = {schema_version:'p22.8-v1', provenance_approved: provenance.status === 'approved', pack_complete:false, hashes:{}, offline_device_test:'not_performed', offline_ready:false};
let all = true;
for (const name of names) {
 const p=path.join(folder,name);
 if (!fs.existsSync(p) || !fs.statSync(p).isFile() || fs.statSync(p).size === 0) { all=false;continue; }
 report.hashes[name]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
report.pack_complete=all;
if(all && provenance.status === 'approved') {
 const expected=String(provenance.sha256||'').toLowerCase();
 if(report.hashes['eng.traineddata.gz'] !== expected) { console.error('P22.8 FAIL: staged language hash differs from approved provenance');process.exit(1); }
}
console.log(JSON.stringify(report,null,2));
if (!report.provenance_approved || !all) console.log('P22.8 PASS (NOT READY): awaiting reviewed language file and/or staged complete pack.');
else console.log('P22.8 PASS (DEVICE TEST REQUIRED): pack staged; airplane-mode test is not verified by this script.');
