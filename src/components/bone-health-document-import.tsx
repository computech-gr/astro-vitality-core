import { useState } from "react";
import { offlineOcrCacheReady } from "@/domain/bone-health/ocr-readiness";
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import { extractBoneDocument, suggestBoneDocumentMatches, type DocumentMatch } from "@/domain/bone-health/document-extraction";
import { saveBoneEntry } from "@/domain/bone-health/history";

export function BoneHealthDocumentImport({missionId,crewMemberId,dataOrigin,onImported}: {missionId:string;crewMemberId:string;dataOrigin:"real"|"synthetic";onImported:()=>Promise<void>}) {
  const [matches,setMatches]=useState<DocumentMatch[]>([]);
  const [text,setText]=useState("");
  const [draft,setDraft]=useState("");
  const [date,setDate]=useState("");
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  const [source,setSource]=useState("");
  const [offlineStatus,setOfflineStatus]=useState("");
  async function load(file:File) {
    setMatches([]);setText("");setDraft("");setSource(file.name);setBusy(true);setStatus("Extracting locally; no upload…");
    try {
      const result=await extractBoneDocument(file);
      setText(result.text);setDraft(result.text);
      const suggested=suggestBoneDocumentMatches(result.text,file.name);
      setMatches(suggested);
      setStatus(`${result.method}: ${result.pages} page(s), ${suggested.length} conservative suggestions. All unchecked. ${result.warnings.join(" ")} Edit extracted text or use manual entry for unmatched values.`);
    } catch(error) {setStatus(error instanceof Error?error.message:"Unable to extract document.");}
    finally {setBusy(false);}
  }
  async function save() {
    if(!missionId.trim()||!crewMemberId.trim()||!date||!Number.isFinite(Date.parse(date))) {setStatus("Mission, crew and examination date are required.");return;}
    const selected=matches.filter(m=>m.selected);
    if(!selected.length){setStatus("Select and verify at least one result.");return;}
    setBusy(true);let count=0;
    try {
      for(const m of selected) {
        if(!m.unit.trim()||!Number.isFinite(m.value)) throw new Error("A selected result has an invalid value or unit.");
        await saveBoneEntry({id:crypto.randomUUID(),missionId:missionId.trim(),crewMemberId:crewMemberId.trim(),variableId:m.variableId,value:m.value,unit:m.unit,observedAt:new Date(date).toISOString(),sourceLabel:source,specimen:m.specimen,assayMethod:m.assayMethod,notes:"Human-confirmed document extraction. No automated clinical interpretation.",dataOrigin});
        count++;
      }
      setMatches([]);setText("");setDraft("");await onImported();setStatus(`${count} confirmed results stored in encrypted append-only history. The original document was not stored.`);
    } catch(error) {setStatus(`${count} stored before failure: ${error instanceof Error?error.message:"Unknown error"}. Check history before retrying.`);if(count)await onImported();}
    finally {setBusy(false);}
  }
  return <section className="mt-6 rounded-xl border border-border p-5">
    <h3 className="font-semibold">PDF & scanned medical report extraction (experimental)</h3>
    <p className="mt-2 text-sm text-muted-foreground">Runs on this device. Selectable PDF text is supported; scanned PDFs and images use on-device OCR (browser TextDetector or Tesseract fallback). First use may require downloading OCR language resources; offline availability is not guaranteed until those resources are cached. No automatic medical decisions. No original report upload or storage. Always compare results with the report before saving.</p>
    <div className="mt-3 flex items-center gap-3">
      <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>{void offlineOcrCacheReady().then(ready=>setOfflineStatus(ready?"OCR assets found in local browser cache (not a complete airplane-mode test).":"OCR assets are not fully cached. Scanned reports may require internet access."));}}>Check offline OCR readiness</button>
      <span role="status" className="text-xs text-muted-foreground">{offlineStatus}</span>
    </div>
    <input className="mt-3 block w-full" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void load(file);e.currentTarget.value="";}} />
    <p role="status" className="mt-2 text-sm">{status}</p>
    {text && <div className="mt-3 space-y-2">
      <label className="block text-sm" htmlFor="bone-extracted-text">Review and correct extracted text (local only)</label>
      <textarea id="bone-extracted-text" className="w-full rounded border bg-background p-2 font-mono text-xs" rows={6} maxLength={100000} value={draft} onChange={e=>setDraft(e.target.value)} aria-describedby="bone-extracted-note" />
      <p id="bone-extracted-note" className="text-xs text-muted-foreground">Compare every number and unit with the original report. Editing this text does not save medical results.</p>
      <button type="button" disabled={busy} className="rounded border px-3 py-2 text-sm" onClick={()=>{setMatches(suggestBoneDocumentMatches(draft,source));setStatus("Suggestions refreshed from reviewed text. All candidates are unchecked; confirm values and units against the original report.");}}>Recheck corrected text</button>
    </div>}
    {matches.length>0 && <><label className="mt-3 block text-sm">Examination date (verify against original)<input className="mt-1 block rounded border p-2" type="date" value={date} onChange={e=>setDate(e.target.value)} /></label><div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Confirm</th><th>Variable</th><th>Value</th><th>Unit</th><th>Original line</th></tr></thead><tbody>{matches.map((m,i)=><tr className="border-t" key={i}><td><input aria-label={`Confirm extracted result ${i+1}`} type="checkbox" checked={m.selected} onChange={e=>setMatches(prev=>prev.map((x,j)=>i===j?{...x,selected:e.target.checked}:x))}/></td><td>{BONE_HEALTH_VARIABLES.find(v=>v.id===m.variableId)?.name}</td><td><input className="w-24 rounded border p-1" type="number" step="any" value={m.value} onChange={e=>setMatches(prev=>prev.map((x,j)=>i===j?{...x,value:Number(e.target.value)}:x))}/></td><td><input className="w-24 rounded border p-1" value={m.unit} onChange={e=>setMatches(prev=>prev.map((x,j)=>i===j?{...x,unit:e.target.value}:x))}/></td><td className="max-w-60 truncate" title={m.rawLine}>{m.rawLine}</td></tr>)}</tbody></table></div><button type="button" disabled={busy} className="mt-3 rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" onClick={()=>void save()}>Save confirmed results</button></>}
  </section>;
}
