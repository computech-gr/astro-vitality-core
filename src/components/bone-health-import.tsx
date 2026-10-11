import { BoneHealthDocumentImport } from "./bone-health-document-import";
import { useState } from "react";
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import { BONE_IMPORT_CSV_TEMPLATE, parseBoneImport, type BoneImportCandidate } from "@/domain/bone-health/import";
import { saveBoneEntry } from "@/domain/bone-health/history";

export function BoneHealthImport({ missionId, crewMemberId, dataOrigin, onImported }: {
  missionId: string; crewMemberId: string; dataOrigin: "real" | "synthetic"; onImported: () => Promise<void>;
}) {
  const [rows,setRows] = useState<BoneImportCandidate[]>([]);
  const [errors,setErrors] = useState<string[]>([]);
  const [status,setStatus] = useState("");
  const [busy,setBusy] = useState(false);
  const [documentName,setDocumentName] = useState("");
  async function load(file: File) {
    setRows([]); setErrors([]); setStatus(""); setDocumentName("");
    if (file.size > 2_000_000) { setStatus("File too large (2 MB maximum)."); return; }
    if (/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) {
      setDocumentName(file.name);
      setStatus("PDF/image selected. Automatic text extraction and OCR are not available in this offline build. No data was extracted or saved. Review the document yourself and enter results manually, or export verified results as CSV.");
      return;
    }
    if (!/\.csv$/i.test(file.name)) {setStatus("Supported structured import: CSV. PDF/images require manual transcription until reviewed OCR is implemented.");return;}
    try {
      const text = await file.text(); const result = parseBoneImport(text);
      setRows(result.candidates); setErrors(result.rejected);
      setStatus(`${result.candidates.length} candidates require your confirmation. ${result.rejected.length} rows rejected. Nothing has been saved.`);
    } catch(e) {setStatus(e instanceof Error ? e.message : "Unable to parse file.");}
  }
  async function commit() {
    if (!missionId.trim() || !crewMemberId.trim()) {setStatus("Mission and crew identifiers required.");return;}
    const chosen=rows.filter(r=>r.selected); if(!chosen.length) {setStatus("Select at least one row.");return;}
    setBusy(true); let saved=0;
    try {
      for (const r of chosen) {
        await saveBoneEntry({id:crypto.randomUUID(),missionId:missionId.trim(),crewMemberId:crewMemberId.trim(),variableId:r.variableId,value:r.value,unit:r.unit,observedAt:r.observedAt,sourceLabel:r.sourceLabel,specimen:r.specimen,assayMethod:r.assayMethod,notes:`Imported from user-reviewed CSV. ${r.notes}`.trim(),dataOrigin});
        saved++;
      }
      setRows([]);await onImported();setStatus(`${saved} results saved to encrypted append-only history. No health interpretation was performed.`);
    } catch(e) {setStatus(`${saved} saved before error: ${e instanceof Error ? e.message : "Unknown error"}. Check history before retrying to avoid duplicates.`);if(saved)await onImported();}
    finally {setBusy(false);}
  }
  return <section className="mt-8 rounded-xl border border-border p-5">
    <h2 className="text-xl font-semibold">Import laboratory results</h2>
    <p className="mt-2 text-sm text-muted-foreground">CSV results can be mapped to the 63 research variables and reviewed before encrypted storage. No automatic medical interpretation. The mission, crew and real/synthetic selection above apply to every imported row.</p>
    <p className="mt-2 text-sm text-muted-foreground">CSV headers: <code>{BONE_IMPORT_CSV_TEMPLATE.trim()}</code></p>
    <label className="mt-4 block">Choose CSV<input className="mt-2 block w-full" type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.currentTarget.value="";}} /></label>
    <BoneHealthDocumentImport missionId={missionId} crewMemberId={crewMemberId} dataOrigin={dataOrigin} onImported={onImported} />
    {documentName && <p className="mt-2 text-sm">Selected document: {documentName}. No document bytes are uploaded or stored.</p>}
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    {errors.length>0 && <details className="mt-3 text-sm"><summary>Rejected rows ({errors.length})</summary><ul className="list-disc pl-5">{errors.map((e,i)=><li key={i}>{e}</li>)}</ul></details>}
    {rows.length>0 && <><div className="mt-4 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Use</th><th>Variable</th><th>Value</th><th>Date</th><th>Source</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-t"><td><input type="checkbox" checked={r.selected} aria-label={`Import row ${i+1}`} onChange={e=>setRows(prev=>prev.map((x,j)=>j===i?{...x,selected:e.target.checked}:x))}/></td><td>{BONE_HEALTH_VARIABLES.find(v=>v.id===r.variableId)?.name}</td><td>{r.value} {r.unit}</td><td>{r.observedAt.slice(0,10)}</td><td>{r.sourceLabel}</td></tr>)}</tbody></table></div><button type="button" disabled={busy} onClick={()=>void commit()} className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy?"Saving…":"Confirm selected results and save"}</button></>}
  </section>;
}
