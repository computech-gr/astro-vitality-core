import { p354IntegrationReadiness } from "@/domain/challenge-submission/p354-integration";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function P354IntegrationReadiness() {
  const report = p354IntegrationReadiness();
  const exportReport = () => {
    const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitochondria-p354-integration-handoff.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return <section className="mt-10 space-y-5" aria-labelledby="p354-title">
    <div>
      <p className="section-kicker">P35.4 · Integration & Mission Readiness</p>
      <h2 id="p354-title" className="mt-2 font-display text-2xl font-semibold">Connected workflows · evidence before approval</h2>
      <p className="mt-2 text-sm text-muted-foreground">This is a repository-based test handoff, not a live system health monitor. Follow each pathway using authorized accounts and real hardware during final acceptance.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-2">
      {report.pathways.map(path => <Card key={path.id}>
        <CardHeader><CardTitle className="text-base">{path.title}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{path.expected}</p>
          <p className="text-muted-foreground">Boundary: {path.boundary}</p>
          <a className="inline-block text-primary underline underline-offset-4" href={path.route}>Open workflow →</a>
        </CardContent>
      </Card>)}
    </div>
    <Card>
      <CardHeader><CardTitle className="text-base">Final integration acceptance · NOT EXECUTED / NOT APPROVED</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <p className="rounded border p-3">Physical cases requiring evidence: <strong>{report.physical.filter(c => c.status !== "observed_pass").length}</strong></p>
          <p className="rounded border p-3">Independent scientific gates: <strong>{report.scientific.filter(g => g.status !== "approved").length}</strong></p>
          <p className="rounded border p-3">Final Security Gate: <strong>BLOCKED</strong></p>
        </div>
        <p className="text-muted-foreground">FV-01-13 OPEN · P32 PENDING · P34 PENDING. Passing CI, seeing NASA metadata, or viewing a live sample cannot change these states. No clinical activation.</p>
        <details className="rounded border p-3"><summary className="cursor-pointer font-medium">Human-operated P34 acceptance checklist ({report.physical.length})</summary>
          <ul className="mt-3 list-disc space-y-2 pl-5">{report.physical.map(item => <li key={item.id}><span className="font-mono">{item.id}</span> — {item.title} ({item.status.replaceAll("_", " ")}){item.route && <> · <a className="underline" href={item.route}>Open</a></>}</li>)}</ul>
        </details>
        <Button type="button" variant="outline" onClick={exportReport}>Export integration test handoff (JSON)</Button>
      </CardContent>
    </Card>
  </section>;
}
