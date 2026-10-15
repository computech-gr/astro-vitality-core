import { GroundMedicalReviewPanel } from "@/components/p368b-ground-medical-review";
import { useEffect, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import { consoleSelectionKey, orderConsoleMemberships, resolveConsoleSelection } from "@/domain/mission-access/role-compatibility";
import { loadDeidentifiedResearchExport, loadGroundMissionSnapshot, type GroundSnapshotDto } from "@/infrastructure/ground-research";

export function GroundResearchConsolePage() {
  const [memberships, setMemberships] = useState<MissionMembershipContext[]>([]);
  const [selectionKey, setSelectionKey] = useState("");
  const [snapshot, setSnapshot] = useState<GroundSnapshotDto>();
  const [status, setStatus] = useState("Sign in with an active research or ground medical mission membership.");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const identity = await loadMissionIdentity();
        if (!live) return;
        const eligible = orderConsoleMemberships(identity.memberships);
        setMemberships(eligible);
        setSelectionKey(previous => { const next = resolveConsoleSelection(eligible, previous); return next ? consoleSelectionKey(next) : ""; });
        setSnapshot(undefined);
      } catch { if (live) { setMemberships([]); setSelectionKey(""); setSnapshot(undefined); } }
    };
    void refresh();
    const unsubscribe = subscribeMissionIdentity(() => { void refresh(); });
    return () => { live = false; unsubscribe(); };
  }, []);
  // FV-01.4.3 F3: selection is mission+role, resolved deterministically; the server still authorizes every call.
  const selected = memberships.find(m => consoleSelectionKey(m) === selectionKey);
  async function loadSnapshot() {
    if (!selected || selected.role !== "ground_medical") return;
    setBusy(true);
    try { setSnapshot(await loadGroundMissionSnapshot(selected.missionId)); setStatus("Ground medical snapshot loaded."); }
    catch (error) { setSnapshot(undefined); setStatus(error instanceof Error ? error.message : "Snapshot unavailable"); }
    finally { setBusy(false); }
  }
  async function exportResearch() {
    if (!selected) return;
    setBusy(true);
    try {
      const rows = await loadDeidentifiedResearchExport(selected.missionId);
      if (!rows.length) { setStatus("Research export suppressed: cohort or event-volume threshold not met."); return; }
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "mitochondria-research-aggregate-v1.json"; anchor.click();
      URL.revokeObjectURL(url);
      setStatus("Aggregate-only research summary prepared. No individual records exported.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Research export unavailable"); }
    finally { setBusy(false); }
  }
  return <main className="min-h-dvh bg-background px-5 pb-16 pt-28 lg:px-8"><div className="mx-auto max-w-5xl">
    <p className="section-kicker">P28 · Research Privacy Workspace</p>
    <h1 className="section-title">Research access with enforced privacy boundaries.</h1>
    <p className="mt-5 max-w-3xl text-muted-foreground">Researcher access is aggregate-only. No individual events, pseudonyms, exact times, payloads, source IDs or medical records are exported. Small cohorts and low-volume missions are suppressed by the server.</p>
    <h2 className="sr-only">Research export workspace</h2>
    <Card className="mt-8"><CardHeader><CardTitle>Authorized mission context</CardTitle></CardHeader><CardContent className="space-y-4">
      <label htmlFor="p28-mission" className="block text-sm font-medium">Active research / medical mission and role</label>
      <select id="p28-mission" className="w-full rounded-md border border-border bg-background p-3 text-foreground" value={selectionKey} onChange={e => { setSelectionKey(e.target.value); setSnapshot(undefined); }}>
        {!memberships.length && <option value="">No eligible active membership</option>}
        {memberships.map(m => <option key={`${m.missionId}:${m.role}`} value={consoleSelectionKey(m)}>{m.missionName ?? m.missionCode ?? m.missionId} — {m.role === "ground_medical" ? "Ground medical" : "Researcher"}</option>)}
      </select>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy || !selected} onClick={() => void exportResearch()}><Download className="mr-2 size-4"/> Export aggregate</Button>
        <Button variant="outline" disabled={busy || selected?.role !== "ground_medical"} onClick={() => void loadSnapshot()}>Ground medical snapshot</Button>
      </div>
      {selected && <p className="text-xs text-muted-foreground">Acting as: {selected.role === "ground_medical" ? "Ground medical" : "Researcher"}</p>}
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
    </CardContent></Card>
    {snapshot && selected?.role === "ground_medical" && <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {([ ["Events", snapshot.total_events], ["Crew", snapshot.crew_count], ["Findings", snapshot.finding_count] ] as const).map(([label,value]) => <Card key={label}><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent className="text-3xl font-semibold">{value}</CardContent></Card>)}
    </div>}
    <GroundMedicalReviewPanel />
    <div className="mt-8 flex gap-3 text-sm text-muted-foreground"><ShieldCheck className="size-5 shrink-0 text-primary"/><p>Server-side mission-role authorization, minimum three distinct contributing crew, minimum ten events, count bucketing, and audit events. This is a privacy-contained exploratory export, not a claim of formal anonymization or approved human-subjects research.</p></div>
  </div></main>;
}
