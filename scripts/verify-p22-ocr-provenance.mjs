import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd();
const manifestPath=path.join(root,'assets/ocr/eng.provenance.json');
const languagePath=path.join(root,'assets/ocr/eng.traineddata.gz');
const fail=(message)=>{console.error(`P22.7 FAIL: ${message}`);process.exit(1)};
if(!fs.existsSync(manifestPath)) fail('missing assets/ocr/eng.provenance.json');
let m;try{m=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{fail('invalid provenance JSON')}
if(m.status==='pending_review'){
 if(fs.existsSync(languagePath)) fail('language file exists but provenance is pending');
 console.log('P22.7 PASS (NOT READY): provenance pending, language file absent, staging prohibited');
 process.exit(0);
}
if(m.status!=='approved') fail('status must be pending_review or approved');
for(const field of ['source_url','upstream_repository','upstream_revision','license','license_reviewed_by','reviewed_at','sha256']){
 if(typeof m[field]!=='string'||!m[field].trim()) fail(`missing ${field}`);
}
if(!/^https:\/\//.test(m.source_url)) fail('source_url must be HTTPS');
if(!/^[a-f0-9]{64}$/i.test(m.sha256)) fail('invalid SHA-256');
if(!fs.existsSync(languagePath)) fail('approved language file absent');
const actual=createHash('sha256').update(fs.readFileSync(languagePath)).digest('hex');
if(actual.toLowerCase()!==m.sha256.toLowerCase()) fail('language file hash mismatch');
console.log('P22.7 PASS: reviewed language file present and SHA-256 matches; airplane-mode validation still required');
