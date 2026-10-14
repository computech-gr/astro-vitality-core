import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { p35FinalAcceptanceCatalog, p35FinalAcceptanceHandoff, type ManualOutcome, type ManualResult } from "@/domain/challenge-submission/p35-final-acceptance";

const options: { value: ManualOutcome; label: string }[] = [
  { value: "not_executed", label: "Not executed" },
  { value: "pass_observed", label: "Observed pass (unverified)" },
  { value: "fail_observed", label: "Observed fail" },
  { value: "blocked", label: "Blocked / no access" },
];
export function P35FinalAcceptance() {
  const catalog = p35FinalAcceptanceCatalog();
  const [results, setResults] = useState<Record<string, ManualResult>>({});
  const [notice, setNotice] = useState("");
  const update = (id: string, patch: Partial<ManualResult>) => setResults(previous => ({ ...previous, [id]: { outcome: "not_executed", evidenceRef: "", operatorNote: "", ...previous[id], ...patch } }));
  const download = () => {
    const report = p35FinalAcceptanceHandoff(results, new Date().toISOString());
    const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "mitochondria-p35-final-manual-handoff.json"; link.click(); URL.revokeObjectURL(url);
    setNotice("Local handoff exported. No results were saved to mission records or submitted for approval.");
  };
  return <section className="mt-10 min-w-0 space-y-4" aria-labelledby="p35-final-title">
    <p className="section-kicker">P35 · Final Integrated Acceptance</p>
    <h2 id="p35-final-title" className="font-display text-2xl font-semibold">Human-operated acceptance worksheet</h2>
    <p className="text-sm text-muted-foreground">{catalog.cases.length} physical and integration cases · {catalog.science.length} independent scientific gates. This worksheet is local to this page session and does not approve, persist or upload results. Enter evidence references only, never patient identifiers or medical values.</p>
    <p className="rounded border p-3 text-sm font-semibold">FV-01-13 OPEN · P32 PENDING · P34 PENDING · Final Security Gate BLOCKED · Clinical activation DISABLED · P35.5 awaiting Nikolas documents</p>
    <div className="space-y-3">{catalog.cases.map(c => {
      const result = results[c.id] ?? { outcome: "not_executed" as ManualOutcome, evidenceRef: "", operatorNote: "" };
      return <Card key={c.id} className="min-w-0"><CardHeader><CardTitle className="break-words text-base">{c.id} · {c.title}</CardTitle></CardHeader><CardContent className="min-w-0 space-y-3 text-sm">
        <p className="break-words text-muted-foreground">{c.procedure}</p>
        <a className="text-primary underline" href={c.route}>Open workflow</a>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1">Manual observation<select className="w-full min-w-0 rounded border bg-background p-2" aria-label={`${c.id} observation`} value={result.outcome} onChange={e => update(c.id, { outcome: e.target.value as ManualOutcome })}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
          <label className="space-y-1">Evidence reference<input className="w-full min-w-0 rounded border bg-background p-2" maxLength={240} aria-label={`${c.id} evidence reference`} placeholder="Artifact ID / ticket only" value={result.evidenceRef} onChange={e => update(c.id, { evidenceRef: e.target.value })}/></label>
          <label className="space-y-1">Observation note<input className="w-full min-w-0 rounded border bg-background p-2" maxLength={320} aria-label={`${c.id} observation note`} placeholder="No personal health information" value={result.operatorNote} onChange={e => update(c.id, { operatorNote: e.target.value })}/></label>
        </div>
      </CardContent></Card>;
    })}</div>
    <details className="rounded border p-3"><summary className="cursor-pointer font-medium">P32 independent scientific review — {catalog.science.length} pending gates</summary><ul className="mt-3 space-y-2 text-sm">{catalog.science.map(g => <li key={g.id} className="break-words"><strong>{g.id} · {g.title}</strong> — {g.status}. {g.acceptance}</li>)}</ul></details>
    <Button type="button" variant="outline" onClick={download}>Export manual acceptance worksheet (JSON)</Button>
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
  </section>;
}
