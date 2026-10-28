import { Button } from "@/components/ui/button";
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import type { FileReview, ReviewRow } from "@/domain/bone-health/file-queue";

/** Per-file human review only. The parent queue owns selection and scoped persistence. */
export function BoneHealthDocumentImport({ review, fileId, disabled, onChange }: {
  review: FileReview; fileId: string; disabled: boolean; onChange: (review: FileReview) => void;
}) {
  function edit(id: string, patch: Partial<ReviewRow>) {
    onChange({ ...review, rows: review.rows.map(row => row.id === id && !row.saved ? { ...row, ...patch } : row) });
  }
  const hasSaved = review.rows.some(row => row.saved);
  return <div className="mt-3 space-y-3">
    {review.errors.length > 0 && <div role="alert"><strong>Errors / warnings ({review.errors.length})</strong><ul className="list-disc pl-5 text-sm">{review.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
    {review.text && <details>
      <summary>Review extracted text</summary>
      <label htmlFor={`text-${fileId}`} className="mt-2 block text-sm">Review and correct extracted text (local only)</label>
      <textarea id={`text-${fileId}`} rows={6} maxLength={100000} disabled={disabled || hasSaved} className="mt-2 w-full rounded border border-input bg-background p-2 text-sm" value={review.text} onChange={event => onChange({ ...review, text: event.target.value, rows: review.rows.map(row => ({ ...row, selected: false })) })} />
      <Button type="button" variant="outline" className="mt-2" disabled={disabled || hasSaved} onClick={() => {
        const result = parseBoneCorrectedText(review.text, review.rows[0]?.sourceLabel ?? "");
        onChange({ ...review, errors: result.errors, rows: result.matches.map(row => ({ ...row, id: crypto.randomUUID() })) });
      }}>Recheck corrected text</Button>
    </details>}
    <h4 className="font-medium">Human measurement review</h4>
    {!review.rows.length && <p className="text-sm text-muted-foreground">No catalog-matched measurements. Correct extracted text or use manual entry; nothing saved.</p>}
    <div className="space-y-3">
      {review.rows.map((row, index) => <fieldset key={row.id} disabled={disabled || row.saved} className="border border-border p-3">
        <legend className="px-1 text-sm">{BONE_HEALTH_VARIABLES.find(variable => variable.id === row.variableId)?.name} · {row.variableId}{row.saved ? " · Saved" : ""}</legend>
        {row.rawLine && <p className="mb-2 break-words text-xs text-muted-foreground">Original line: {row.rawLine}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Value<input aria-label={`Value ${fileId} ${index + 1}`} type="number" step="any" className="mt-1 w-full rounded border border-input bg-background p-2" value={Number.isFinite(row.value) ? row.value : ""} onChange={event => edit(row.id, {value:event.target.value === "" ? NaN : Number(event.target.value), selected:false})} /></label>
          <label className="text-sm">Unit (as reported)<input className="mt-1 w-full rounded border border-input bg-background p-2" value={row.unit} onChange={event => edit(row.id, {unit:event.target.value, selected:false})} /></label>
          <label className="text-sm">Observation date / time (ISO 8601)<input className="mt-1 w-full rounded border border-input bg-background p-2" placeholder="2026-10-28T07:18:00Z" value={row.observedAt} onChange={event => edit(row.id, {observedAt:event.target.value, selected:false})} /></label>
          <label className="text-sm">Lab / original source<input className="mt-1 w-full rounded border border-input bg-background p-2" value={row.sourceLabel} onChange={event => edit(row.id, {sourceLabel:event.target.value, selected:false})} /></label>
          <label className="text-sm">Specimen / modality<input className="mt-1 w-full rounded border border-input bg-background p-2" value={row.specimen} onChange={event => edit(row.id, {specimen:event.target.value, selected:false})} /></label>
          <label className="text-sm">Assay / method<input className="mt-1 w-full rounded border border-input bg-background p-2" value={row.assayMethod} onChange={event => edit(row.id, {assayMethod:event.target.value, selected:false})} /></label>
          <label className="text-sm sm:col-span-2">Notes<textarea className="mt-1 w-full rounded border border-input bg-background p-2" value={row.notes} onChange={event => edit(row.id, {notes:event.target.value, selected:false})} /></label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={row.selected} onChange={event => edit(row.id, {selected:event.target.checked})} />I verified this measurement, unit, date and source against the original.</label>
      </fieldset>)}
    </div>
  </div>;
}
