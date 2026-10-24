import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { HealthHistoryReport } from "@/domain/health-intelligence/health-history-report";
import {
  approveAdvisorDraft,
  buildAIDraftingPrompt,
  createAdvisorDraft,
  isApprovedForReport,
  MEDICAL_ADVISOR_NOTICE,
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
  const [aiConsent, setAiConsent] = useState(false);
  const [generating, setGenerating] = useState(false);
  const approved = useMemo(() => isApprovedForReport(review, report), [review, report]);
  const draftPrompt = () => {
    const blob = new Blob([buildAIDraftingPrompt(report)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitochondria-ai-draft-input-RESEARCH-ONLY.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  const generateWithAI = async () => {
    if (!authorizedMedicalRole || !aiConsent || generating) return;
    setGenerating(true);
    setMessage("Requesting server-generated research draft...");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sign in required.");
      const response = await fetch("/api/medical-ai-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          missionId: report.missionId,
          crewMemberId: report.crewMemberId,
          provenance: report.provenance,
          consent: aiConsent,
          observations: report.observations.map((o) => ({
            id: o.id,
            domain: o.domain,
            metric: o.metricId,
            value: o.value,
            unit: o.originalUnit,
            time: o.observedAt,
          })),
        }),
      });
      const payload = (await response.json()) as {
        draft?: string;
        error?: string;
        violations?: string[];
      };
      if (!response.ok || !payload.draft)
        throw new Error(
          [payload.error || "AI generation failed.", ...(payload.violations ?? [])].join(" · "),
        );
      const draft = createAdvisorDraft(report, payload.draft, "server-ai");
      setReview(draft);
      setDraftText(payload.draft);
      setFinalText(payload.draft);
      setReason("");
      setMessage(
        "Server AI draft received; independent advisor review is required. No clinical approval.",
      );
    } catch (error) {
      setMessage(String(error));
    } finally {
      setGenerating(false);
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
      <h3 className="font-semibold">AI-assisted medical opinion — advisor review</h3>
      <p className="text-sm">{MEDICAL_ADVISOR_NOTICE}</p>
      <p className="text-xs text-muted-foreground">
        Privacy: server AI is available only when configured by the operator and explicitly
        authorized. Exporting the evidence prompt and entering it in a third-party AI tool may
        disclose sensitive medical data. Only do so with explicit authorization and an approved
        secure service. Never paste identifiable real astronaut data into consumer AI tools.
      </p>
      <div className="print:hidden space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={aiConsent}
            onChange={(e) => setAiConsent(e.target.checked)}
          />
          I explicitly authorize sending the selected de-identified observation values to the
          configured server-side AI provider for a research-only draft. No names or crew identifiers
          are sent to the AI provider. Real-data processing requires separate server authorization.
        </label>
        <Button
          type="button"
          onClick={() => void generateWithAI()}
          disabled={
            !authorizedMedicalRole || !aiConsent || !report.observations.length || generating
          }
        >
          {generating ? "Generating draft..." : "Generate research draft with secure server AI"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={draftPrompt}
          disabled={!report.observations.length}
        >
          Export de-identified evidence prompt (manual transfer)
        </Button>
        <label className="block text-sm" htmlFor="ai-medical-draft">
          AI-generated English draft (paste after authorized processing)
        </label>
        <textarea
          id="ai-medical-draft"
          className="w-full rounded border bg-background p-2"
          rows={5}
          maxLength={12000}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
        />
        <Button type="button" onClick={start} disabled={!report.observations.length}>
          Capture unverified draft
        </Button>
        {review && (
          <>
            <label className="block text-sm" htmlFor="advisor-final-text">
              Medical advisor edited opinion
            </label>
            <textarea
              id="advisor-final-text"
              className="w-full rounded border bg-background p-2"
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
              className="w-full rounded border bg-background p-2"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              type="button"
              onClick={approve}
              disabled={!authorizedMedicalRole || review.decision === "approved"}
            >
              Approve reviewed opinion
            </Button>
            {!authorizedMedicalRole && (
              <p className="text-sm">
                Only a mission-authorized ground-medical member can approve. Membership is not proof
                of professional licensure.
              </p>
            )}
          </>
        )}
        <p role="status" className="text-xs">
          {message}
        </p>
      </div>
      {approved && review && (
        <div className="space-y-2 rounded border p-3">
          <h4 className="font-semibold">Medical advisor reviewed opinion (research-only)</h4>
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
