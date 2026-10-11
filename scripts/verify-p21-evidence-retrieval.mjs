import fs from 'node:fs';
const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const plan=read('data/scientific/bone-health-evidence-retrieval-plan.v1.json');
const graph=read('data/scientific/bone-health-interpretation-graph.v1.json');
const appraisal=read('data/scientific/bone-health-evidence-appraisal.v1.json');
const fail=s=>{throw Error('P21.7: '+s)};
if(plan.operationalActivation!==false||plan.independentReviewComplete!==false||plan.independentEvidenceRetrieved!==false) fail('premature activation/review claim');
if(plan.relationships.length!==16||graph.relationships.length!==16||appraisal.relationships.length!==16) fail('relationship count');
const ids=new Set();
for(const row of plan.relationships){
 if(ids.has(row.relationshipId)) fail('duplicate id'); ids.add(row.relationshipId);
 const g=graph.relationships.find(x=>x.id===row.relationshipId);
 const a=appraisal.relationships.find(x=>x.relationshipId===row.relationshipId);
 if(!g||!a||row.fromHandbookId!==g.fromHandbookId||row.toHandbookId!==g.toHandbookId||row.claimUnderReview!==a.claimUnderReview) fail('traceability mismatch '+row.relationshipId);
 if(row.evidenceSearch.searchExecuted!==false||row.evidenceSearch.retrievalDate!==null||!row.evidenceSearch.query||row.evidenceRecords.length!==0) fail('unverified evidence '+row.relationshipId);
 if(row.independentReviewStatus!=='not_started'||row.decision!=='defer'||row.approvedForDisplay!==false||row.approvedForOperationalUse!==false||row.clinicalRuleAllowed!==false) fail('unsafe approval '+row.relationshipId);
 if(Object.values(row.minimumReviewChecklist).some(x=>x!=='pending')) fail('unsupported review completion '+row.relationshipId);
}
console.log('P21.7 evidence retrieval plan: 16 linked research tasks, zero retrieved evidence, zero approvals, zero activation — PASS');
