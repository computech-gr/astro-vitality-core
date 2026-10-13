import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { P34_ACCEPTANCE_LEDGER, acceptanceSummary, buildAcceptanceHandoff, initialAcceptanceObservations, type AcceptanceStatus } from "@/domain/validation/real-device-acceptance";
const statuses: { value: AcceptanceStatus; label: string }[] = [
  { value: "not_executed", label: "Not executed" }, { value: "observed_pass", label: "Observed pass (unverified)" },
  { value: "observed_fail", label: "Observed fail" }, { value: "blocked", label: "Blocked" },
];
/** No health data, account identifiers or device measurements are stored or uploaded. */
export function RealDeviceAcceptance() {
  const [entries, setEntries] = useState(initialAcceptanceObservations);
  const [error, setError] = useState("");
  const summary = acceptanceSummary(entries);
  function change(id: string, field: "status" | "notes", value: string) {
    setError("");
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  }
  function exportNotes() {
    try {
      const handoff = buildAcceptanceHandoff(entries);
      const blob = new Blob([JSON.stringify(handoff, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "p34-human-observation-handoff.json"; link.click();
      URL.revokeObjectURL(url); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export unavailable"); }
  }
  return <section className="mt-12 space-y-5" aria-labelledby="p34-heading">
    <div><p className="section-kicker">P34 · Real-device end-to-end acceptance</p>
      <h2 id="p34-heading" className="mt-2 font-display text-2xl font-semibold">Device acceptance: NOT VERIFIED</h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Follow the procedures on actual hardware and with authorized test accounts. These session-only notes are self-reported and do not certify acceptance. Do not enter patient information, tokens, passwords or identifiable health measurements.</p></div>
    <Card><CardHeader><CardTitle>Human test execution ledger</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      <p>{summary.pending} not executed · {summary.passed} self-reported passes · {summary.failed} observed failures · {summary.blocked} blocked</p>
      <p className="font-semibold">Independent device acceptance: NOT VERIFIED · Scientific signoff: PENDING</p>
      <button type="button" onClick={exportNotes} className="rounded-md border border-border px-4 py-2 font-medium hover:bg-muted">Export session-only observations (JSON)</button>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">Export does not update the repository, Supabase or any approval state. Reload clears all notes.</p>
    </CardContent></Card>
    <div className="grid gap-4 lg:grid-cols-2">{P34_ACCEPTANCE_LEDGER.cases.map(c => {
      const entry = entries.find(e => e.id === c.id);
      return <Card key={c.id}><CardHeader><CardTitle className="text-base">{c.id} · {c.title}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">{c.procedure}</p>
        <p className="text-xs text-muted-foreground">Role: {c.role} · <a href={c.route} className="underline">Open workflow</a> · Trace: {c.trace}</p>
        <label className="block font-medium" htmlFor={`p34-status-${c.id}`}>Observed status</label>
        <select id={`p34-status-${c.id}`} value={entry?.status ?? "not_executed"} onChange={e => change(c.id, "status", e.target.value)} className="w-full rounded-md border border-border bg-background p-2">
          {statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label className="block font-medium" htmlFor={`p34-notes-${c.id}`}>Evidence notes (device/browser, steps, outcome; no private data)</label>
        <textarea id={`p34-notes-${c.id}`} rows={3} maxLength={2000} value={entry?.notes ?? ""} onChange={e => change(c.id, "notes", e.target.value)} className="w-full rounded-md border border-border bg-background p-2" placeholder="Actual observations, no sensitive values" />
      </CardContent></Card>;
    })}</div>
  </section>;
}
