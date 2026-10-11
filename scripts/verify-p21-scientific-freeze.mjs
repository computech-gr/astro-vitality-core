import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const fail = m => { throw new Error(`P21.15: ${m}`); };
const m = read('data/scientific/bone-health-scientific-freeze.v1.json');
if(m.stage !== 'P21.15' || m.freezeType !== 'research_reference_only' || m.scientificReviewComplete !== false || m.operationalActivation !== false || m.clinicalRulesAllowed !== false) fail('unsafe freeze flags');
if(m.status !== 'frozen_with_pending_independent_review' || m.scope.catalogVariables !== 63 || m.scope.relationshipRecords !== 16 || m.scope.studyHandoffs !== 6 || m.scope.approvedVariables !== 0 || m.scope.approvedRelationships !== 0) fail('unexpected scope');
if(m.sourceFileHashes.length !== 9) fail('missing source hashes');
for(const f of m.sourceFileHashes){if(!existsSync(f.path))fail(`missing ${f.path}`); const h=createHash('sha256').update(readFileSync(f.path)).digest('hex');if(h!==f.sha256)fail(`source changed since freeze: ${f.path}`);}
const catalog=read('data/scientific/bone-health-handbook-v7.catalog.json');
const ledger=read('data/scientific/bone-health-review-ledger.v1.json');
const decisions=read('data/scientific/bone-health-relationship-decision-matrix.v1.json');
const handoff=read('data/scientific/bone-health-independent-review-handoff.v1.json');
if(ledger.entries.length!==63 || handoff.metricReviewTasks.length!==63 || handoff.relationshipReviewTasks.length!==16 || handoff.studyAccessQueue.length!==6 || decisions.relationshipDecisions.length!==16) fail('record counts drift');
if(ledger.entries.some(x=>x.operationalActivation!==false || x.reviewStatus!=='pending_independent_review') || decisions.relationshipDecisions.some(x=>x.operationalApproval!==false || x.educationalApproval!==false || x.clinicalRuleAllowed!==false || x.causalInferenceAllowed!==false))fail('unexpected approval');
console.log('P21.15 scientific research baseline: hashes intact, 63 variables, 16 relationships, 6 studies, zero approvals — PASS');
