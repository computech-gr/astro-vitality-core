import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getP69CatalogEntry, P69_MEDICAL_OUTCOMES, P69_SCIENTIFIC_OUTCOMES, P69_DEMO_CREW_SUBJECT } from "@/domain/public-demo/catalog";
import {
  OUTCOME_LABELS,
  STATE_LABELS,
  TRANSITION_RULES,
  astronautStatus,
  checkTransition,
  type DemoRecord,
  type DemoRole,
  type DemoTransitionAction,
} from "@/domain/public-demo/workflow";

const ACTOR = { astronaut: "Astronaut", researcher: "Researcher", medical: "Medical", seed: "Deterministic seed" } as const;
const ACTION = {
  submitted: "Examination submitted",
  scientific_assessment_recorded: "Scientific assessment recorded",
  medical_review_recorded: "Medical review recorded",
} as const;

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : iso;
}

export function PublicDemoRecordCard({
  record,
  role,
  onTransition,
}: {
  record: DemoRecord;
  role: DemoRole;
  onTransition: (args: { recordId: string; action: DemoTransitionAction; outcome: string; note: string; expectedRevision: number }) => Promise<string | null>;
}) {
  const action: DemoTransitionAction | null =
    role === "researcher" && record.state === "submitted"
      ? "scientific_assessment_recorded"
      : role === "medical" && record.state === "scientific_assessment_recorded"
        ? "medical_review_recorded"
        : null;
  const outcomes = action === "scientific_assessment_recorded" ? P69_SCIENTIFIC_OUTCOMES : P69_MEDICAL_OUTCOMES;
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const assessment = record.events.find((e) => e.action === "scientific_assessment_recorded");

  async function submit() {
    if (!action) return;
    const check = checkTransition({ role, action, currentState: record.state, currentRevision: record.revision, expectedRevision: record.revision, outcome, note });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onTransition({ recordId: record.id, action, outcome, note, expectedRevision: record.revision });
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4" aria-label={`Examination ${record.recordRef}`}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold">{record.recordRef}</p>
          <p className="text-xs text-muted-foreground">
            {P69_DEMO_CREW_SUBJECT.name} · examination {record.observedOn} · {record.measurements.length} measurements · quality {record.sourceQuality} · synthetic
          </p>
        </div>
        <Badge variant={record.state === "medical_review_recorded" ? "secondary" : "outline"}>
          {role === "astronaut" ? astronautStatus(record) : STATE_LABELS[record.state]}
        </Badge>
      </header>
      <p className="mt-2 text-xs text-muted-foreground">{record.sourceLabel} · record ID {record.id.slice(0, 8)}… · revision {record.revision}</p>

      <button type="button" className="mt-3 text-sm font-medium text-primary underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Hide measurements and history" : "Show measurements and history"}
      </button>
      {open ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="max-h-[280px] overflow-y-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr><th className="p-2">Parameter</th><th className="p-2">Value</th></tr>
              </thead>
              <tbody>
                {record.measurements.map((m) => (
                  <tr key={m.metricId} className="border-t border-border">
                    <td className="p-2">{getP69CatalogEntry(m.metricId)?.label ?? m.metricId}</td>
                    <td className="p-2 font-mono">{m.value} {m.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="space-y-3 text-sm" aria-label="Append-only history">
            {record.events.map((e) => (
              <li key={e.id} className="border-l-2 border-primary pl-3">
                <p className="font-medium">r{e.revision} · {ACTION[e.action]}</p>
                <p className="text-xs text-muted-foreground">
                  {ACTOR[e.actorRole]} · {when(e.recordedAt)} · {e.fromState ? `${STATE_LABELS[e.fromState]} → ` : ""}{STATE_LABELS[e.toState]}
                </p>
                {e.redacted ? (
                  <p className="text-xs text-muted-foreground">Scientific assessment details are visible to Researcher and Medical only.</p>
                ) : e.action !== "submitted" && e.outcome ? (
                  <p className="mt-1">{OUTCOME_LABELS[e.outcome as keyof typeof OUTCOME_LABELS] ?? e.outcome}{e.note ? ` — ${e.note}` : ""}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">Evidence: {e.evidence.provenance}, {e.evidence.measurementCount} measurements, quality {e.evidence.sourceQuality}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {action ? (
        <div className="mt-4 grid gap-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium">
            {action === "scientific_assessment_recorded" ? "Record scientific assessment" : "Record medical review"}
          </p>
          {action === "medical_review_recorded" && assessment ? (
            <p className="text-xs text-muted-foreground">
              Reviewing scientific assessment r{assessment.revision}: {OUTCOME_LABELS[assessment.outcome as keyof typeof OUTCOME_LABELS] ?? assessment.outcome}
              {assessment.note ? ` — ${assessment.note}` : ""}
            </p>
          ) : null}
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Outcome</legend>
            {outcomes.map((o) => (
              <label key={o} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                <input type="radio" name={`outcome-${record.id}`} value={o} checked={outcome === o} onChange={() => setOutcome(o)} />
                {OUTCOME_LABELS[o]}
              </label>
            ))}
          </fieldset>
          <div>
            <Label htmlFor={`note-${record.id}`}>Note (optional, synthetic)</Label>
            <Textarea id={`note-${record.id}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className="mt-2" />
          </div>
          <p className="text-xs text-muted-foreground">
            {action === "scientific_assessment_recorded"
              ? "A demo scientific assessment. Not P36/P37 scientific authorization, catalog activation or a medical decision."
              : "A demo medical review. Not a diagnosis, clinical clearance or treatment decision."}{" "}
            Requires {TRANSITION_RULES[action].role === "researcher" ? "Researcher" : "Medical"} role and revision {record.revision}.
          </p>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <Button onClick={() => void submit()} disabled={busy || !outcome} className="justify-self-start">
            {busy ? "Recording…" : action === "scientific_assessment_recorded" ? "Record assessment" : "Record medical review"}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
