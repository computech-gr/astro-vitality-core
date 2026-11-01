/**
 * v9 Stored observations review: lifecycle + Ground Medical status columns,
 * per-row and bulk attestation, append-only Edit/Save correction, Mark
 * erroneous, and explicit cloud review sync. All writes are append-only and
 * re-check the signed-in reviewer's roles for this exact mission + crew first.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import { markUnifiedObservationErroneous, saveUnifiedObservation } from "@/domain/health-intelligence/observation-store";
import {
  ATTESTATION_REASON_MIN,
  planAttestation,
  planRevocation,
} from "@/domain/health-intelligence/evidence-attestation";
import {
  appendAttestationEvents,
  appendSyncReceipts,
  importRemoteAttestationEvents,
  importRemoteCorrectionIntents,
  listAttestationEvents,
  listRemoteCorrectionIntents,
  listSyncReceipts,
  type RemoteCorrectionIntent,
  type SyncReceipt,
} from "@/domain/health-intelligence/review-ledger";
import {
  buildStoredObservationReview,
  completeCorrection,
  CORRECTION_REASON_MIN,
  executeCorrection,
  GROUND_MEDICAL_LABELS,
  LIFECYCLE_LABELS,
  planObservationCorrection,
  pruneSelection,
  selectionCounts,
  toggleSelectAll,
  type StoredObservationView,
} from "@/domain/health-intelligence/stored-observation-review";
import {
  correctionSyncPayload,
  mergeAttestationEvents,
  pendingForPush,
  receiptsFromServer,
  remoteRowToAttestation,
  remoteRowToCorrection,
  REVIEW_SYNC_MIGRATION_REQUIRED,
  syncCounts,
} from "@/domain/health-intelligence/review-sync";
import { notifyReviewDataChanged } from "@/domain/health-intelligence/review-change-events";
import { pullReviewEvents, pushReviewEvents } from "@/lib/review-sync.functions";

type Scope = { missionId: string; crewMemberId: string; provenance: "synthetic" | "real" };

interface Props {
  history: UnifiedObservation[];
  membership: { missionId: string; crewMemberId: string } | null;
  provenance: "" | "synthetic" | "real";
  userId: string | null;
  rolesForScope: readonly string[];
  /** Re-read the encrypted local store after any write. */
  reload: () => Promise<void>;
}

function formatObservedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString()} (local) · ${date.toISOString()} (UTC)`;
}

async function freshRoles(scope: { missionId: string; crewMemberId: string }, expectedUser: string | null) {
  const fresh = await loadMissionIdentity();
  if (!fresh.signedIn || fresh.error || !fresh.userId || fresh.userId !== expectedUser) return { userId: null, roles: [] as string[] };
  return {
    userId: fresh.userId,
    roles: fresh.memberships.filter((m) => m.missionId === scope.missionId && m.crewMemberId === scope.crewMemberId).map((m) => m.role),
  };
}

type DialogState =
  | { kind: "attest"; recordIds: string[] }
  | { kind: "revoke"; recordId: string }
  | { kind: "erroneous"; observation: UnifiedObservation }
  | { kind: "edit"; observation: UnifiedObservation }
  | null;

export function StoredObservationsReview(props: Props) {
  const { history, membership, provenance, userId, rolesForScope, reload } = props;
  const scope: Scope | null = membership && provenance ? { ...membership, provenance } : null;
  const isGroundMedical = rolesForScope.includes("ground_medical") && Boolean(userId);
  const [events, setEvents] = useState<unknown[]>([]);
  const [ledgerState, setLedgerState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<DialogState>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState("");
  const openDialog = (d: DialogState) => {
    setDialogError("");
    setDialog(d);
  };
  const fail = (message: string) => {
    setStatus(message);
    setDialogError(message);
  };

  const scopeKey = scope ? `${scope.missionId}|${scope.crewMemberId}|${scope.provenance}|${userId ?? ""}` : "";
  useEffect(() => {
    setEvents([]);
    setSelected(new Set());
    if (!scope) {
      setLedgerState("idle");
      return;
    }
    let active = true;
    setLedgerState("loading");
    void listAttestationEvents(scope)
      .then((e) => {
        if (active) {
          setEvents(e);
          setLedgerState("ready");
        }
      })
      .catch(() => active && setLedgerState("error"));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeKey captures the scope fields
  }, [scopeKey, ledgerVersion]);

  const review = useMemo(() => (scope ? buildStoredObservationReview(history, scope, events) : null), [history, scope?.missionId, scope?.crewMemberId, scope?.provenance, events]); // eslint-disable-line react-hooks/exhaustive-deps
  const views: StoredObservationView[] = useMemo(
    () =>
      review?.views ??
      history.map((o) => ({
        observation: o,
        lifecycle: o.status === "erroneous" ? "erroneous" : history.some((x) => x.supersedesId === o.id && x.status !== "erroneous") ? "superseded" : "active",
        supersededBy: null,
        groundMedical: "not_applicable",
        row: null,
        selectable: false,
        ineligibleReason: "Select provenance first.",
        attestationHistory: [],
        correctionIncomplete: false,
      })),
    [review, history],
  );
  useEffect(() => setSelected((s) => pruneSelection(views, s)), [views]);
  const counts = selectionCounts(views, selected);
  const allSelected = counts.eligible > 0 && counts.selected === counts.eligible;

  const afterWrite = async (message: string) => {
    await reload();
    setLedgerVersion((v) => v + 1);
    if (membership) notifyReviewDataChanged(membership);
    setStatus(message);
  };

  const runAttestation = async (mode: "attest" | "revoke", ids: string[], reason: string, confirmed: boolean) => {
    if (!scope || !review) return;
    setBusy(true);
    try {
      const fresh = await freshRoles(scope, userId);
      const ctx = { actorUserId: fresh.userId, rolesForScope: fresh.roles, scope, decidedAt: new Date().toISOString() };
      const plan = mode === "attest"
        ? planAttestation(review.report, ids, review.events, ctx, { reason, confirmed })
        : planRevocation(review.report, ids[0] ?? "", review.events, ctx, { reason, confirmed });
      if (!plan.ok) {
        fail(plan.reason);
        return;
      }
      const saved = await appendAttestationEvents(plan.events, scope, ctx);
      setSelected(new Set());
      setDialog(null);
      await afterWrite(
        `${mode === "attest" ? "Ground Medical attestation saved" : "Attestation revoked"} for ${saved.inserted} record(s)` +
          (saved.duplicates ? `; ${saved.duplicates} already recorded (no duplicate created)` : "") +
          (plan.skipped.length ? `; ${plan.skipped.length} skipped (${plan.skipped[0]!.reason})` : "") +
          (saved.failed.length ? `; ${saved.failed.length} FAILED: ${saved.failed.map((f) => f.recordId).join(", ")} (${saved.failed[0]!.message}). Retry those records.` : ".") +
          " Stored encrypted on this device; observations and scientific review status are unchanged.",
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : "Attestation could not be saved. Nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  const runErroneous = async (o: UnifiedObservation, reason: string, confirmed: boolean) => {
    if (!membership) return;
    if (reason.trim().length < CORRECTION_REASON_MIN || !confirmed) {
      fail(`A reason of at least ${CORRECTION_REASON_MIN} characters and confirmation are required.`);
      return;
    }
    setBusy(true);
    try {
      const fresh = await freshRoles(membership, userId);
      if (!fresh.roles.some((r) => r === "crew_self" || r === "ground_medical")) throw new Error("Your access to this mission and crew member is no longer valid.");
      await markUnifiedObservationErroneous(o, reason);
      setDialog(null);
      await afterWrite("Record marked erroneous. The original event is preserved; it no longer appears in reports or domain views.");
    } catch (error) {
      fail(error instanceof Error ? error.message : "Marking erroneous failed. Nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  const runCorrection = async (o: UnifiedObservation, draft: { metricId: string; value: string; unit: string; observedAt: string; reason: string; confirmed: boolean }) => {
    if (!scope) return;
    setBusy(true);
    try {
      const fresh = await freshRoles(scope, userId);
      const plan = planObservationCorrection(o, history, draft, { actorUserId: fresh.userId, rolesForScope: fresh.roles, scope, decidedAt: new Date().toISOString() });
      if (!plan.ok) {
        fail(plan.reason);
        return;
      }
      const outcome = await executeCorrection(plan, { save: saveUnifiedObservation });
      if (outcome.status === "failed") {
        fail(outcome.message);
        return;
      }
      setDialog(null);
      await afterWrite(
        outcome.status === "completed"
          ? `Correction saved as a new active record (${outcome.correctedId}); the original is marked erroneous and kept in history.`
          : outcome.message,
      );
    } catch (error) {
      fail(error instanceof Error ? error.message : "Correction failed. Nothing changed.");
    } finally {
      setBusy(false);
    }
  };

  const runComplete = async (corrected: UnifiedObservation) => {
    if (!scope) return;
    setBusy(true);
    try {
      const fresh = await freshRoles(scope, userId);
      const outcome = await completeCorrection(corrected, history, { actorUserId: fresh.userId, rolesForScope: fresh.roles, scope }, { save: saveUnifiedObservation });
      await afterWrite(outcome.status === "completed" ? "Correction completed: the original is now marked erroneous." : outcome.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-5" aria-label="Stored observations">
      <h2 className="text-lg font-semibold">Stored observations (this mission &amp; crew)</h2>
      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm" role="note">
        <p className="font-semibold">Accepted observations are not Ground Medical attestations.</p>
        <p className="mt-1 text-muted-foreground">
          <strong>Observation</strong> shows whether a record is Active, Erroneous or Superseded by a correction.{" "}
          <strong>Ground Medical</strong> shows the optional second-stage attestation (Not attested, Attested, Revoked, or Stale when the
          record changed after attestation). Intake acceptance is never shown as an attestation.
        </p>
        <Link className="mt-2 inline-block underline underline-offset-2" to="/mission/health-report" hash="ground-medical-attestation">
          Open the Unified Health Report attestation view
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Append-only history: <strong>Edit</strong> adds a corrected record and marks the original erroneous;{" "}
        <strong>Mark erroneous</strong> only flags a record without a replacement. Nothing is rewritten or deleted. Only active,
        reviewer-accepted observations reach domain views and Health Intelligence, as research-only evidence.
      </p>
      {!provenance && history.length > 0 && (
        <p className="text-sm text-muted-foreground" role="status">Select the data provenance above to see Ground Medical status and review controls.</p>
      )}
      {scope && ledgerState === "error" && (
        <p className="text-sm text-destructive" role="alert">The local attestation ledger could not be read; Ground Medical status is unavailable, not absent.</p>
      )}

      {isGroundMedical && scope && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm">
          <span role="status" aria-live="polite">
            {counts.selected} selected of {counts.eligible} eligible
          </span>
          <Button type="button" disabled={busy || counts.selected === 0} onClick={() => openDialog({ kind: "attest", recordIds: [...selected] })}>
            Save selected approvals
          </Button>
          <span className="text-xs text-muted-foreground">Erroneous, superseded, already-attested and other-provenance rows cannot be selected.</span>
        </div>
      )}

      {views.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                {isGroundMedical && scope && (
                  <th className="py-2 pr-2">
                    <Checkbox
                      aria-label="Select all eligible observations in this mission, crew and provenance"
                      checked={allSelected}
                      disabled={busy || counts.eligible === 0}
                      onCheckedChange={() => setSelected((s) => toggleSelectAll(views, s))}
                    />
                  </th>
                )}
                <th className="py-2 pr-3">Observed</th>
                <th className="py-2 pr-3">Metric</th>
                <th className="py-2 pr-3">Value</th>
                <th className="py-2 pr-3">Origin</th>
                <th className="py-2 pr-3">Observation</th>
                <th className="py-2 pr-3">Ground Medical</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {views.map((v) => {
                const o = v.observation;
                return (
                  <tr key={o.id} className={`border-b border-border/60 align-top ${v.lifecycle !== "active" ? "text-muted-foreground" : ""}`}>
                    {isGroundMedical && scope && (
                      <td className="py-2 pr-2">
                        <Checkbox
                          aria-label={`Select ${o.metricId} observed ${o.observedAt} for attestation`}
                          checked={selected.has(o.id)}
                          disabled={busy || !v.selectable}
                          title={v.ineligibleReason ?? undefined}
                          onCheckedChange={(c) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (c === true) n.add(o.id);
                              else n.delete(o.id);
                              return n;
                            })
                          }
                        />
                      </td>
                    )}
                    <td className="py-2 pr-3 text-xs">{formatObservedAt(o.observedAt)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{o.metricId}</td>
                    <td className={`py-2 pr-3 ${v.lifecycle !== "active" ? "line-through" : ""}`}>
                      {o.value} {o.originalUnit}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {o.source.label} · {o.provenance}
                      {o.supersedesId ? <span className="block">Corrects {o.supersedesId}</span> : null}
                      {o.statusReason && o.status === "erroneous" ? <span className="block">Reason: {o.statusReason}</span> : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={v.lifecycle === "active" ? "secondary" : "outline"}>{LIFECYCLE_LABELS[v.lifecycle]}</Badge>
                      {v.supersededBy ? <span className="block text-xs">by {v.supersededBy}</span> : null}
                    </td>
                    <td className="py-2 pr-3">
                      {v.groundMedical === "not_applicable" ? (
                        <span className="text-xs">—</span>
                      ) : (
                        <Badge variant={v.groundMedical === "attested" ? "default" : "outline"}>{GROUND_MEDICAL_LABELS[v.groundMedical]}</Badge>
                      )}
                    </td>
                    <td className="space-y-1 py-2">
                      <div className="flex flex-wrap gap-1">
                        {isGroundMedical && scope && v.selectable && (
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openDialog({ kind: "attest", recordIds: [o.id] })}>
                            Attest
                          </Button>
                        )}
                        {isGroundMedical && scope && v.groundMedical === "attested" && (
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openDialog({ kind: "revoke", recordId: o.id })}>
                            Revoke
                          </Button>
                        )}
                        {isGroundMedical && scope && v.lifecycle === "active" && o.provenance === scope.provenance && o.reviewState === "accepted" && (
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openDialog({ kind: "edit", observation: o })}>
                            Edit
                          </Button>
                        )}
                        {v.lifecycle === "active" && membership && (
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openDialog({ kind: "erroneous", observation: o })}>
                            Mark erroneous
                          </Button>
                        )}
                        {isGroundMedical && v.correctionIncomplete && (
                          <Button type="button" size="sm" disabled={busy} onClick={() => void runComplete(o)}>
                            Complete correction
                          </Button>
                        )}
                        {(v.attestationHistory.length > 0 || o.correction) && (
                          <Button type="button" size="sm" variant="ghost" aria-expanded={openHistory === o.id} onClick={() => setOpenHistory(openHistory === o.id ? null : o.id)}>
                            History
                          </Button>
                        )}
                      </div>
                      {openHistory === o.id && (
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {o.correction && (
                            <li>
                              {o.correction.decidedAt} · Correction of {o.correction.originalRecordId} by Ground Medical {o.correction.actorUserId}: {o.correction.reason}
                            </li>
                          )}
                          {v.attestationHistory.map((e) => (
                            <li key={e.eventId}>
                              {e.decidedAt} · {e.action === "attest" ? "Attested" : "Revoked"} by Ground Medical {e.actorUserId} · {e.reason} · event {e.eventId}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No records for this mission and crew.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Active, domain-readable observations: {views.filter((v) => v.lifecycle === "active" && v.observation.reviewState === "accepted").length} of {views.length}{" "}
        (research-only evidence adapters; no clinical activation).
      </p>
      {status && (
        <p className="text-sm" role="status" aria-live="polite">
          {status}
        </p>
      )}

      {scope && membership && (
        <ReviewCloudSync scope={scope} userId={userId} rolesForScope={rolesForScope} history={history} onImported={() => afterWrite("Cloud review events merged into this device.")} ledgerVersion={ledgerVersion} />
      )}

      <ReviewDialog
        state={dialog}
        busy={busy}
        onClose={() => setDialog(null)}
        onAttest={(ids, reason, confirmed) => void runAttestation("attest", ids, reason, confirmed)}
        onRevoke={(id, reason, confirmed) => void runAttestation("revoke", [id], reason, confirmed)}
        onErroneous={(o, reason, confirmed) => void runErroneous(o, reason, confirmed)}
        onCorrect={(o, draft) => void runCorrection(o, draft)}
        error={dialogError}
      />
    </section>
  );
}

function ReviewDialog(props: {
  state: DialogState;
  busy: boolean;
  error: string;
  onClose: () => void;
  onAttest: (ids: string[], reason: string, confirmed: boolean) => void;
  onRevoke: (id: string, reason: string, confirmed: boolean) => void;
  onErroneous: (o: UnifiedObservation, reason: string, confirmed: boolean) => void;
  onCorrect: (o: UnifiedObservation, draft: { metricId: string; value: string; unit: string; observedAt: string; reason: string; confirmed: boolean }) => void;
}) {
  const { state } = props;
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [metricId, setMetricId] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [observedAt, setObservedAt] = useState("");
  useEffect(() => {
    setReason("");
    setConfirmed(false);
    if (state?.kind === "edit") {
      setMetricId(state.observation.metricId);
      setValue(state.observation.value);
      setUnit(state.observation.originalUnit);
      setObservedAt(new Date(state.observation.observedAt).toISOString());
    }
  }, [state]);
  if (!state) return null;
  const min = state.kind === "erroneous" || state.kind === "edit" ? CORRECTION_REASON_MIN : ATTESTATION_REASON_MIN;
  const title =
    state.kind === "attest" ? `Ground Medical attestation (${state.recordIds.length} record${state.recordIds.length === 1 ? "" : "s"})`
      : state.kind === "revoke" ? "Revoke Ground Medical attestation"
      : state.kind === "erroneous" ? "Mark observation erroneous"
      : "Edit observation (append-only correction)";
  const ready = reason.trim().length >= min && confirmed && !props.busy;
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {state.kind === "attest" && "Confirms the evidence record only. It does not change the observation, catalog or scientific review status and is not a diagnosis or legal signature."}
            {state.kind === "revoke" && "Appends a revocation that supersedes the attestation. The original attestation stays in the audit history."}
            {state.kind === "erroneous" && "Flags the record as erroneous without a replacement. The original stays in history; use Edit instead when you have the corrected value."}
            {state.kind === "edit" && "Saves a NEW active record that supersedes this one, then marks this one erroneous. Units are never converted; the metric and unit must be an exact catalog pair."}
          </DialogDescription>
        </DialogHeader>
        {state.kind === "edit" && (
          <div className="grid gap-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Original: {state.observation.metricId} = {state.observation.value} {state.observation.originalUnit} at {state.observation.observedAt} · {state.observation.provenance} · source {state.observation.source.label}
            </p>
            <div className="space-y-1">
              <Label htmlFor="corr-metric">Catalog metric ID</Label>
              <Input id="corr-metric" value={metricId} onChange={(e) => setMetricId(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="corr-value">Value</Label>
                <Input id="corr-value" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="corr-unit">Unit (exact)</Label>
                <Input id="corr-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="corr-observed">Observed at (ISO, UTC)</Label>
              <Input id="corr-observed" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} placeholder="2026-10-14T07:35:00.000Z" />
            </div>
            <p className="text-xs text-muted-foreground">Provenance ({state.observation.provenance}) and source ({state.observation.source.label}) are preserved from the original.</p>
          </div>
        )}
        <div className="space-y-1 text-sm">
          <Label htmlFor="review-reason">Reason (required, at least {min} characters)</Label>
          <Textarea id="review-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={confirmed} onCheckedChange={(c) => setConfirmed(c === true)} aria-label="Confirm this append-only decision" />
          <span>I confirm this decision for exactly this mission, crew member and provenance. It is recorded with my account and the UTC time and cannot be edited later.</span>
        </label>
        {props.error && (
          <p className="text-sm text-destructive" role="alert">
            {props.error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!ready}
            onClick={() => {
              if (state.kind === "attest") props.onAttest(state.recordIds, reason, confirmed);
              else if (state.kind === "revoke") props.onRevoke(state.recordId, reason, confirmed);
              else if (state.kind === "erroneous") props.onErroneous(state.observation, reason, confirmed);
              else props.onCorrect(state.observation, { metricId, value, unit, observedAt, reason, confirmed });
            }}
          >
            {state.kind === "attest" ? "Save approval" : state.kind === "revoke" ? "Revoke" : state.kind === "erroneous" ? "Mark erroneous" : "Save correction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewCloudSync(props: { scope: Scope; userId: string | null; rolesForScope: readonly string[]; history: UnifiedObservation[]; onImported: () => Promise<void>; ledgerVersion: number }) {
  const { scope, userId, rolesForScope, history } = props;
  const canPush = rolesForScope.includes("ground_medical") && Boolean(userId);
  const canPull = canPush || rolesForScope.includes("crew_self");
  const [receipts, setReceipts] = useState<SyncReceipt[]>([]);
  const [local, setLocal] = useState<Awaited<ReturnType<typeof listAttestationEvents>>>([]);
  const [remoteCorrections, setRemoteCorrections] = useState<RemoteCorrectionIntent[]>([]);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const key = `${scope.missionId}|${scope.crewMemberId}|${scope.provenance}`;
  useEffect(() => {
    let active = true;
    void Promise.all([listAttestationEvents(scope), listSyncReceipts(scope), listRemoteCorrectionIntents(scope)])
      .then(([a, r, c]) => {
        if (!active) return;
        setLocal(a);
        setReceipts(r);
        setRemoteCorrections(c);
      })
      .catch(() => active && setMessage("Local review ledger unavailable; sync status unknown."));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures scope
  }, [key, version, props.ledgerVersion]);
  useEffect(() => {
    setFailed(new Set());
    setMessage("");
  }, [key]);

  const corrections = useMemo(
    () => history.filter((o) => o.missionId === scope.missionId && o.crewMemberId === scope.crewMemberId && o.provenance === scope.provenance).map(correctionSyncPayload).filter((p): p is NonNullable<typeof p> => p !== null),
    [history, scope.missionId, scope.crewMemberId, scope.provenance],
  );
  const counts = syncCounts(local, corrections, receipts, failed, userId);

  const sync = async () => {
    if (!userId || !canPull) return;
    setBusy(true);
    setMessage("Syncing review metadata…");
    try {
      const fresh = await freshRoles(scope, userId);
      if (!fresh.userId) throw new Error("Your session changed. Sign in again; nothing was synced.");
      const now = new Date().toISOString();
      const notes: string[] = [];
      const nextFailed = new Set<string>();
      if (canPush && fresh.roles.includes("ground_medical")) {
        const push = pendingForPush(local, corrections, receipts, fresh.userId);
        if (push.attestations.length || push.corrections.length) {
          const result = await pushReviewEvents({ data: { scope, attestations: push.attestations, corrections: push.corrections } });
          if (!result.ok) {
            setMessage(result.code === "migration_required" ? `${REVIEW_SYNC_MIGRATION_REQUIRED}. Local events are kept on this device; nothing was synced.` : `${result.message} Local events are kept.`);
            return;
          }
          await appendSyncReceipts(receiptsFromServer(result.results, now), scope, fresh.userId);
          for (const r of result.results) if (r.status === "rejected") nextFailed.add(r.id);
          const by = (s: string) => result.results.filter((r) => r.status === s).length;
          notes.push(`sent ${result.results.length}: ${by("inserted")} new, ${by("duplicate")} already in cloud, ${by("conflict")} conflict, ${by("rejected")} rejected${by("rejected") ? ` (${result.results.find((r) => r.status === "rejected")?.detail ?? "server validation"})` : ""}`);
        } else notes.push("nothing new to send");
      }
      // Pull (paginated); absence from a page is never treated as deletion.
      let imported = 0;
      let conflicts = 0;
      for (const kind of ["attestation", "correction"] as const) {
        let afterSeq: number = 0;
        for (let page = 0; page < 20; page++) {
          const res: Awaited<ReturnType<typeof pullReviewEvents>> = await pullReviewEvents({ data: { scope, kind, afterSeq, limit: 500 } });
          if (!res.ok) {
            setMessage(res.code === "migration_required" ? `${REVIEW_SYNC_MIGRATION_REQUIRED}. Local events are kept on this device.` : `${notes.join("; ")}${notes.length ? "; " : ""}${res.message}`);
            setFailed(nextFailed);
            return;
          }
          if (kind === "attestation") {
            const remote = res.rows.map((r) => remoteRowToAttestation(r, scope)).filter((e): e is NonNullable<typeof e> => e !== null);
            const merged = mergeAttestationEvents(await listAttestationEvents(scope), remote);
            conflicts += merged.conflicts.length;
            imported += (await importRemoteAttestationEvents(merged.imported, scope)).inserted;
            await appendSyncReceipts(
              [
                ...remote.filter((e) => !merged.conflicts.some((c) => c.eventId === e.eventId)).map((e) => ({ kind: "attestation" as const, eventId: e.eventId, status: "synced" as const, serverReceivedAt: null, recordedAt: now })),
                ...merged.conflicts.map((c) => ({ kind: "attestation" as const, eventId: c.eventId, status: "conflict" as const, serverReceivedAt: null, recordedAt: now, detail: c.detail })),
              ],
              scope,
              fresh.userId,
            );
          } else {
            const remote = res.rows.map((r) => remoteRowToCorrection(r, scope)).filter((e): e is NonNullable<typeof e> => e !== null);
            imported += await importRemoteCorrectionIntents(remote, scope);
            await appendSyncReceipts(remote.map((c) => ({ kind: "correction" as const, eventId: c.intentId, status: "synced" as const, serverReceivedAt: c.serverReceivedAt, recordedAt: now })), scope, fresh.userId);
          }
          afterSeq = res.lastSeq;
          if (!res.hasMore) break;
        }
      }
      setFailed(nextFailed);
      notes.push(`received ${imported} new event(s) from the cloud${conflicts ? `, ${conflicts} conflict(s) kept locally` : ""}`);
      setMessage(`Sync finished at ${now}: ${notes.join("; ")}.`);
      if (imported) await props.onImported();
    } catch (error) {
      setMessage(`Sync failed: ${error instanceof Error ? error.message : "network error"}. Local events are kept; use Retry.`);
    } finally {
      setBusy(false);
      setVersion((v) => v + 1);
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-sm" aria-label="Cloud review sync">
      <p className="font-semibold">Cloud review sync (explicit, metadata only)</p>
      <p className="text-xs text-muted-foreground">
        Sends only Ground Medical attestation, revocation and correction metadata (record IDs, fingerprints, reviewer, reason, UTC time) — never
        measured values, documents or AI drafts. Nothing syncs automatically. The cloud checks your Ground Medical membership for this exact mission
        and crew member.
      </p>
      <p role="status" aria-live="polite" className="text-xs">
        Pending {counts.pending} · Synced {counts.synced} · Failed {counts.failed} · Conflict {counts.conflict}
        {counts.otherAuthor ? ` · ${counts.otherAuthor} by another reviewer (only they can send them)` : ""} · Last sync {counts.lastSyncedAt ?? "never"}
        {remoteCorrections.length ? ` · ${remoteCorrections.length} correction(s) recorded on other devices (values stay on the recording device)` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !canPull} onClick={() => void sync()}>
          {canPush ? "Sync reviews to cloud" : "Fetch reviews from cloud"}
        </Button>
        {(counts.failed > 0 || message.startsWith("Sync failed")) && (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void sync()}>
            Retry
          </Button>
        )}
      </div>
      {!canPull && <p className="text-xs text-muted-foreground">Cloud review sync requires Ground Medical or the crew member's own access.</p>}
      {message && (
        <p className="text-xs" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
