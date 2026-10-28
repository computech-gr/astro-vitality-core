import { Button } from "@/components/ui/button";
import { Fragment, useId, useState } from "react";
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import { parseBoneCorrectedText } from "@/domain/bone-health/document-extraction";
import { applyBoneSharedObservationTimestamp, isBoneSharedObservationTimestamp, boneReviewIssue, selectBoneReviewRows } from "@/domain/bone-health/review-selection";
import type { FileReview, ReviewRow } from "@/domain/bone-health/file-queue";

/** Per-file human review only. The parent queue owns selection and scoped persistence. */
export function BoneHealthDocumentImport({ review, fileId, disabled, onChange }: {
  review: FileReview; fileId: string; disabled: boolean; onChange: (review: FileReview) => void;
}) {
  function edit(id: string, patch: Partial<ReviewRow>) {
    onChange({ ...review, rows: review.rows.map(row => row.id === id && !row.saved ? { ...row, ...patch } : row) });
  }
  const detailsId = useId();
  const [corrected, setCorrected] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [sharedObservedAt, setSharedObservedAt] = useState("");
  const [confirmedRows, setConfirmedRows] = useState("");
  const hasSaved = review.rows.some(row => row.saved);
  const unsaved = review.rows.filter(row => !row.saved);
  const eligible = unsaved.filter(row => boneReviewIssue(row) === null);
  const allVerified = eligible.length > 0 && eligible.every(row => row.selected);
  const missingDates = unsaved.filter(row => !row.observedAt.trim());
  const validSharedDate = isBoneSharedObservationTimestamp(sharedObservedAt);
  const confirmationScope = JSON.stringify([fileId, sharedObservedAt, review.rows]);
  const confirmSharedDate = confirmedRows === confirmationScope;
  function verifyAll(checked: boolean) {
    onChange({ ...review, rows: selectBoneReviewRows(review.rows, checked) });
  }
  return <div className="mt-3 space-y-3">
    {review.errors.length > 0 && <div role="alert"><strong>Errors / warnings ({review.errors.length})</strong><ul className="list-disc pl-5 text-sm">{review.errors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
    {review.text && <details>
      <summary>Review extracted text</summary>
      <label htmlFor={`text-${fileId}`} className="mt-2 block text-sm">Review and correct extracted text (local only)</label>
      <textarea id={`text-${fileId}`} rows={6} maxLength={100000} disabled={disabled || hasSaved} className="mt-2 w-full rounded border border-input bg-background p-2 text-sm" value={review.text} onChange={event => { setCorrected(true); onChange({ ...review, text: event.target.value, rows: review.rows.map(row => ({ ...row, selected: false })) }); }} />
      <Button type="button" variant="outline" className="mt-2" disabled={disabled || hasSaved || !corrected} onClick={() => {
        setCorrected(false);
        const result = parseBoneCorrectedText(review.text, review.rows[0]?.sourceLabel ?? "");
        onChange({ ...review, errors: result.errors, rows: result.matches.map(row => ({ ...row, id: crypto.randomUUID() })) });
      }}>Recheck corrected text</Button>
    </details>}
    <h4 className="font-medium">Human measurement review</h4>
    {!review.rows.length && <p className="text-sm text-muted-foreground">No catalog-matched measurements. Correct extracted text or use manual entry; nothing saved.</p>}
    {unsaved.length > 0 && <p className="text-sm text-muted-foreground">{eligible.length} eligible · {unsaved.length - eligible.length} require corrections · {eligible.filter(row => row.selected).length} verified</p>}
    {missingDates.length > 0 && <section aria-label="Shared observation date for this file" className="space-y-2 text-sm">
      <p className="font-medium">{missingDates.length} measurement(s) are missing an observation date.</p>
      <p className="text-muted-foreground">Only use a shared date if the original report explicitly confirms the same observation time for every missing row. Never substitute the import time or today's date.</p>
      <label className="block">Report observation time (ISO 8601 with timezone)
        <input type="text" placeholder="2026-10-28T06:32:00Z" value={sharedObservedAt} disabled={disabled} onChange={event => { setSharedObservedAt(event.target.value); setConfirmedRows(""); }} className="mt-1 w-full rounded border border-input bg-background p-2" />
      </label>
      {sharedObservedAt && !validSharedDate && <p role="status" className="text-destructive">Enter a valid calendar date and time with an explicit timezone (Z or ±HH:MM).</p>}
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmSharedDate} disabled={disabled} onChange={event => setConfirmedRows(event.target.checked ? confirmationScope : "")} /><span>I verified that this exact observation time applies to all {missingDates.length} missing-date measurements in the original report.</span></label>
      <Button type="button" variant="outline" disabled={disabled || !validSharedDate || !confirmSharedDate} onClick={() => {
        onChange({ ...review, rows: applyBoneSharedObservationTimestamp(review.rows, sharedObservedAt, confirmSharedDate) });
        setConfirmedRows("");
      }}>Apply date to missing rows only</Button>
    </section>}
    <label className="flex items-start gap-2 text-sm rounded border border-border p-3"><input type="checkbox" disabled={disabled || eligible.length === 0} checked={allVerified} onChange={event => verifyAll(event.target.checked)} /><span>{allVerified ? "Unverify All" : "Verify All"} — {eligible.length} eligible unsaved measurement(s) in this file. {eligible.length === 0 ? (unsaved.length === 0 ? "No unsaved measurements in this file. " : "Complete the required fields first; no rows can be verified yet. ") : ""}I personally compared each value, unit, date and source with the original report. This is not scientific or medical approval.</span></label>
    <div role="region" aria-label="Scrollable imported measurement table" tabIndex={0} className="overflow-x-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-ring">
      <table className="w-full min-w-[620px] text-sm">
        <caption className="sr-only">Imported measurements for human review</caption>
        <thead><tr className="border-b border-border text-left"><th scope="col" className="p-2">Verified</th><th scope="col" className="p-2">Variable</th><th scope="col" className="p-2">Value</th><th scope="col" className="p-2">Unit</th><th scope="col" className="p-2">Date</th><th scope="col" className="p-2">Review</th></tr></thead>
        <tbody>{review.rows.map((row, index) => <Fragment key={row.id}>
          <tr key={`${row.id}-summary`} className="border-b border-border">
            <td className="p-2"><input type="checkbox" checked={row.selected} aria-label={`I verified ${row.variableId}, measurement ${index + 1}, against the original report`} disabled={disabled || row.saved || boneReviewIssue(row) !== null} onChange={event => edit(row.id, {selected:event.target.checked})} /></td>
            <td className="p-2">{BONE_HEALTH_VARIABLES.find(variable => variable.id === row.variableId)?.name} <span className="text-muted-foreground">({row.variableId})</span>{row.saved && <span className="block text-muted-foreground">Saved</span>}{!row.saved && boneReviewIssue(row) && <span className="block text-destructive">{boneReviewIssue(row)}</span>}</td>
            <td className="p-2">{Number.isFinite(row.value) ? row.value : "Missing"}</td><td className="p-2">{row.unit}</td><td className="p-2">{row.observedAt || "Missing"}</td>
            <td className="p-2"><Button type="button" variant="outline" size="sm" aria-label={`${expanded.includes(row.id) ? "Close" : "Details / edit"} ${row.variableId}, measurement ${index + 1}`} aria-controls={`${detailsId}-${row.id}`} aria-expanded={expanded.includes(row.id)} onClick={() => setExpanded(current => current.includes(row.id) ? current.filter(id => id !== row.id) : [...current, row.id])}>{expanded.includes(row.id) ? "Close" : "Details / edit"}</Button></td>
          </tr>
          {<tr id={`${detailsId}-${row.id}`} hidden={!expanded.includes(row.id)} key={`${row.id}-details`}><td colSpan={6} className="p-3"><fieldset disabled={disabled || row.saved}>
            <legend className="sr-only">Details for {row.variableId}</legend>
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
          </fieldset></td></tr>}
        </Fragment>)}</tbody>
      </table>
    </div>
  </div>;
}
