import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd();
const record=JSON.parse(fs.readFileSync(path.join(root,'assets/ocr/eng.provenance.json'),'utf8'));
const candidate=path.join(root,'assets/ocr/candidate/eng.traineddata.gz');
const approved=path.join(root,'assets/ocr/eng.traineddata.gz');
const file=fs.existsSync(candidate)?candidate:approved;
const fail=(s)=>{console.error('P22.9 FAIL:',s);process.exitCode=1};
if(!fs.existsSync(file)) fail('No English language asset found');
else {
 const sha=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(sha!==record.sha256) fail('Asset SHA-256 mismatch');
 else console.log('P22.9 PASS: candidate bytes match recorded SHA-256');
}
if(record.status==='approved') {
 if(!record.license_reviewed_by||!record.reviewed_at) fail('Approved without human reviewer/date');
 if(!fs.existsSync(approved)) fail('Approved asset not at final location');
 else console.log('Provenance approved by',record.license_reviewed_by,'on',record.reviewed_at);
} else if(record.status==='pending_review') {
 if(record.license_reviewed_by||record.reviewed_at) fail('Pending review must not claim signoff');
 if(fs.existsSync(approved)) fail('Final asset exists before approval');
 console.log('P22.9 PASS (PENDING HUMAN REVIEW): no auto-approval, no staging');
} else fail('Invalid provenance status');
