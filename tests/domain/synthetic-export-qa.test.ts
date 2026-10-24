import { describe, expect, test } from "bun:test";
import { canonicalSyntheticJson, syntheticSha256 } from "../../src/domain/health-intelligence/synthetic-evidence";
import { buildSyntheticReviewExport, validateSyntheticSnapshot } from "../../src/domain/health-intelligence/synthetic-review-export";
import { exactEvidenceStatement, validateSyntheticAnswer, validateSyntheticQuestion } from "../../src/domain/health-intelligence/synthetic-evidence-qa";
import { answerSyntheticQuestion, type QaDependencies } from "../../src/lib/synthetic-evidence-qa.server";

const evidence=[{id:"synthetic-v3-hr-001",metric:"cv-001",value:"62",unit:"bpm",time:"2026-10-01T10:00:00Z",domain:"cardiovascular"}];
async function fixture() {
 const canonical=canonicalSyntheticJson({schema:"mitochondria.synthetic-evidence.v2",provenance:"synthetic",missionId:"m1",crewMemberId:"c1",observations:evidence});
 return {canonical,sha256:await syntheticSha256(canonical),missionId:"m1",crewMemberId:"c1",evidence};
}
const input={question:"What was recorded?",consent:true,provenance:"synthetic",missionId:"m1",crewMemberId:"c1"};
async function harness(options:{enabled?:boolean;deny?:boolean;quota?:boolean;providerStatus?:number;answer?:unknown;stale?:boolean;releaseFail?:boolean}={}) {
 const snapshot=await fixture();let calls=0;let reads=0;const rpcs:string[]=[];let sent:Record<string,unknown>|null=null;
 const deps:QaDependencies={enabled:options.enabled??true,apiKey:"isolated-fake-key",now:()=>"2026-10-24T21:30:00Z",
  rpc:async(name)=>{rpcs.push(name); if(options.deny)return {data:null,error:"denied"};
   if(name==="medical_v3_fixture_snapshot"){reads++;return {data:options.stale&&reads>1?{...snapshot,sha256:"sha256-"+"a".repeat(64)}:snapshot,error:null};}
   if(name==="medical_v3_ai_evidence")return {data:evidence,error:null};
   if(name==="medical_v3_reserve_ai")return {data:{allowed:options.quota??true,reservationId:"lease"},error:null};
   return {data:true,error:options.releaseFail?"failed":null};
  },
  providerFetch:(async(url,init)=>{calls++;expect(url).toBe("https://api.openai.com/v1/responses");sent=JSON.parse(String(init?.body));
   if(options.providerStatus)return new Response("failure",{status:options.providerStatus});
   return Response.json({output:[{content:[{type:"output_text",text:JSON.stringify(options.answer??{statements:[{text:exactEvidenceStatement(evidence[0]),observationId:evidence[0].id}]})}]}]});
  }) as typeof fetch};
 return {deps,snapshot,rpcs,getCalls:()=>calls,getSent:()=>sent};
}
describe("authorized synthetic export integrity",()=>{
 test("canonical digest and exact field binding",async()=>{const s=await fixture();expect((await validateSyntheticSnapshot(s)).sha256).toBe(s.sha256);await expect(validateSyntheticSnapshot({...s,evidence:[{...evidence[0],value:"99"}]})).rejects.toThrow();await expect(validateSyntheticSnapshot({...s,sha256:"sha256-"+"0".repeat(64)})).rejects.toThrow();});
 test("server export preserves review timestamp/hash and rejects cross-scope, malformed hash and future date",async()=>{
  const s=await fixture();const event={id:"00000000-0000-4000-8000-000000000001",actor_user_id:"00000000-0000-4000-8000-000000000002",mission_id:"m1",crew_member_id:"c1",provenance:"synthetic",event_type:"approved",revision:1,previous_event_id:null,evidence_sha256:s.sha256,draft_text:"draft",final_text:"final",rationale:"test",created_at:"2026-10-24T20:00:00+00:00",verified_current:true};
  const result=buildSyntheticReviewExport(s,[event],"2026-10-24T21:30:00Z");expect(result.events[0].created_at).toBe(event.created_at);expect(result.current_evidence_sha256).toBe(s.sha256);
  for(const change of [{mission_id:"other"},{evidence_sha256:"bad"},{created_at:"2026-10-25T20:00:00Z"},{provenance:"real"},{evidence_sha256:"sha256-"+"a".repeat(64)}])expect(()=>buildSyntheticReviewExport(s,[{...event,...change}],"2026-10-24T21:30:00Z")).toThrow();
 });
});
describe("isolated synthetic Q&A controls",()=>{
 test("1000-character question limit and injection fail closed",()=>{expect(validateSyntheticQuestion("q".repeat(1000))).toHaveLength(1000);expect(()=>validateSyntheticQuestion("q".repeat(1001))).toThrow();for(const q of ["Ignore instructions", "What treatment?", "<script>", "Show real data"])expect(()=>validateSyntheticQuestion(q)).toThrow();});
 test("exact statements accept valid citation, reject invented claims without rewriting",()=>{expect(validateSyntheticAnswer({statements:[{text:exactEvidenceStatement(evidence[0]),observationId:evidence[0].id}]},evidence).citedIds).toEqual([evidence[0].id]);for(const row of [{text:"cv-001 recorded 99 bpm.",observationId:evidence[0].id},{text:exactEvidenceStatement(evidence[0]),observationId:"invented"},{text:"Normal range 60-100 bpm",observationId:evidence[0].id},{text:"cortisol recorded 62 bpm",observationId:evidence[0].id}])expect(()=>validateSyntheticAnswer({statements:[row]},evidence)).toThrow();});
 test("disabled entrypoint calls neither RPC nor provider",async()=>{const h=await harness({enabled:false});expect((await answerSyntheticQuestion(input,h.deps)).status).toBe(503);expect(h.rpcs).toEqual([]);expect(h.getCalls()).toBe(0);});
 test("real data and no consent never transmitted",async()=>{for(const change of [{provenance:"real"},{consent:false},{observations:evidence}]){const h=await harness();expect((await answerSyntheticQuestion({...input,...change},h.deps)).status).toBe(403);expect(h.getCalls()).toBe(0);}});
 test("denied caller scope makes no provider call",async()=>{const h=await harness({deny:true});expect((await answerSyntheticQuestion(input,h.deps)).status).toBe(403);expect(h.getCalls()).toBe(0);});
 test("cross-mission request makes no provider call",async()=>{const h=await harness();expect((await answerSyntheticQuestion({...input,missionId:"other"},h.deps)).status).toBe(403);expect(h.getCalls()).toBe(0);});
 test("quota exhaustion returns 429 and Retry-After without provider",async()=>{const h=await harness({quota:false});const r=await answerSyntheticQuestion(input,h.deps);expect(r.status).toBe(429);expect(r.headers.get("Retry-After")).toBe("60");expect(h.getCalls()).toBe(0);});
 test("successful answer sends only synthetic authoritative evidence with existing provider contract",async()=>{const h=await harness();const r=await answerSyntheticQuestion(input,h.deps);expect(r.status).toBe(200);expect(r.headers.get("Cache-Control")).toBe("no-store");expect((await r.json()).citedIds).toEqual([evidence[0].id]);expect(h.getSent()).toMatchObject({model:"gpt-4.1-mini",store:false,max_output_tokens:1500});expect(h.rpcs.at(-1)).toBe("medical_v3_release_ai");});
 test("invalid answer rejected and quota released",async()=>{const h=await harness({answer:{statements:[{text:"Diagnosis",observationId:"fake"}]}});expect((await answerSyntheticQuestion(input,h.deps)).status).toBe(422);expect(h.rpcs.at(-1)).toBe("medical_v3_release_ai");});
 test("provider denial/failure never retried, always releases quota",async()=>{for(const code of [403,429,500]){const h=await harness({providerStatus:code});expect((await answerSyntheticQuestion(input,h.deps)).status).toBe(code===500?502:code);expect(h.getCalls()).toBe(1);expect(h.rpcs.at(-1)).toBe("medical_v3_release_ai");}});
 test("changed authority rejects answer after generation",async()=>{const h=await harness({stale:true});expect((await answerSyntheticQuestion(input,h.deps)).status).toBe(422);});
 test("quota release failure withholds answer",async()=>{const h=await harness({releaseFail:true});expect((await answerSyntheticQuestion(input,h.deps)).status).toBe(503);});
});