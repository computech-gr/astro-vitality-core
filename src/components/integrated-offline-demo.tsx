import { useState } from "react";
import { getDemoAcceptanceGates, inspectOfflineDemoArtifact } from "@/domain/mission-access/offline-demo-acceptance";
import { buildIntegratedDemoBundle, DEMO_WORKFLOW_STAGES } from "@/domain/mission-access/offline-demo-workflow";

/** Local rehearsal only. Does not authenticate, provision missions or write health records. */
export function IntegratedOfflineDemo({missionCode}:{missionCode:string}) {
 const [inspection,setInspection]=useState("No file inspected");
 const [showGovernance,setShowGovernance]=useState(false);
 const bundle=buildIntegratedDemoBundle(missionCode);
 const acceptanceGates=getDemoAcceptanceGates();
 const exportBundle=()=>{
  const blob=new Blob([JSON.stringify(bundle,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=`mitochondria-integrated-demo-${missionCode.replace(/[^a-zA-Z0-9_-]/g,"_")}.json`;a.click();URL.revokeObjectURL(url);
 };
 const inspectFile=async(file?:File)=>{
  if(!file)return;
  if(file.size>100000){setInspection("Rejected: maximum 100 KB for local synthetic fixture inspection");return;}
  try { const result=inspectOfflineDemoArtifact(JSON.parse(await file.text()),missionCode);setInspection(result.ok?`Verified offline ${result.kind === "integrated_bundle" ? "integrated bundle" : "synthetic fixture"}: ${result.observationCount} observations for ${result.missionCode}. No import or Cloud write.`:`Rejected: ${result.reason}`); }
  catch {setInspection("Rejected: invalid JSON"); }
 };
 return <section aria-label="Integrated synthetic demo workflow" className="mt-4 rounded-md border border-border p-4">
  <h3 className="text-base font-semibold">Integrated synthetic demo — offline execution</h3>
  <p className="mt-1 text-xs text-muted-foreground">One guided view across identity, documents, devices, four health domains and reporting. Existing destinations retain their own role checks. This does not activate Administrator access or connect Cloud data.</p>
  <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{DEMO_WORKFLOW_STAGES.map((step,index)=><li key={step.id} className="rounded border border-border p-3 text-xs"><a href={step.route} className="font-semibold underline underline-offset-2">{index+1}. {step.title}</a><p className="mt-1 text-muted-foreground">{step.description}</p></li>)}</ol>
  <div className="mt-4 flex flex-wrap items-center gap-3">
   <button type="button" onClick={exportBundle} className="rounded border border-border px-3 py-2 text-xs">Export integrated offline demo bundle (JSON)</button>
   <label className="text-xs">Inspect synthetic dataset or integrated bundle JSON (local only)<input aria-label="Inspect synthetic fixture JSON" className="mt-1 block max-w-full text-xs" type="file" accept=".json,application/json" onChange={event=>{void inspectFile(event.target.files?.[0]);event.currentTarget.value="";}} /></label>
  </div>
  <p role="status" className="mt-2 text-xs text-muted-foreground">{inspection}</p>
  <button type="button" className="mt-3 text-xs underline underline-offset-2" onClick={()=>setShowGovernance(value=>!value)} aria-expanded={showGovernance}> {showGovernance?"Hide":"Show"} activation boundaries</button>
  {showGovernance&&<ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{bundle.governance.map(item=><li key={item}>{item}</li>)}</ul>}
  <div className="mt-4 rounded border border-border p-3" aria-label="Integrated demo acceptance gates">
   <p className="text-sm font-semibold">Integrated demo acceptance gates</p>
   <p className="mt-1 text-xs text-muted-foreground">Local verification is not evidence of backend Administrator access, independent medical approval or a complete NASA demo.</p>
   <ul className="mt-2 space-y-2">{acceptanceGates.map(gate=><li key={gate.id} className="text-xs"><strong>{gate.label}</strong> — {gate.status.replaceAll("_"," ")}<p className="text-muted-foreground">{gate.detail}</p></li>)}</ul>
  </div>
  <p className="mt-2 text-xs text-muted-foreground">MISSION_TEST: offline export and inspection only, no mission mutation. Synthetic files cannot be imported into canonical records by this tool.</p>
 </section>;
}
