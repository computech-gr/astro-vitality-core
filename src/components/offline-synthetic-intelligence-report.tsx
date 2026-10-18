import { useMemo, useState } from "react";
import { buildOfflineDemoReport, offlineDemoReportCsv } from "@/domain/mission-access/offline-demo-report";
import { buildSyntheticDemoDataset } from "@/domain/mission-access/synthetic-demo-dataset";

/** Explicitly isolated from mission Cloud persistence and RBAC changes. */
export function OfflineSyntheticIntelligenceReport({missionCode}:{missionCode:string}) {
 const report=useMemo(()=>buildOfflineDemoReport(buildSyntheticDemoDataset(missionCode)),[missionCode]);
 const [domain,setDomain]=useState("all");
 const filtered=report.metrics.filter(m=>domain==="all"||m.domain===domain);
 const save=(format:"json"|"csv")=>{
   const payload=format==="json"?JSON.stringify(report,null,2):offlineDemoReportCsv(report);
   const blob=new Blob([payload],{type:format==="json"?"application/json":"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const link=document.createElement("a");link.href=url;link.download=`mitochondria-offline-synthetic-report-${missionCode.replace(/[^a-zA-Z0-9_-]/g,"_")}.${format}`;link.click();URL.revokeObjectURL(url);
 };
 return <section className="mt-4 rounded-md border border-border p-4" aria-label="Offline synthetic intelligence report">
   <h3 className="text-base font-semibold">Astronaut Health Intelligence — synthetic offline report</h3>
   <p className="mt-1 text-xs text-muted-foreground">Fictional crew {report.subjectId} · {report.domainCount} domains · {report.metrics.length} illustrative metrics · {report.observationCount} observations. No clinical ranges, diagnoses, alerts, or medical advice. Not a canonical mission record.</p>
   <div className="mt-3 flex flex-wrap items-end gap-2">
     <label className="text-xs">Domain filter <select aria-label="Report domain filter" value={domain} onChange={e=>setDomain(e.target.value)} className="mt-1 block rounded border border-border bg-background p-2 text-sm"><option value="all">All domains</option>{["bone","cardiovascular","immune","behavioral"].map(d=><option key={d} value={d}>{d}</option>)}</select></label>
     <button type="button" className="rounded border border-border px-3 py-2 text-xs" onClick={()=>save("json")}>Export report JSON</button>
     <button type="button" className="rounded border border-border px-3 py-2 text-xs" onClick={()=>save("csv")}>Export observations CSV</button>
     <button type="button" className="rounded border border-border px-3 py-2 text-xs" onClick={()=>window.print()}>Print / Save PDF</button>
   </div>
   <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs"><thead><tr className="border-b border-border"><th className="p-2">Domain / metric</th><th className="p-2">Unit</th><th className="p-2">Day 0</th><th className="p-2">Day 7</th><th className="p-2">Day 14</th><th className="p-2">Arithmetic difference</th></tr></thead><tbody>{filtered.map(m=><tr className="border-b border-border/50" key={`${m.domain}-${m.metric}`}><th scope="row" className="p-2 font-medium">{m.domain} / {m.metric}</th><td className="p-2">{m.unit}</td>{[0,7,14].map(day=><td key={day} className="p-2 tabular-nums">{m.points.find(p=>p.day===day)?.value ?? "Missing"}</td>)}<td className="p-2 tabular-nums">{m.delta>0?"+":""}{m.delta} ({m.direction})</td></tr>)}</tbody></table></div>
   <p className="mt-3 text-xs font-semibold">Provenance and limitations</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{report.limitations.map(item=><li key={item}>{item}</li>)}</ul>
   <p className="mt-2 text-xs text-muted-foreground">Exports and printing are browser-local, including on MISSION_TEST; no mission mutation, device connection, document ingestion, backend privilege or Cloud request. PDF uses your browser's print-to-PDF function.</p>
 </section>;
}
