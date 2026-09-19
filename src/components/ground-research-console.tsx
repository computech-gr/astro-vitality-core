import { useState } from "react";
import { Database, Download, FlaskConical, ShieldCheck, Users, Wifi } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadDeidentifiedResearchExport, loadGroundMissionSnapshot, type GroundSnapshotDto } from "@/infrastructure/ground-research";

const capabilityCards = [
  [Users, "Crew overview", "Mission-scoped crew context with role separation."],
  [Wifi, "Mission sync", "Store-and-forward records are accepted only through authenticated mission membership."],
  [ShieldCheck, "Alert review", "Ground review preserves evidence, protocol versions and acknowledgement provenance."],
  [Database, "Audit trail", "Sensitive snapshot reads, exports and event ingestion are audited server-side."],
  [FlaskConical, "Research export", "Researchers receive a reduced, de-identified projection, never direct medical identity."],
] as const;

export function GroundResearchConsolePage() {
  const [missionId, setMissionId] = useState("");
  const [snapshot, setSnapshot] = useState<GroundSnapshotDto>();
  const [status, setStatus] = useState("Authenticated mission role required.");
  const [loading, setLoading] = useState(false);

  async function loadSnapshot() {
    if (!missionId.trim()) return;
    setLoading(true);
    try {
      setSnapshot(await loadGroundMissionSnapshot(missionId.trim()));
      setStatus("Ground snapshot loaded through the role-scoped RPC.");
    } catch (error) {
      setSnapshot(undefined);
      setStatus(error instanceof Error ? error.message : "Ground snapshot unavailable");
    } finally { setLoading(false); }
  }

  async function exportResearch() {
    if (!missionId.trim()) return;
    setLoading(true);
    try {
      const rows = await loadDeidentifiedResearchExport(missionId.trim());
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `mitochondria-research-${missionId.trim()}.json`; anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`De-identified research export prepared (${rows.length} rows).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Research export unavailable");
    } finally { setLoading(false); }
  }

  return <main className="min-h-dvh bg-background px-5 pb-16 pt-28 lg:px-8"><div className="mx-auto max-w-6xl">
    <p className="section-kicker">P15 · Ground / Research Console</p>
    <h1 className="section-title">Mission oversight without collapsing privacy boundaries.</h1>
    <p className="mt-5 max-w-3xl text-muted-foreground">Identified medical access, operational oversight and research export are separate mission-scoped capabilities. Anonymous access fails closed.</p>
    <div className="mt-8 flex max-w-2xl flex-col gap-3 sm:flex-row"><Input value={missionId} onChange={(event)=>setMissionId(event.target.value)} placeholder="Mission ID" aria-label="Mission ID"/><Button disabled={loading||!missionId.trim()} onClick={loadSnapshot}>Load ground snapshot</Button><Button disabled={loading||!missionId.trim()} variant="outline" onClick={exportResearch}><Download/> Research export</Button></div>
    <p className="mt-3 text-sm text-muted-foreground" role="status">{status}</p>
    {snapshot && <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardHeader><CardTitle>Total events</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{snapshot.total_events}</CardContent></Card>
      <Card><CardHeader><CardTitle>Crew represented</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{snapshot.crew_count}</CardContent></Card>
      <Card><CardHeader><CardTitle>Findings</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{snapshot.finding_count}</CardContent></Card>
      <Card><CardHeader><CardTitle>Pending actions context</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{snapshot.action_count}</CardContent></Card>
    </div>}
    <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{capabilityCards.map(([Icon,title,copy])=><Card key={title}><CardHeader><Icon className="size-5 text-primary"/><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{copy}</CardContent></Card>)}</div>
  </div></main>;
}
