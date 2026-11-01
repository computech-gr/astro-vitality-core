import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { loadMissionIdentity, subscribeMissionIdentity } from "@/infrastructure/mission-identity";
import {
  decideGroundMedicalBatch, getGroundMedicalBatch, listGroundMedicalPending, newDecisionIdempotencyKey,
  type ResearchDecision,
} from "@/infrastructure/p368b-ground-medical-review";
import { createGroundMedicalReviewScope } from "@/components/p368b-ground-medical-review-scope";

const DECISION_LABEL: Record<ResearchDecision, string> = {
  accepted_for_research: "Accept for research",
  rejected_for_research: "Reject for research",
};

export function GroundMedicalReviewPanel() {
  // Mission membership is filtered to m.role === "ground_medical" inside the review scope.
  const [scope] = useState(() => createGroundMedicalReviewScope({
    loadIdentity: loadMissionIdentity,
    subscribeIdentity: subscribeMissionIdentity,
    listPending: listGroundMedicalPending,
    getBatch: getGroundMedicalBatch,
    decide: decideGroundMedicalBatch,
  }));
  const snapshot = useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
  const { missions, missionId, queue, queueLoad, status, error, revalidating, selectedBatch, details, detailLoad, deciding, receipt } = snapshot;
  const [pendingDecision, setPendingDecision] = useState<ResearchDecision | null>(null);
  const [note, setNote] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const inFlight = useRef(false);
  // One idempotency key per batch view; retries of the same view replay the same receipt.
  const decisionKey = useRef("");

  useEffect(() => scope.start(), [scope]);
  // Any selection or scope change drops the per-view decision draft.
  useEffect(() => {
    setPendingDecision(null); setNote(""); setDecisionError("");
    if (!selectedBatch) decisionKey.current = "";
  }, [selectedBatch, missionId]);

  const busy = deciding || queueLoad === "loading" || detailLoad === "loading";

  async function viewBatch(batchId: string) {
    decisionKey.current = "";
    const rows = await scope.viewBatch(batchId);
    decisionKey.current = rows?.length ? newDecisionIdempotencyKey() : "";
  }

  async function confirmDecision() {
    const decision = pendingDecision;
    if (!decision || inFlight.current || !selectedBatch || !details.length || !decisionKey.current) return;
    if (!details.every(d => d.review_status === "pending_review")) return;
    inFlight.current = true; setDecisionError("");
    try {
      await scope.decide({ decision, note, idempotencyKey: decisionKey.current });
      setPendingDecision(null);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : "Decision could not be recorded.");
      setPendingDecision(null);
    } finally { inFlight.current = false; }
  }

  const isPending = details.length > 0 && details.every(d => d.review_status === "pending_review");

  return <section className="mt-8" aria-label="Ground Medical synthetic review queue">
    <Card><CardHeader><CardTitle>P36.8C · Ground Medical synthetic research review</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Synthetic research demonstration only. A decision marks a batch as usable or excluded for research demonstration. It is not medical validation, diagnosis or clinical approval, and nothing is promoted into health records. Submitted values are never changed.</p>
        <label className="block text-sm font-medium" htmlFor="p368b-mission">Ground Medical mission</label>
        <select id="p368b-mission" className="w-full rounded-md border border-border bg-background p-3 text-foreground" value={missionId} disabled={revalidating} onChange={e => scope.selectMission(e.target.value)}>
          <option value="">Select Ground Medical mission</option>
          {missions.map(m => <option key={m.missionId} value={m.missionId}>{m.missionCode ?? m.missionName ?? m.missionId}</option>)}
        </select>
        <Button disabled={busy || revalidating || !missionId} onClick={() => void scope.refresh()}>Refresh pending reviews</Button>
        <p role="status" aria-live="polite" aria-busy={queueLoad === "loading" || revalidating} className="text-sm text-muted-foreground">{revalidating ? "Re-checking Ground Medical authorization…" : status}</p>
        {!revalidating && error && <p role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{error} Use “Refresh pending reviews” to try again.</p>}
        {!revalidating && receipt && <div role="status" aria-label="Decision receipt" className="rounded-md border border-border bg-muted p-3 text-sm">
          <p className="font-medium">{DECISION_LABEL[receipt.decision]} · research only</p>
          <p className="text-muted-foreground">Receipt: <span className="font-mono">{receipt.decision_request_id}</span></p>
          <p className="text-muted-foreground">Batch {receipt.batch_id.slice(0, 8)}… · {new Date(receipt.decided_at).toISOString()}{receipt.replay ? " · previously recorded" : ""}</p>
        </div>}
        {!revalidating && queueLoad === "loaded" && queue.length === 0 && <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground" aria-label="No pending synthetic batches">No pending synthetic submissions are waiting for review in this mission.</p>}
        {!revalidating && queue.length > 0 && <div className="space-y-3" aria-label="Pending synthetic batches">
          {queue.map(batch => <div key={batch.batch_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
            <div className="text-sm"><p className="font-medium">{batch.item_count} values · {batch.review_status}</p><p className="text-muted-foreground">Observed: {batch.observed_on} · Batch: {batch.batch_id.slice(0, 8)}…</p></div>
            <Button variant="outline" disabled={busy} onClick={() => void viewBatch(batch.batch_id)}>View values</Button>
          </div>)}
        </div>}
        {!revalidating && selectedBatch && details.length > 0 && <div className="overflow-x-auto" aria-label="Synthetic biomarker details">
          <p className="mb-2 text-sm font-medium">Synthetic values · {selectedBatch.slice(0, 8)}…</p>
          <table className="w-full text-left text-sm"><thead><tr className="border-b border-border"><th className="p-2">Metric</th><th className="p-2">Value</th><th className="p-2">Unit</th><th className="p-2">Source excerpt</th></tr></thead><tbody>
            {details.map((item, index) => <tr key={`${item.metric_id}:${index}`} className="border-b border-border"><td className="p-2">{item.metric_id}</td><td className="p-2">{item.measured_value}</td><td className="p-2">{item.unit}</td><td className="p-2">{item.source_excerpt ?? "—"}</td></tr>)}
          </tbody></table>
        </div>}
        {!revalidating && selectedBatch && isPending && <div className="space-y-3 rounded-md border border-border p-3" aria-label="Research decision">
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
