import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import { draftPreliminaryAssessment } from "@/lib/preliminary-assessment.functions";
import type { BiomarkerAssessmentReport } from "@/domain/health-intelligence/biomarker-health-assessment";
import type { InterpretationSnapshot } from "@/domain/health-intelligence/biomarker-interpretation";
import type { ResearcherInterpretationModel } from "@/domain/health-intelligence/researcher-interpretation";
import {
  ASSESSMENT_SECTIONS,
  CLINICIAN_ACKNOWLEDGEMENT,
  NO_CONFIRMED_DIAGNOSIS_TEXT,
  SECTION_LABELS,
  assessmentDisplayStatus,
  buildAssessmentPacket,
  buildDeterministicAssessment,
  planClinicianReview,
  type AssessmentDisplayStatus,
  type ClinicianReview,
  type PreliminaryAssessment,
  type ReviewScope,
} from "@/domain/health-intelligence/preliminary-medical-assessment";

/**
 * P54 preliminary medical assessment. Offline deterministic version always;
 * AI-assisted version only on request by the scope's Ground Medical clinician,
 * for synthetic data, behind the server's default-off switch. Clinician review
 * is session-only (component memory) and fingerprint-bound. Screen only: never
 * part of the PDF or TXT exports.
 */
export function PreliminaryMedicalAssessmentPanel({
  assessment,
  model,
  snapshot,
  scope,
  canReview,
  userId,
}: {
  assessment: BiomarkerAssessmentReport;
  model: ResearcherInterpretationModel;
  snapshot: InterpretationSnapshot;
  scope: ReviewScope;
  canReview: boolean;
  userId: string | undefined;
}) {
  const packet = useMemo(() => buildAssessmentPacket(assessment, model, snapshot), [assessment, model, snapshot]);
  const offline = useMemo(() => buildDeterministicAssessment(packet), [packet]);
  const [ai, setAi] = useState<PreliminaryAssessment | null>(null);
  const [view, setView] = useState<"offline" | "ai">("offline");
  const [aiNote, setAiNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<ClinicianReview | null>(null);
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const [display, setDisplay] = useState<AssessmentDisplayStatus | null>(null);
  const draft = useServerFn(draftPreliminaryAssessment);
  const shown = view === "ai" && ai ? ai : offline;
  const scopeKey = `${scope.missionId}|${scope.crewMemberId}|${scope.provenance}`;

  // Scope or evidence change: discard AI output and any session review.
  useEffect(() => {
    setAi(null);
    setView("offline");
    setReview(null);
    setAck(false);
    setReviewMsg("");
    setAiNote("");
  }, [scopeKey, packet]);

  useEffect(() => {
    let live = true;
    void assessmentDisplayStatus(shown, packet, review, scope).then((d) => live && setDisplay(d));
    return () => {
      live = false;
    };
  }, [shown, packet, review, scope]);

  const requestAi = async () => {
    setBusy(true);
    setAiNote("Preparing a de-identified evidence packet (no names, IDs or dates)…");
    try {
      const r = await draft({ data: { missionId: scope.missionId, crewMemberId: scope.crewMemberId, packet } });
      if (!r.ok) {
        setAiNote(r.message);
        return;
      }
      setAi(r.assessment);
      setView("ai");
      setReview(null);
      setAiNote(
        r.aiCalled
          ? `AI-assisted draft received${r.assessment.model ? ` (${r.assessment.model})` : ""}; ${r.assessment.rejected.length} statement(s) rejected by validation.`
          : "No verified finding or approved interpretation exists, so the AI was not asked. The diagnosis cannot be established.",
      );
    } catch {
      setAiNote("The AI-assisted assessment could not be requested. The offline assessment remains available.");
    } finally {
      setBusy(false);
    }
  };

  const recordReview = async (decision: "attested" | "returned") => {
    setBusy(true);
    try {
      const fresh = await loadMissionIdentity();
      const roles =
        fresh.signedIn && !fresh.error && fresh.userId === userId
          ? fresh.memberships.filter((m) => m.missionId === scope.missionId && m.crewMemberId === scope.crewMemberId).map((m) => m.role)
          : [];
      const plan = await planClinicianReview(shown, packet, { userId: fresh.signedIn ? fresh.userId : null, rolesForScope: roles, scope, now: new Date().toISOString() }, { decision, acknowledgement: ack ? CLINICIAN_ACKNOWLEDGEMENT : "", note });
      if (!plan.ok) {
        setReviewMsg(plan.reason);
        return;
      }
      setReview(plan.review);
      setAck(false);
      setReviewMsg(decision === "attested" ? "Clinician review recorded for this session only (not stored, not synced)." : "Returned for revision (session only).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Preliminary medical assessment" className="space-y-3 rounded-lg border border-dashed p-4 print:hidden" data-testid="p54-preliminary-assessment">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Preliminary medical assessment</h3>
        <p className="text-sm font-semibold" role="status">{display?.headline ?? shown.label}</p>
        <p className="text-xs text-muted-foreground">{display?.detail ?? "Not reviewed by a Ground Medical clinician."}</p>
        <p className="text-xs text-muted-foreground">Screen only — excluded from the PDF and TXT exports. Observations, differential hypotheses and confirmed diagnoses are kept separate.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={view === "offline" ? "default" : "outline"} onClick={() => setView("offline")}>Offline assessment</Button>
        {ai ? <Button size="sm" variant={view === "ai" ? "default" : "outline"} onClick={() => setView("ai")}>AI-assisted assessment</Button> : null}
        <Button size="sm" variant="secondary" disabled={busy || !canReview || scope.provenance !== "synthetic"} onClick={() => void requestAi()}>
          <Bot className="mr-1 h-4 w-4" aria-hidden />
          Request AI-assisted assessment
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {scope.provenance !== "synthetic"
          ? "Real crew measurements are never sent to an external AI service; no privacy-preserving workflow is authorized."
          : !canReview
            ? "Only the Ground Medical clinician for this exact mission and crew member can request or review an AI-assisted assessment."
            : aiNote || "Only a de-identified packet (catalog names, values in exact units, verified statuses and approved cited text) would be sent, and only if the deployment has switched this feature on."}
      </p>

      <div className="space-y-3">
        {ASSESSMENT_SECTIONS.map((sec) => (
          <div key={sec} className="space-y-1">
            <h4 className="text-sm font-semibold">{SECTION_LABELS[sec]}</h4>
            {shown.sections[sec].length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {shown.sections[sec].map((s) => (
                  <li key={s.text} className="break-words">
                    {sec === "differentialConsiderations" ? <strong>Hypothesis: </strong> : null}
                    {s.text}
                    <span className="block text-xs text-muted-foreground">
                      Observations {s.observationRefs.join(", ")}{s.citationIds.length ? ` · sources ${s.citationIds.join(", ")}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">None supported by verified evidence.</p>
            )}
          </div>
        ))}
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{SECTION_LABELS.uncertainties}</h4>
          <ul className="list-disc pl-5 text-xs">{shown.uncertainties.map((u) => <li key={u} className="break-words">{u}</li>)}</ul>
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">{SECTION_LABELS.missingTests}</h4>
          {shown.missingTests.length ? <ul className="list-disc pl-5 text-xs">{shown.missingTests.map((u) => <li key={u}>{u}</li>)}</ul> : <p className="text-xs text-muted-foreground">None listed.</p>}
        </div>
        <p className="text-sm font-semibold">Diagnosis: {shown.diagnosisStatement}</p>
        <p className="text-xs text-muted-foreground">{NO_CONFIRMED_DIAGNOSIS_TEXT}</p>
        {shown.rejected.length ? (
          <details className="text-xs">
            <summary className="cursor-pointer">{shown.rejected.length} AI statement(s) rejected by validation</summary>
            <ul className="mt-1 list-disc pl-5">{shown.rejected.map((r, i) => <li key={i} className="break-words">{r.section}: {r.reason} — “{r.text}”</li>)}</ul>
          </details>
        ) : null}
      </div>

      {canReview ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="flex items-center gap-1 text-sm font-medium"><ShieldCheck className="h-4 w-4" aria-hidden />Ground Medical clinician review</p>
          <label className="block text-xs" htmlFor="p54-review-note">Review note (required)</label>
          <textarea id="p54-review-note" className="medical-advisor-input w-full rounded border p-2 text-sm" rows={2} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
            <span>{CLINICIAN_ACKNOWLEDGEMENT}.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || !ack || note.trim().length < 10} onClick={() => void recordReview("attested")}>Attest as clinician-reviewed</Button>
            <Button size="sm" variant="outline" disabled={busy || note.trim().length < 10} onClick={() => void recordReview("returned")}>Return for revision</Button>
          </div>
          {reviewMsg ? <p className="text-xs text-muted-foreground" role="status">{reviewMsg}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">View only: clinician review requires the Ground Medical role for this exact mission and crew member.</p>
      )}
    </section>
  );
}
