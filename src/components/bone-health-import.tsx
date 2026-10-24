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
  async function load(file: File) {
    setRows([]); setErrors([]); setStatus("");
    if (file.size > 2_000_000) { setStatus("File too large (2 MB maximum)."); return; }
    if (!/\.csv$/i.test(file.name)) {setStatus("Supported structured import: CSV. PDF/images require manual transcription until reviewed OCR is implemented.");return;}
    try {
      const text = await file.text(); const result = parseBoneImport(text);
      setRows(result.candidates); setErrors(result.rejected);
      setStatus(`${result.candidates.length} candidates require your confirmation (all start unchecked). ${result.rejected.length} rows rejected. Nothing has been saved.`);
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
  function downloadTemplate() {
    const blob = new Blob([BONE_IMPORT_CSV_TEMPLATE], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "bone-health-import-template.csv";
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }
  return <section className="mt-8 rounded-xl border border-border p-5">
    <h2 className="text-xl font-semibold">Import laboratory results</h2>
    <p className="mt-2 text-sm text-muted-foreground">CSV results can be mapped to the 63 research variables and reviewed before encrypted storage. No automatic medical interpretation. The mission, crew and real/synthetic selection above apply to every imported row.</p>
    <details className="mt-4 rounded-lg border border-border p-4" open>
      <summary className="cursor-pointer font-semibold">CSV format guide</summary>
      <p className="mt-3 text-sm">Use a UTF-8 comma-separated <code>.csv</code> file, one measurement per row. The first row must contain the exact English column names below. Do not use semicolons or Excel's localized CSV separator.</p>
      <div className="mt-3 overflow-x-auto"><code className="block whitespace-nowrap text-xs">{BONE_IMPORT_CSV_TEMPLATE.trim()}</code></div>
      <p className="mt-3 text-sm"><strong>Required:</strong> <code>variable</code> (exact catalog ID such as <code>bone-001</code>, or exact catalog name), <code>value</code> (numeric, dot decimal separator), <code>unit</code> (as reported), <code>observed_at</code> (ISO 8601 date/time), <code>source</code> (laboratory or original source).</p>
      <p className="mt-2 text-sm"><strong>Optional:</strong> <code>specimen</code>, <code>assay_method</code>, <code>notes</code>. Leave empty if unknown; do not invent information. Dates should include an explicit timezone when a time is provided.</p>
      <p className="mt-2 text-sm">Example — <strong>synthetic demonstration only</strong>, not a reference range or medical recommendation:</p>
      <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">{'variable,value,unit,observed_at,source,specimen,assay_method,notes\nbone-001,0.42,ng/mL,2026-10-01T09:00:00Z,Demo Lab,serum,,synthetic example\nbone-009,48,ug/L,2026-10-01T09:00:00Z,Demo Lab,serum,,synthetic example'}</pre>
      <p className="mt-2 text-sm">If a field contains a comma, enclose it in double quotes. Maximum 200 result rows; 2 MB file picker limit. Rows with unknown or ambiguous variables, missing required fields or invalid dates are rejected. All accepted rows remain subject to your review before saving.</p>
      <button type="button" onClick={downloadTemplate} className="mt-3 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Download blank CSV template</button>
    </details>
    <label className="mt-4 block">Choose CSV<input className="mt-2 block w-full" type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);e.currentTarget.value="";}} /></label>
    <BoneHealthDocumentImport missionId={missionId} crewMemberId={crewMemberId} dataOrigin={dataOrigin} onImported={onImported} />
    {status && <p role="status" className="mt-3 text-sm">{status}</p>}
    {errors.length>0 && <details className="mt-3 text-sm"><summary>Rejected rows ({errors.length})</summary><ul className="list-disc pl-5">{errors.map((e,i)=><li key={i}>{e}</li>)}</ul></details>}
    {rows.length>0 && <><div className="mt-4 max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Use</th><th>Variable</th><th>Value</th><th>Date</th><th>Source</th></tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-t"><td><input type="checkbox" checked={r.selected} aria-label={`Import row ${i+1}`} onChange={e=>setRows(prev=>prev.map((x,j)=>j===i?{...x,selected:e.target.checked}:x))}/></td><td>{BONE_HEALTH_VARIABLES.find(v=>v.id===r.variableId)?.name}</td><td>{r.value} {r.unit}</td><td>{r.observedAt.slice(0,10)}</td><td>{r.sourceLabel}</td></tr>)}</tbody></table></div><button type="button" disabled={busy} onClick={()=>void commit()} className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy?"Saving…":"Confirm selected results and save"}</button></>}
  </section>;
}
