import { p35Handoff } from "@/domain/challenge-submission/p35-readiness";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function P35SubmissionReadiness() {
  const report = p35Handoff();
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "mitochondria-p35-submission-readiness.json"; link.click();
    URL.revokeObjectURL(url);
  };
  return <section className="mt-10 space-y-5" aria-labelledby="p35-heading">
    <div><p className="section-kicker">P35 · Global Submission Handoff</p><h2 id="p35-heading" className="mt-2 font-display text-2xl font-semibold">Submission readiness and outstanding evidence</h2><p className="mt-2 text-sm text-muted-foreground">Repository snapshot only. No live NASA submission, clinical validation or physical test execution is implied.</p></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        ["Critical P20 evidence pending", report.criticalPending.length],
        ["Physical acceptance not passed", report.devicePending.length],
        ["Independent reviews pending", report.sciencePending.length],
        ["Video / official rules", `${report.videoReady ? "ready" : "pending"} / ${report.rulesReady ? "ready" : "pending"}`],
      ].map(([title, value]) => <Card key={title}><CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent><p className="text-xl font-semibold">{value}</p></CardContent></Card>)}
    </div>
    <Card><CardHeader><CardTitle className="text-base">Final handoff: NOT APPROVED</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Passing CI and production build does not clear human acceptance or scientific review. This workspace cannot approve or alter either ledger.</p><ul className="list-disc space-y-1 pl-5">{report.humanActions.map(action => <li key={action}>{action}</li>)}</ul><Button type="button" variant="outline" onClick={exportJson}>Export readiness handoff (JSON)</Button></CardContent></Card>
  </section>;
}
