import { useEffect, useRef, useState } from "react";
import { Upload, X, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BONE_IMPORT_CSV_TEMPLATE } from "@/domain/bone-health/import";
import { offlineOcrCacheReady } from "@/domain/bone-health/ocr-readiness";
import { BoneHealthDocumentImport } from "./bone-health-document-import";
import { BoneFileQueue, processBoneFile, BONE_FILE_ACCEPT, MAX_BONE_FILES, reviewedBoneEntries, duplicateBoneImportIds, persistReviewedBoneEntries, type QueueItem, type FileReview } from "@/domain/bone-health/file-queue";
import { listBoneEntries, saveBoneEntry } from "@/domain/bone-health/history";
import { authorizeBoneImport, clearRetainedBoneImport, watchBoneImportSignOut } from "@/domain/bone-health/import-authorization";
import { retainBoneImport, restoreBoneImport, type ImportScope } from "@/domain/bone-health/import-session";
import { subscribeMissionIdentity } from "@/infrastructure/mission-identity";
import { useMeasurementProfile } from "@/components/measurement-profile-hook";

export function BoneHealthImport({ missionId, crewMemberId, dataOrigin, onImported }: {
  missionId: string; crewMemberId: string; dataOrigin: "real" | "synthetic"; onImported: () => Promise<void>;
}) {
  // Every mount freshly authorizes the exact scope before restoring synthetic-only review.
  return <ScopedBoneImport key={`${missionId}:${crewMemberId}:${dataOrigin}`} {...{missionId, crewMemberId, dataOrigin, onImported}} />;
}
function ScopedBoneImport({ missionId, crewMemberId, dataOrigin, onImported }: {
  missionId: string; crewMemberId: string; dataOrigin: "real" | "synthetic"; onImported: () => Promise<void>;
}) {
  const profile = useMeasurementProfile();
  const [items, setItems] = useState<QueueItem[]>([]);
  const queue = useRef<BoneFileQueue | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [offlineStatus, setOfflineStatus] = useState("");
  const [checking, setChecking] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const currentScope = useRef<ImportScope | null>(null);
  useEffect(() => {
    alive.current = true;
    watchBoneImportSignOut();
    let epoch = 0;
    const retain = (next: QueueItem[]) => {
      setItems(next);
      if (currentScope.current?.dataOrigin === "synthetic") {
        try { retainBoneImport(window.sessionStorage, currentScope.current, next, profile); } catch { clearRetainedBoneImport(); }
      }
    };
    const process = (file: File, signal: AbortSignal) => processBoneFile(file, signal, profile);
    queue.current = new BoneFileQueue(retain, process);
    const refresh = async (silent = false) => {
      const ticket = ++epoch;
      if (!silent) { setAuthorized(false); setDuplicateConfirmed(false); }
      try {
        const scope = await authorizeBoneImport({ missionId, crewMemberId, dataOrigin });
        if (!alive.current || ticket !== epoch) return;
        if (currentScope.current && currentScope.current.userId !== scope.userId) {
          clearRetainedBoneImport(); queue.current?.dispose(); queue.current = new BoneFileQueue(retain, process);
        }
        const initial = !currentScope.current || currentScope.current.userId !== scope.userId;
        currentScope.current = scope;
        if (dataOrigin === "real") clearRetainedBoneImport();
        else if (initial) queue.current?.restore(restoreBoneImport(window.sessionStorage, scope, profile));
        else if (!silent) for (const item of queue.current?.items ?? []) if (item.review) queue.current?.update(item.id, { ...item.review, rows: item.review.rows.map(row => ({ ...row, selected: false })) });
        setStatus(previous => previous.startsWith("Import authorization unavailable") ? "" : previous);
        setAuthorized(true);
      } catch {
        if (!alive.current || ticket !== epoch) return;
        setAuthorized(false); setDuplicateConfirmed(false);
        currentScope.current = null; clearRetainedBoneImport(); queue.current?.dispose(); queue.current = new BoneFileQueue(retain, process); setItems([]);
        setStatus("Import authorization unavailable or scope denied. Retained review cleared; nothing saved.");
      }
    };
    // Revalidate silently on return, without flashing an unauthorized state or
    // replaying persisted review. Commit still requires fresh authorization.
    // Browsers may emit both focus and visibilitychange for a single tab return.
    // Coalesce these signals; retain the mounted review UI while reauthorizing.
    // One silent check at a time. Identity events arriving mid-check queue exactly
    // one follow-up (never dropped, so account switches are always re-verified);
    // paired focus/visibilitychange signals within 1.2 s collapse into one.
    let silentInFlight = false;
    let pending = false;
    let lastFocusRefresh = 0;
    const runSilent = () => {
      if (silentInFlight) { pending = true; return; }
      silentInFlight = true;
      lastFocusRefresh = Date.now();
      void refresh(true).finally(() => {
        silentInFlight = false;
        if (pending && alive.current) { pending = false; runSilent(); }
      });
    };
    const focus = () => {
      if (document.visibilityState === "hidden" || silentInFlight) return;
      if (Date.now() - lastFocusRefresh < 1200) return;
      runSilent();
    };
    // Auth events (token refresh / session re-emit on tab return) revalidate silently;
    // a different account or denial still clears the queue inside refresh().
    const subscription = subscribeMissionIdentity(() => { setDuplicateConfirmed(false); runSilent(); });
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    void refresh();
    return () => { alive.current = false; epoch++; currentScope.current = null; subscription(); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); queue.current?.dispose(); queue.current = null; };
  }, [missionId, crewMemberId, dataOrigin, profile]);
  function update(id: string, review: FileReview) { if (saving.current) return; setDuplicateConfirmed(false); queue.current?.update(id, review); }
  async function commit() {
    if (saving.current || !authorized) return;
    saving.current = true; setBusy(true);
    let saved = 0;
    try {
      const scope = await authorizeBoneImport({ missionId, crewMemberId, dataOrigin });
      if (!alive.current || scope.userId !== currentScope.current?.userId) throw new Error("Account or scope changed; nothing saved.");
      const entries = reviewedBoneEntries(items.flatMap(item => item.review?.rows ?? []), { missionId, crewMemberId, dataOrigin }, profile);
      if (!entries.length) throw new Error("Select and verify at least one measurement.");
      const history = await listBoneEntries(missionId, crewMemberId, profile);
      if (!alive.current || currentScope.current?.userId !== scope.userId) throw new Error("Authorization changed; nothing saved.");
      const duplicates = duplicateBoneImportIds(entries, history);
      if (duplicates.length && !duplicateConfirmed) throw new Error(`${duplicates.length} potential duplicate(s). Compare history and confirm duplicates before saving.`);
      await persistReviewedBoneEntries(entries, async entry => {
        if (!alive.current) throw new Error("Scope changed; remaining rows were not saved.");
        const fresh = await authorizeBoneImport({ missionId, crewMemberId, dataOrigin });
        if (!alive.current || fresh.userId !== scope.userId || currentScope.current?.userId !== scope.userId) throw new Error("Authorization changed; remaining rows were not saved.");
        await saveBoneEntry(entry, profile);
      }, id => {
        saved++;
        for (const item of queue.current?.items ?? []) if (item.review) queue.current?.update(item.id, { ...item.review, rows: item.review.rows.map(row => row.id === id ? { ...row, selected: false, saved: true } : row) });
      });
      if (alive.current) setStatus(`${saved} results saved to encrypted append-only history. Original files were not stored.`);
    } catch (error) {
      if (alive.current) setStatus(`${saved} saved. ${error instanceof Error ? error.message : "Save failed"} Successful rows cannot be selected again; remaining rows still require review.`);
    } finally {
      if (saved && alive.current) { try { await onImported(); } catch { setStatus(`${saved} saved; history refresh failed. Successful rows remain locked against retry.`); } }
      saving.current = false;
      if (alive.current) { setBusy(false); setDuplicateConfirmed(false); }
    }
  }
  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([BONE_IMPORT_CSV_TEMPLATE], {type:"text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = `${profile.eventPrefix}-import-template.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="mt-8 border-t border-border pt-6" aria-label="Import laboratory results">
    <h2 className="text-xl font-semibold">Import laboratory results</h2>
    <p className="mt-2 text-sm text-muted-foreground">Local only · {dataOrigin} · no original file upload or storage. Compare extracted measurements with the report before saving.</p>
      <details className="mt-4 rounded-lg border border-border p-4">
        <summary className="cursor-pointer font-semibold">CSV format guide</summary>
        <p className="mt-3 text-sm">
          Use a UTF-8 comma-separated <code>.csv</code> file, one measurement per row. The first row
          must contain the exact English column names below. Do not use semicolons or Excel's
          localized CSV separator.
        </p>
        <div className="mt-3 overflow-x-auto">
          <code className="block whitespace-nowrap text-xs">{BONE_IMPORT_CSV_TEMPLATE.trim()}</code>
        </div>
        <p className="mt-3 text-sm">
          <strong>Required:</strong> <code>variable</code> (exact catalog ID such as{" "}
          <code>{profile.variables[0]?.id}</code>, or exact catalog name), <code>value</code> (numeric, dot decimal
          separator), <code>unit</code> (as reported), <code>observed_at</code> (ISO 8601
          date/time), <code>source</code> (laboratory or original source).
        </p>
        <p className="mt-2 text-sm">
          <strong>Optional:</strong> <code>specimen</code>, <code>assay_method</code>,{" "}
          <code>notes</code>. Leave empty if unknown; do not invent information. Dates should
          include an explicit timezone when a time is provided.
        </p>
        <p className="mt-2 text-sm">
          Example — <strong>synthetic demonstration only</strong>, not a reference range or medical
          recommendation:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
          {profile.csvExample}
        </pre>
        <p className="mt-2 text-sm">
          If a field contains a comma, enclose it in double quotes. Maximum 200 result rows; 2 MB
          file picker limit. Rows with unknown or ambiguous variables, missing required fields or
          invalid dates are rejected. All accepted rows remain subject to your review before saving.
        </p>
        <Button
          type="button"
          onClick={downloadTemplate}
          className="mt-3 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Download blank CSV template
        </Button>
      </details>

    <fieldset disabled={!authorized} className="min-w-0 border-0 p-0">
    {!authorized && <p role="status" className="mt-3 text-sm">Verifying import authorization…</p>}
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <input ref={picker} type="file" multiple accept={BONE_FILE_ACCEPT} className="hidden" aria-label="Laboratory files" disabled={busy || items.length >= MAX_BONE_FILES} onChange={event => {
        const skipped = queue.current?.add(Array.from(event.currentTarget.files ?? [])) ?? 0;
        setStatus(skipped ? `${skipped} file(s) not added: maximum ${MAX_BONE_FILES}. Remove files to make room.` : "Files queued locally. Nothing saved.");
        event.currentTarget.value = "";
      }} />
      <Button type="button" disabled={busy || items.length >= MAX_BONE_FILES} onClick={() => picker.current?.click()}><Upload aria-hidden="true" />Choose laboratory files</Button>
      <span className="text-sm text-muted-foreground">CSV, PDF, PNG, JPG, JPEG, WebP · up to 10 files · one processed at a time</span>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">CSV: 2 MB; documents: 12 MB, PDFs: 12 pages; images: 20 megapixels. Each job has a 90-second limit.</p>
    <p className="mt-3 text-sm">OCR is needed for images and scanned PDF pages, not CSV or selectable-text PDF pages. First OCR use may need internet for language resources.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={checking} onClick={async () => {
        setChecking(true);
        try { const ready = await offlineOcrCacheReady(); if (alive.current) setOfflineStatus(ready ? "OCR assets found in local cache; execution and airplane-mode readiness are not verified." : "OCR assets are not fully cached. Images/scanned pages may fail offline; CSV and selectable-text PDFs remain available."); }
        catch { if (alive.current) setOfflineStatus("OCR cache check unavailable. This does not block CSV or selectable-text PDFs."); }
        finally { if (alive.current) setChecking(false); }
      }}>{checking ? "Checking…" : "Check offline OCR readiness"}</Button>
      <span role="status" className="text-sm text-muted-foreground">{offlineStatus}</span>
    </div>
    <ul className="mt-4 space-y-3" aria-label="File processing queue">
      {items.map(item => <li key={item.id} className="border-b border-border pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="break-all font-semibold">{item.name}</h3><p className="text-sm">{item.kind} · {item.status}</p><p role="status" className="text-sm text-muted-foreground">{item.detail}</p></div>
          <div className="flex shrink-0 gap-1">
            {(item.status === "queued" || item.status === "processing") && <Button type="button" size="icon" variant="outline" disabled={busy} aria-label={`Cancel ${item.name}`} title={`Cancel ${item.name}`} onClick={() => queue.current?.cancel(item.id)}><Ban aria-hidden="true" /></Button>}
            <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={`Remove ${item.name}`} title={`Remove ${item.name}`} onClick={() => { queue.current?.remove(item.id); setDuplicateConfirmed(false); }}><X aria-hidden="true" /></Button>
          </div>
        </div>
        {!item.file && <p className="mt-2 text-sm">Re-select original file to reprocess</p>}
        {item.review && <BoneHealthDocumentImport review={item.review} fileId={item.id} disabled={busy || !authorized} onChange={review => update(item.id, review)} />}
      </li>)}
    </ul>
    {items.some(item => item.review?.rows.some(row => !row.saved)) && <div className="mt-4 space-y-3">
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={duplicateConfirmed} onChange={event => setDuplicateConfirmed(event.target.checked)} />I compared potential duplicates with history and confirm any repeated measurements.</label>
      <Button type="button" disabled={busy || !items.some(item => item.review?.rows.some(row => row.selected && !row.saved))} onClick={() => void commit()}>{busy ? "Saving…" : "Confirm selected results and save"}</Button>
    </div>}
    <p role="status" className="mt-3 text-sm">{status}</p>
    </fieldset>
  </section>;
}
