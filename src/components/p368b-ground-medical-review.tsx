import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import {
  decideGroundMedicalBatch, getGroundMedicalBatch, listGroundMedicalPending, newDecisionIdempotencyKey,
  type GroundMedicalPendingBatch, type GroundMedicalReviewItem, type ResearchDecision, type ResearchDecisionReceipt,
} from "@/infrastructure/p368b-ground-medical-review";

const DECISION_LABEL: Record<ResearchDecision, string> = {
  accepted_for_research: "Accept for research",
  rejected_for_research: "Reject for research",
};

export function GroundMedicalReviewPanel() {
  const [missions, setMissions] = useState<MissionMembershipContext[]>([]);
  const [missionId, setMissionId] = useState("");
  const [queue, setQueue] = useState<GroundMedicalPendingBatch[]>([]);
  const [details, setDetails] = useState<GroundMedicalReviewItem[]>([]);
  const [selectedBatch, setSelectedBatch] = useState("");
  const [status, setStatus] = useState("Select your Ground Medical mission to load pending synthetic submissions.");
  const [busy, setBusy] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<ResearchDecision | null>(null);
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState<ResearchDecisionReceipt | null>(null);
  const [decisionError, setDecisionError] = useState("");
  const inFlight = useRef(false);
  // One idempotency key per batch view; retries of the same view replay the same receipt.
  const decisionKey = useRef("");

  function clearSelection() { setDetails([]); setSelectedBatch(""); setPendingDecision(null); setNote(""); setDecisionError(""); decisionKey.current = ""; }

  useEffect(() => {
    let live = true;
    const update = async () => {
      try {
        const identity = await loadMissionIdentity();
        if (!live) return;
        const allowed = identity.memberships.filter(m => m.role === "ground_medical");
        setMissions(allowed);
        setMissionId(previous => allowed.some(m => m.missionId === previous) ? previous : (allowed.length === 1 ? (allowed[0]?.missionId ?? "") : ""));
      } catch {
        if (live) { setMissions([]); setMissionId(""); }
      }
      if (live) { setQueue([]); clearSelection(); setReceipt(null); }
    };
    void update();
    const unsubscribe = subscribeMissionIdentity(() => { void update(); });
    return () => { live = false; unsubscribe(); };
  }, []);

  async function refreshQueue(message?: string) {
    if (!missions.some(m => m.missionId === missionId)) return;
    setBusy(true); setQueue([]); clearSelection();
    try {
      const rows = await listGroundMedicalPending(missionId);
      setQueue(rows);
      setStatus(message ?? `${rows.length} pending synthetic batch(es).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Review queue unavailable.");
    } finally { setBusy(false); }
  }

  async function viewBatch(batchId: string) {
    if (!queue.some(row => row.batch_id === batchId)) return;
    setBusy(true); clearSelection(); setReceipt(null); setSelectedBatch(batchId);
    try {
      const rows = await getGroundMedicalBatch(missionId, batchId);
      setDetails(rows);
      decisionKey.current = rows.length ? newDecisionIdempotencyKey() : "";
      setStatus(rows.length ? `${rows.length} synthetic biomarker value(s) loaded.` : "Batch is no longer available for independent review.");
    } catch (error) {
      setSelectedBatch("");
      setStatus(error instanceof Error ? error.message : "Batch detail unavailable.");
    } finally { setBusy(false); }
  }

  async function confirmDecision() {
    const decision = pendingDecision;
    if (!decision || inFlight.current || !selectedBatch || !details.length || !decisionKey.current) return;
    if (!details.every(d => d.review_status === "pending_review")) return;
    inFlight.current = true; setBusy(true); setDecisionError("");
    try {
      const r = await decideGroundMedicalBatch({
        missionId, batchId: selectedBatch, decision, note,
        idempotencyKey: decisionKey.current, expectedItemCount: details.length,
      });
      setReceipt(r);
      setPendingDecision(null);
      inFlight.current = false; setBusy(false);
      await refreshQueue(`Decision recorded: ${DECISION_LABEL[r.decision]}${r.replay ? " (previously recorded)" : ""}.`);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Decision could not be recorded.");
      setPendingDecision(null);
    } finally { inFlight.current = false; setBusy(false); }
  }

  const isPending = details.length > 0 && details.every(d => d.review_status === "pending_review");

  return <section className="mt-8" aria-label="Ground Medical synthetic review queue">
    <Card><CardHeader><CardTitle>P36.8C · Ground Medical synthetic research review</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Synthetic research demonstration only. A decision marks a batch as usable or excluded for research demonstration. It is not medical validation, diagnosis or clinical approval, and nothing is promoted into health records. Submitted values are never changed.</p>
        <label className="block text-sm font-medium" htmlFor="p368b-mission">Ground Medical mission</label>
        <select id="p368b-mission" className="w-full rounded-md border border-border bg-background p-3 text-foreground" value={missionId} onChange={e => { setMissionId(e.target.value); setQueue([]); clearSelection(); setReceipt(null); }}>
          <option value="">Select Ground Medical mission</option>
          {missions.map(m => <option key={m.missionId} value={m.missionId}>{m.missionCode ?? m.missionName ?? m.missionId}</option>)}
        </select>
        <Button disabled={busy || !missionId} onClick={() => void refreshQueue()}>Refresh pending reviews</Button>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{status}</p>
        {receipt && <div role="status" aria-label="Decision receipt" className="rounded-md border border-border bg-muted p-3 text-sm">
          <p className="font-medium">{DECISION_LABEL[receipt.decision]} · research only</p>
          <p className="text-muted-foreground">Receipt: <span className="font-mono">{receipt.decision_request_id}</span></p>
          <p className="text-muted-foreground">Batch {receipt.batch_id.slice(0, 8)}… · {new Date(receipt.decided_at).toISOString()}{receipt.replay ? " · previously recorded" : ""}</p>
        </div>}
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
        {selectedBatch && isPending && <div className="space-y-3 rounded-md border border-border p-3" aria-label="Research decision">
          <label htmlFor="p368c-note" className="block text-sm font-medium">Optional note (plain text, max 500)</label>
          <Textarea id="p368c-note" maxLength={500} value={note} disabled={busy} onChange={e => { setNote(e.target.value); setDecisionError(""); }} />
          <div className="flex flex-wrap gap-3">
            <Button disabled={busy} onClick={() => setPendingDecision("accepted_for_research")}>Accept for research</Button>
            <Button variant="outline" disabled={busy} onClick={() => setPendingDecision("rejected_for_research")}>Reject for research</Button>
          </div>
          {decisionError && <p role="alert" className="text-sm text-destructive">{decisionError}</p>}
        </div>}
      </CardContent>
    </Card>
    <AlertDialog open={pendingDecision !== null} onOpenChange={open => { if (!open && !inFlight.current) setPendingDecision(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pendingDecision ? DECISION_LABEL[pendingDecision] : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            This batch contains synthetic data only. The decision is for research demonstration only, has no clinical meaning and is final. Submitted values will not change. {details.length} value(s) will be covered.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void confirmDecision(); }}>Confirm decision</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
