"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createResearchExport, normalizeAccession, parseResearchSamples, type ResearchRecord } from "@/domain/nasa-research/import";
type Reply = {accession:string;mode:string;retrievedAt:string;data:unknown};
export function NasaResearchImport() {
 const [accession,setAccession] = useState("OSD-48");
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState("");
 const [metadata,setMetadata] = useState<Reply | null>(null);
 const [samples,setSamples] = useState<ResearchRecord[] | null>(null);
 const [retrievedAt,setRetrievedAt] = useState("");
 async function load(mode:"dataset"|"samples") {
  setBusy(true);setError("");setSamples(null);setMetadata(null);
  try {
   const id = normalizeAccession(accession);
   const res = await fetch(`/api/nasa-research?accession=${encodeURIComponent(id)}&mode=${mode}`,{headers:{Accept:"application/json"},cache:"no-store"});
   const body = await res.json() as Reply & {error?:string};
   if (!res.ok || body.error) throw new Error(body.error ?? "NASA API error");
   if (mode === "samples") {setSamples(parseResearchSamples(body.data,id));setRetrievedAt(body.retrievedAt);} else setMetadata(body);
  } catch (err) {setError(err instanceof Error?err.message:"Import failed");}
  finally {setBusy(false);}
 }
 function download() {
  if (!samples) return;
  const exportData = createResearchExport(accession,samples,retrievedAt);
  const blob = new Blob([JSON.stringify(exportData,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=`mitochondria-${exportData.accession}-research-only.json`;a.click();URL.revokeObjectURL(url);
 }
 return <section aria-label="NASA research dataset import" className="space-y-4"><Card><CardHeader><CardTitle>NASA Research Dataset Import · P35.1</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
  <p className="text-muted-foreground">On-demand NASA OSDR Biological Data API v2. Published research only; not live astronaut telemetry. No personal crew records, clinical rules or mission writes.</p>
  <div className="flex flex-wrap items-center gap-2"><label htmlFor="osdr-accession">OSDR accession</label><input id="osdr-accession" className="rounded border bg-background p-2" value={accession} onChange={e=>setAccession(e.target.value)} placeholder="OSD-48" maxLength={12}/><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy} onClick={()=>void load("dataset")}>Preview dataset</button><button className="rounded border px-3 py-2 disabled:opacity-50" disabled={busy} onClick={()=>void load("samples")}>Import research sample metadata</button></div>
  {busy && <p role="status">Contacting NASA OSDR…</p>}{error && <p role="alert" className="text-destructive">{error}</p>}
  {metadata && <div className="space-y-2"><p>NASA dataset metadata retrieved: {metadata.retrievedAt}</p><pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(metadata.data,null,2).slice(0,15000)}</pre></div>}
  {samples && <div className="space-y-2"><p role="status">{samples.length} research-only sample metadata rows · Retrieved {retrievedAt}</p><p className="text-muted-foreground">Sample metadata are not clinical observations. No identity matching, unit mapping, personal baselines or alert activation is performed.</p><div className="max-h-64 overflow-auto"><table className="w-full text-left"><thead><tr><th>Sample</th><th>Assay</th><th>Organism</th></tr></thead><tbody>{samples.slice(0,50).map((r,i)=><tr key={i}><td className="break-all p-1">{r.sample ?? "unknown"}</td><td className="break-all p-1">{r.assay ?? "unknown"}</td><td className="p-1">{r.organism ?? "unknown"}</td></tr>)}</tbody></table></div><button className="rounded border px-3 py-2" onClick={download}>Download research-only JSON ({samples.length} rows)</button></div>}
 </CardContent></Card></section>;
}
