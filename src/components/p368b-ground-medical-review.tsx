import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import { getGroundMedicalBatch, listGroundMedicalPending, type GroundMedicalPendingBatch, type GroundMedicalReviewItem } from "@/infrastructure/p368b-ground-medical-review";

export function GroundMedicalReviewPanel() {
  const [missions, setMissions] = useState<MissionMembershipContext[]>([]);
  const [missionId, setMissionId] = useState("");
  const [queue, setQueue] = useState<GroundMedicalPendingBatch[]>([]);
  const [details, setDetails] = useState<GroundMedicalReviewItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [status, setStatus] = useState("Select your Ground Medical mission to load pending synthetic submissions.");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const update = async () => {
      try {
        const identity = await loadMissionIdentity();
        if (!live) return;
        const allowed = identity.memberships.filter(m => m.role === "ground_medical");
        setMissions(allowed);
        setMissionId(previous => allowed.some(m => m.missionId === previous) ? previous : (allowed.length === 1 ? allowed[0].missionId : ""));
      } catch {
        if (live) { setMissions([]); setMissionId(""); }
      }
      if (live) { setQueue([]); setDetails([]); setSelectedBatch(""); }
    };
    void update();
    const unsubscribe = subscribeMissionIdentity(() => { void update(); });
    return () => { live = false; unsubscribe(); };
  }, []);

  async function refreshQueue() {
    if (!missions.some(m => m.missionId === missionId)) return;
    setBusy(true); setQueue([]); setDetails([]); setSelectedBatch("");
    try {
      const rows = await listGroundMedicalPending(missionId);
      setQueue(rows);
      setStatus(`${rows.length} pending synthetic batch(es). Read-only; no decisions can be made here.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review queue unavailable.");
    } finally { setBusy(false); }
  }

  async function viewBatch(batchId: string) {
    if (!queue.some(row => row.batch_id === batchId)) return;
    setBusy(true); setDetails([]); setSelectedBatch(batchId);
    try {
      const rows = await getGroundMedicalBatch(missionId, batchId);
      setDetails(rows);
      setStatus(rows.length ? `${rows.length} synthetic biomarker value(s) loaded read-only.` : "Batch is no longer available for independent review.");
    } catch (error) {
      setSelectedBatch("");
      setStatus(error instanceof Error ? error.message : "Batch detail unavailable.");
    } finally { setBusy(false); }
  }

  return <section className="mt-8" aria-label="Ground Medical synthetic review queue">
    <Card><CardHeader><CardTitle>P36.8B · Ground Medical synthetic review queue</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Synthetic research demonstration only. Pending submissions are read-only; no medical validation, diagnosis, approval, or clinical record promotion.</p>
        <label className="block text-sm font-medium" htmlFor="p368b-mission">Ground Medical mission</label>
        <select id="p368b-mission" className="w-full rounded-md border border-border bg-background p-3 text-foreground" value={missionId} onChange={e => { setMissionId(e.target.value); setQueue([]); setDetails([]); setSelectedBatch(""); }}>
          <option value="">Select Ground Medical mission</option>
          {missions.map(m => <option key={m.missionId} value={m.missionId}>{m.missionCode ?? m.missionName ?? m.missionId}</option>)}
        </select>
        <Button disabled={busy || !missionId} onClick={() => void refreshQueue()}>Refresh pending reviews</Button>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
        {queue.length > 0 && <div className="space-y-3" aria-label="Pending synthetic batches">
          {queue.map(batch => <div key={batch.batch_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="text-sm"><p className="font-medium">{batch.item_count} values · {batch.review_status}</p><p className="text-muted-foreground">Observed: {batch.observed_on} · Batch: {batch.batch_id.slice(0, 8)}…</p></div>
            <Button variant="outline" disabled={busy} onClick={() => void viewBatch(batch.batch_id)}>View values</Button>
          </div>)}
        </div>}
        {selectedBatch && details.length > 0 && <div className="overflow-x-auto" aria-label="Synthetic biomarker details">
          <p className="mb-2 text-sm font-medium">Synthetic values · {selectedBatch.slice(0, 8)}…</p>
          <table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-2">Metric</th><th className="p-2">Value</th><th className="p-2">Unit</th><th className="p-2">Source excerpt</th></tr></thead><tbody>
            {details.map((item, index) => <tr key={`${item.metric_id}:${index}`} className="border-b border-border"><td className="p-2">{item.metric_id}</td><td className="p-2">{item.measured_value}</td><td className="p-2">{item.unit}</td><td className="p-2">{item.source_excerpt ?? "—"}</td></tr>)}
          </tbody></table>
        </div>}
      </CardContent>
    </Card>
  </section>;
}
