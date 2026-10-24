import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { HealthHistoryReport } from "@/domain/health-intelligence/health-history-report";
import { approveAdvisorDraft, buildAIDraftingPrompt, createAdvisorDraft, isApprovedForReport, MEDICAL_ADVISOR_NOTICE, type AdvisorReview } from "@/domain/health-intelligence/medical-advisor-review";
export function MedicalAdvisorWorkbench({report,authorizedMedicalRole,advisorLabel}:{report:HealthHistoryReport;authorizedMedicalRole:boolean;advisorLabel:string}) {
  const [draftText,setDraftText]=useState("");const [finalText,setFinalText]=useState("");const [reason,setReason]=useState("");
  const [review,setReview]=useState<AdvisorReview|null>(null);const [message,setMessage]=useState("");
  const approved=useMemo(()=>isApprovedForReport(review,report),[review,report]);
  const draftPrompt=()=>{const blob=new Blob([buildAIDraftingPrompt(report)],{type:"text/plain"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="mitochondria-ai-draft-input-RESEARCH-ONLY.txt";a.click();URL.revokeObjectURL(url)};
  const start=()=>{try{const d=createAdvisorDraft(report,draftText,"manual-ai-transfer");setReview(d);setFinalText(d.finalText);setMessage("Draft captured locally; not approved.")}catch(e){setMessage(String(e))}};
  const approve=()=>{if(!review)return;try{setReview(approveAdvisorDraft(review,report,advisorLabel,finalText,reason,authorizedMedicalRole));setMessage("Advisor review approved for the current in-memory report snapshot only. Not a persisted or cryptographically signed medical record.")}catch(e){setMessage(String(e))}};
  return <section className="space-y-3 rounded-lg border p-4 print:break-before-page" aria-label="AI draft and medical advisor review">
    <h3 className="font-semibold">AI-assisted medical opinion — advisor review</h3>
    <p className="text-sm">{MEDICAL_ADVISOR_NOTICE}</p>
    <p className="text-xs text-muted-foreground">Privacy: no automatic AI service is connected. Exporting the evidence prompt and entering it in a third-party AI tool may disclose sensitive medical data. Only do so with explicit authorization and an approved secure service. Never paste identifiable real astronaut data into consumer AI tools.</p>
    <div className="print:hidden space-y-2"><Button type="button" variant="outline" onClick={draftPrompt} disabled={!report.observations.length}>Export de-identified evidence prompt (manual transfer)</Button>
      <label className="block text-sm" htmlFor="ai-medical-draft">AI-generated English draft (paste after authorized processing)</label>
      <textarea id="ai-medical-draft" className="w-full rounded border bg-background p-2" rows={5} maxLength={12000} value={draftText} onChange={e=>setDraftText(e.target.value)}/>
      <Button type="button" onClick={start} disabled={!report.observations.length}>Capture unverified draft</Button>
      {review && <><label className="block text-sm" htmlFor="advisor-final-text">Medical advisor edited opinion</label><textarea id="advisor-final-text" className="w-full rounded border bg-background p-2" rows={6} maxLength={12000} value={finalText} onChange={e=>setFinalText(e.target.value)}/>
      <label className="block text-sm" htmlFor="advisor-rationale">Advisor review rationale (required)</label><textarea id="advisor-rationale" className="w-full rounded border bg-background p-2" rows={3} value={reason} onChange={e=>setReason(e.target.value)}/>
      <Button type="button" onClick={approve} disabled={!authorizedMedicalRole || review.decision==="approved"}>Approve reviewed opinion</Button>
      {!authorizedMedicalRole && <p className="text-sm">Only a mission-authorized ground-medical member can approve. Membership is not proof of professional licensure.</p>}</>}
      <p role="status" className="text-xs">{message}</p></div>
    {approved && review && <div className="space-y-2 rounded border p-3"><h4 className="font-semibold">Medical advisor reviewed opinion (research-only)</h4><p className="whitespace-pre-wrap text-sm">{review.finalText}</p><p className="text-xs">Reviewed by: {review.advisorIdentity} · {review.reviewedAt} · Evidence snapshot: {review.evidenceFingerprint}</p><p className="text-xs">This is a session-only review; persistent audited sign-off requires a separately authorized backend workflow.</p></div>}
  </section>;
}
