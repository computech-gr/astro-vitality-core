import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const root=process.cwd();
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/ocr/eng.provenance.json'),'utf8'));
if(manifest.status!=='approved') {console.error('OCR pack NOT staged: language provenance is not approved.');process.exit(1)}
const check=spawnSync(process.execPath,[path.join(root,'scripts/verify-p22-ocr-provenance.mjs')],{cwd:root,stdio:'inherit'});
if(check.status!==0) process.exit(check.status??1);
const files=[
 ['node_modules/tesseract.js/dist/worker.min.js','worker.min.js'],
 ...['tesseract-core.wasm.js','tesseract-core-simd.wasm.js','tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js'].map(n=>[`node_modules/tesseract.js-core/${n}`,n]),
 ['assets/ocr/eng.traineddata.gz','eng.traineddata.gz']
];
const missing=files.filter(([src])=>!fs.existsSync(path.join(root,src)));
if(missing.length){console.error('OCR pack NOT staged. Missing:',missing.map(([src])=>src).join(', '));process.exit(1)}
const output=path.join(root,'public/ocr/v1');
fs.mkdirSync(output,{recursive:true});
for(const [source,dest] of files){const data=fs.readFileSync(path.join(root,source));fs.writeFileSync(path.join(output,dest),data);console.log(dest,data.length,createHash('sha256').update(data).digest('hex'))}
console.log('Staged approved same-origin OCR pack. Cache and airplane-mode device testing remain mandatory.');
