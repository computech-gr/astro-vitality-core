import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMedicalReviewHistory } from "@/lib/medical-governance.functions";
import type { DurableReviewEvent } from "@/domain/health-intelligence/medical-governance";
import { Button } from "@/components/ui/button";
import type { HealthHistoryReport } from "@/domain/health-intelligence/health-history-report";
import {
  approveAdvisorDraft,
  buildAIDraftingPrompt,
  createAdvisorDraft,
  isApprovedForReport,
  MEDICAL_ADVISOR_NOTICE,
  evidenceSha256,
  type AdvisorReview,
} from "@/domain/health-intelligence/medical-advisor-review";
export function MedicalAdvisorWorkbench({
  report,
  authorizedMedicalRole,
  advisorLabel,
}: {
  report: HealthHistoryReport;
  authorizedMedicalRole: boolean;
  advisorLabel: string;
}) {
  const [draftText, setDraftText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<AdvisorReview | null>(null);
  const [message, setMessage] = useState("");
  const [sha, setSha] = useState("");
  const [history, setHistory] = useState<DurableReviewEvent[]>([]);
  const [historyMessage, setHistoryMessage] = useState("Persistent history has not been verified.");
  const getHistory = useServerFn(getMedicalReviewHistory);
  useEffect(() => {
    let active = true;
    setSha("");
    void evidenceSha256(report)
      .then((digest) => {
        if (active) setSha(digest);
      })
      .catch(() => {
        if (active) setSha("");
      });
    return () => {
      active = false;
    };
  }, [report]);
  useEffect(() => {
    let active = true;
    setHistory([]);
    if (!authorizedMedicalRole) return;
    void getHistory({ data: { missionId: report.missionId, crewMemberId: report.crewMemberId } })
      .then((result) => {
        if (active) {
          setHistory(result.events);
          setHistoryMessage(result.reason);
        }
      })
      .catch(() => {
        if (active)
          setHistoryMessage(
            "Persistent history unavailable; no server-verified acknowledgment can be shown.",
          );
      });
    return () => {
      active = false;
    };
  }, [report.missionId, report.crewMemberId, authorizedMedicalRole, getHistory]);
  const approved = useMemo(
    () => authorizedMedicalRole && isApprovedForReport(review, report),
    [review, report, authorizedMedicalRole],
  );
  const draftPrompt = () => {
    if (!report.observations.length) {
      setMessage("No included observations are available to export.");
      return;
    }
    let url: string | null = null;
    try {
      const content = buildAIDraftingPrompt(report);
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "mitochondria-ai-draft-input-RESEARCH-ONLY.txt";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Keep the object URL alive long enough for the browser to start the download.
      const downloadUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
      url = null;
      setMessage("Evidence prompt download requested. Check your browser downloads for mitochondria-ai-draft-input-RESEARCH-ONLY.txt. No data was sent to an AI service. Only transfer with explicit authorization.");
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      setMessage(`Evidence prompt export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const start = () => {
    try {
      const d = createAdvisorDraft(report, draftText, "manual-ai-transfer");
      setReview(d);
      setFinalText(d.finalText);
      setMessage("Draft captured locally; not approved.");
    } catch (e) {
      setMessage(String(e));
    }
  };
  const approve = () => {
    if (!review) return;
    try {
      setReview(
        approveAdvisorDraft(review, report, advisorLabel, finalText, reason, authorizedMedicalRole),
      );
      setMessage(
        "Advisor review approved for the current in-memory report snapshot only. Not a persisted or cryptographically signed medical record.",
      );
    } catch (e) {
      setMessage(String(e));
    }
  };
  return (
    <section
      className="space-y-3 rounded-lg border p-4 print:break-before-page"
      aria-label="AI draft and medical advisor review"
    >
      <h3 className="font-semibold">AI research draft — advisor acknowledgment</h3>
      <p className="text-sm">{MEDICAL_ADVISOR_NOTICE}</p>
      <p className="text-xs text-muted-foreground">{historyMessage}</p>
      <p className="break-all text-xs text-muted-foreground">
        Evidence SHA-256: {sha || "Unavailable"}. Local digest only; not server attestation.
      </p>
      {review && (
        <p className="text-sm font-semibold">
          {!authorizedMedicalRole
            ? "REVOKED — reviewer access unavailable"
            : !isApprovedForReport({ ...review, decision: "approved" }, report)
              ? "STALE — evidence changed"
              : approved
                ? "ADVISOR REVIEWED — session-only, research-only"
                : "AI DRAFT — unverified"}
        </p>
      )}
      {history.map((event) => (
        <div key={event.id} className="border-t py-2 text-xs">
          <strong>
            {event.event_type === "approved" && !event.verified_current
              ? "STALE / UNVERIFIED"
              : event.event_type.toUpperCase()}
          </strong>
          <p>
            Revision {event.revision} · Actor {event.actor_user_id} · {event.created_at}
          </p>
          <p className="break-all">{event.evidence_sha256}</p>
          <p>{event.rationale}</p>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Privacy: server AI is available only when configured by the operator and explicitly
        authorized. Exporting the evidence prompt and entering it in a third-party AI tool may
        disclose sensitive medical data. Only do so with explicit authorization and an approved
        secure service. Never paste identifiable real astronaut data into consumer AI tools.
      </p>
      <div className="print:hidden space-y-2">
        <p className="text-sm text-muted-foreground" role="status">
          Automated generation through the legacy research-draft endpoint is unavailable in
          production. It is intentionally disabled to prevent stuck processing and unguarded
          requests. Use the authorized Synthetic Research AI factual Q&amp;A above instead.
          This section only captures an existing draft for session-only advisor review.
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a className="inline-block text-sm underline underline-offset-4" href="#synthetic-research-qa">
            Go to Synthetic Research AI — factual Q&amp;A
          </a>
          <Button
            type="button"
            variant="outline"
            className="medical-action-secondary h-auto max-w-full whitespace-normal text-left"
            onClick={draftPrompt}
            disabled={!report.observations.length}
          >
            Download research evidence prompt (.txt — manual transfer)
          </Button>
        </div>
        <label className="block text-sm" htmlFor="ai-medical-draft">
          AI-generated English draft (paste after authorized processing)
        </label>
        <textarea
          id="ai-medical-draft"
          className="medical-advisor-input w-full rounded border bg-background p-2"
          rows={5}
          maxLength={12000}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
        />
        <Button
          type="button"
          onClick={start}
          className="medical-action-primary"
          disabled={!report.observations.length || !draftText.trim()}
        >
          Capture unverified draft
        </Button>
        {review && (
          <>
            <label className="block text-sm" htmlFor="advisor-final-text">
              Medical advisor edited opinion
            </label>
            <textarea
              id="advisor-final-text"
              className="medical-advisor-input w-full rounded border bg-background p-2"
              rows={6}
              maxLength={12000}
              value={finalText}
              onChange={(e) => setFinalText(e.target.value)}
            />
            <label className="block text-sm" htmlFor="advisor-rationale">
              Advisor review rationale (required)
            </label>
            <textarea
              id="advisor-rationale"
              className="medical-advisor-input w-full rounded border bg-background p-2"
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              type="button"
              className="medical-action-primary h-auto max-w-full whitespace-normal text-left"
              onClick={approve}
              disabled={!authorizedMedicalRole || review.decision === "approved"}
            >
              Acknowledge reviewed draft (session only)
            </Button>
            {!authorizedMedicalRole && (
              <p className="text-sm">
                Only a mission-authorized ground-medical member can approve. Membership is not proof
                of professional licensure.
              </p>
            )}
          </>
        )}
        <p role="status" aria-live="polite" className="text-xs">
          {message}
        </p>
      </div>
      {approved && review && (
        <div className="space-y-2 rounded border p-3">
          <h4 className="font-semibold">Advisor acknowledgment (session-only, research-only)</h4>
          <p className="whitespace-pre-wrap text-sm">{review.finalText}</p>
          <p className="text-xs">
            Reviewed by: {review.advisorIdentity} · {review.reviewedAt} · Evidence snapshot:{" "}
            {review.evidenceFingerprint}
          </p>
          <p className="text-xs">
            This is a session-only review; persistent audited sign-off requires a separately
            authorized backend workflow.
          </p>
        </div>
      )}
    </section>
  );
}
