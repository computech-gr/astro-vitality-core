"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCloudMissionContext } from "@/infrastructure/mission-records";
import { reviewSelfAssessment, SELF_ASSESSMENT_QUESTIONS, type SelfAssessmentAnswers } from "@/domain/action-guidance/self-assessment";

export function AstronautSelfAssessment() {
  const [missions, setMissions] = useState<Array<{ missionId: string; crewMemberId: string; missionLabel: string }>>([]);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("Checking signed-in Crew Self authorization...");
  const [answers, setAnswers] = useState<SelfAssessmentAnswers>({});
  const [reviewed, setReviewed] = useState(false);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const result = useMemo(() => reviewSelfAssessment(answers), [answers]);
  useEffect(() => {
    let active = true;
    void getCloudMissionContext().then(context => {
      if (!active) return;
      const allowed = context.signedIn && !context.error ? context.memberships.filter((m): m is typeof m & { crewMemberId: string } => m.role === "crew_self" && Boolean(m.crewMemberId)) : [];
      const missionIds = [...new Set(allowed.map(m => m.missionId))];
      const { data: missionRows } = missionIds.length ? await supabase.from("missions").select("id, code, name").in("id", missionIds) : { data: [] };
      const labels = new Map((missionRows ?? []).map(row => [row.id, row.name ?? row.code ?? row.id]));
      setMissions(allowed.map(m => ({ missionId: m.missionId, crewMemberId: m.crewMemberId, missionLabel: labels.get(m.missionId) ?? m.missionId })));
      setSelected(allowed.length ? `${allowed[0]!.missionId}|${allowed[0]!.crewMemberId}` : "");
      setStatus(allowed.length ? "Authorized Crew Self. Voluntary session-only assessment." : "Sign in with an active Crew Self mission membership to start an assessment.");
    }).catch(() => { if (active) setStatus("Unable to verify membership. Assessment disabled."); });
    return () => { active = false; };
  }, []);
  const reset = () => { setAnswers({}); setReviewed(false); setAcknowledged([]); };
  return <section className="mt-10 rounded-xl border border-border bg-surface p-5" aria-label="Astronaut self-assessment">
    <h2 className="text-2xl font-semibold">Astronaut self-assessment</h2>
    <p className="mt-2 text-sm text-muted-foreground">A private, voluntary context checklist. No clinical scoring, automated alerts, diagnoses or stored answers.</p>
    <p className="mt-3 text-sm" role="status">{status}</p>
    {missions.length > 1 && <label className="mt-4 block text-sm">Mission <select className="ml-2 rounded border border-border bg-background p-2" value={selected} onChange={event => { setSelected(event.target.value); reset(); }}>{missions.map(m => <option key={`${m.missionId}|${m.crewMemberId}`} value={`${m.missionId}|${m.crewMemberId}`}>{m.missionLabel}</option>)}</select></label>}
    {selected && <div className="mt-5 space-y-5">
      {SELF_ASSESSMENT_QUESTIONS.map(q => <fieldset key={q.id} className="rounded-lg border border-border p-4"><legend className="px-1 font-medium">{q.label}</legend><div className="mt-2 flex flex-wrap gap-2">{q.options.map(option => <label key={option} className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm"><input type="radio" name={`p27-${q.id}`} value={option} checked={answers[q.id] === option} onChange={() => { setAnswers(current => ({ ...current, [q.id]: option })); setReviewed(false); setAcknowledged([]); }} />{option}</label>)}</div></fieldset>)}
      <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!result.complete} onClick={() => setReviewed(true)} className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Review protocol categories</button><button type="button" onClick={reset} className="rounded border border-border px-4 py-2">Clear session</button><span className="text-sm text-muted-foreground">{result.answered}/{result.total} answered</span></div>
      {reviewed && result.complete && <div className="space-y-4" aria-live="polite"><h3 className="text-xl font-semibold">Your review — not a medical assessment</h3>
        {result.medicalContactRequested && <p className="rounded border border-border p-3 text-sm font-medium">You requested medical review. Contact the designated qualified crew medical/mission authority through the established mission communication pathway. This page does not send a request or activate escalation.</p>}
        {result.suggestions.length === 0 && <p className="text-sm">No optional review categories were suggested by your checklist responses. This does not establish that you are medically fit or free of health concerns.</p>}
        {result.suggestions.map(item => <article key={item.protocolId} className="rounded border border-border p-4"><h4 className="font-semibold">{item.title}</h4><p className="mt-1 text-sm">{item.reason}</p><p className="mt-1 text-xs text-muted-foreground">Protocol {item.protocolId} · v{item.version} · informational only</p><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{item.steps.map(step => <li key={step.id}><strong>{step.label}:</strong> {step.instruction}</li>)}</ol><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={acknowledged.includes(item.protocolId)} onChange={event => setAcknowledged(previous => event.target.checked ? [...previous, item.protocolId] : previous.filter(id => id !== item.protocolId))} />Reviewed in this browser session (not persisted)</label></article>)}
      </div>}
    </div>}
    <ul className="mt-6 list-disc space-y-2 pl-5 text-xs text-muted-foreground">{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
  </section>;
}
