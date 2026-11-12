/**
 * v9 Stored observations review: lifecycle + Ground Medical status columns,
 * per-row and bulk attestation, append-only Edit/Save correction, Mark
 * erroneous, and the explicit v9.4 "Sync observations & reviews" action. All writes are append-only and
 * re-check the signed-in reviewer's roles for this exact mission + crew first.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { CompactScrollRegion } from "@/components/compact-review";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import {
  importUnifiedObservationEvent,
  listUnifiedObservationEvents,
  listUnifiedObservations,
  markUnifiedObservationErroneous,
  saveUnifiedObservation,
} from "@/domain/health-intelligence/observation-store";
import {
  ATTESTATION_REASON_MIN,
  planAttestation,
  planRevocation,
} from "@/domain/health-intelligence/evidence-attestation";
import {
  appendAttestationEvents,
  appendObservationSyncReceipts,
  appendSyncRun,
  listAttestationEvents,
  listObservationSyncReceipts,
  listRemoteCorrectionIntents,
  listSyncReceipts,
  listSyncRuns,
  type RemoteCorrectionIntent,
  type SyncReceipt,
  type SyncRunRecord,
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
import { correctionSyncPayload, syncCounts } from "@/domain/health-intelligence/review-sync";
import { runReviewSync } from "@/domain/health-intelligence/review-sync-runner";
import {
  observationSyncCounts,
  reconcileReviewEvents,
  type ObservationSyncCounts,
  type ObservationSyncEvent,
  type ObservationSyncReceipt,
} from "@/domain/health-intelligence/observation-sync";
import { runObservationSync } from "@/domain/health-intelligence/observation-sync-runner";
import { notifyReviewDataChanged } from "@/domain/health-intelligence/review-change-events";
import { pullReviewEvents, pushReviewEvents } from "@/lib/review-sync.functions";
import { pullObservationEvents, pushObservationEvents } from "@/lib/observation-sync.functions";

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

import { isCalendarDate } from "@/domain/health-intelligence/observation-date";

function formatObservedAt(iso: string): string {
  if (isCalendarDate(iso)) return `${iso} (date only; time/timezone not supplied)`;
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

  const toggleAll = () => setSelected((s) => toggleSelectAll(views, s));
  const renderIneligible = (v: StoredObservationView, layout: "table" | "card") =>
    !v.selectable ? <span id={`eligibility-${layout}-${v.observation.id}`} className="sr-only">{v.ineligibleReason ?? "Not eligible for bulk attestation"}</span> : null;
  const renderSelect = (v: StoredObservationView, layout: "table" | "card") => {
    const o = v.observation;
    return (
      <Checkbox
        aria-label={`Select ${o.metricId} observed ${o.observedAt} for attestation`}
        checked={selected.has(o.id)}
        disabled={busy || !v.selectable}
        title={v.ineligibleReason ?? undefined}
        aria-describedby={!v.selectable ? `eligibility-${layout}-${o.id}` : undefined}
        onCheckedChange={(c) =>
          setSelected((s) => {
            const n = new Set(s);
            if (c === true) n.add(o.id);
            else n.delete(o.id);
            return n;
          })
        }
      />
    );
  };
  const renderOrigin = (o: UnifiedObservation) => (
    <>
      {o.source.label} · {o.provenance}
      {o.supersedesId ? <span className="block">Corrects {o.supersedesId}</span> : null}
      {o.statusReason && o.status === "erroneous" ? <span className="block">Reason: {o.statusReason}</span> : null}
    </>
  );
  const renderLifecycle = (v: StoredObservationView) => (
    <>
      <Badge variant={v.lifecycle === "active" ? "secondary" : "outline"}>{LIFECYCLE_LABELS[v.lifecycle]}</Badge>
      {v.supersededBy ? <span className="block text-xs">by {v.supersededBy}</span> : null}
    </>
  );
  const renderGroundMedical = (v: StoredObservationView) =>
    v.groundMedical === "not_applicable" ? (
      <span className="text-xs">—</span>
    ) : (
      <Badge variant={v.groundMedical === "attested" ? "default" : "outline"}>{GROUND_MEDICAL_LABELS[v.groundMedical]}</Badge>
    );
  const renderActions = (v: StoredObservationView, layout: "table" | "card" = "table") => {
    const o = v.observation;
    const btn = layout === "table" ? "w-full justify-center whitespace-normal" : "justify-center whitespace-normal";
    return (
      <>
        <div className={layout === "table" ? "flex flex-col items-stretch gap-2" : "flex flex-wrap gap-2"}>
          {isGroundMedical && scope && v.selectable && (
            <Button type="button" size="sm" variant="outline" className={btn} disabled={busy} onClick={() => openDialog({ kind: "attest", recordIds: [o.id] })}>
              Attest
            </Button>
          )}
          {isGroundMedical && scope && v.groundMedical === "attested" && (
            <Button type="button" size="sm" variant="outline" className={btn} disabled={busy} onClick={() => openDialog({ kind: "revoke", recordId: o.id })}>
              Revoke
            </Button>
          )}
          {isGroundMedical && scope && v.lifecycle === "active" && o.provenance === scope.provenance && o.reviewState === "accepted" && (
            <Button type="button" size="sm" variant="outline" className={btn} disabled={busy} onClick={() => openDialog({ kind: "edit", observation: o })}>
              Edit
            </Button>
          )}
          {v.lifecycle === "active" && membership && (
            <Button type="button" size="sm" variant="outline" className={btn} disabled={busy} onClick={() => openDialog({ kind: "erroneous", observation: o })}>
              Mark erroneous
            </Button>
          )}
          {isGroundMedical && v.correctionIncomplete && (
            <Button type="button" size="sm" disabled={busy} onClick={() => void runComplete(o)}>
              Complete correction
            </Button>
          )}
          {(v.attestationHistory.length > 0 || o.correction) && (
            <Button type="button" size="sm" variant="ghost" className={btn} aria-expanded={openHistory === o.id} onClick={() => setOpenHistory(openHistory === o.id ? null : o.id)}>
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
      </>
    );
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
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm" data-testid="stored-observations-bulk-bar">
          <label className="flex items-center gap-2 lg:hidden">
            <Checkbox
              aria-label="Select all eligible observations in this mission, crew and provenance (card view)"
              checked={allSelected}
              disabled={busy || counts.eligible === 0}
              onCheckedChange={toggleAll}
            />
            <span>Select all eligible</span>
          </label>
          <span role="status" aria-live="polite">
            {counts.selected} selected of {counts.eligible} eligible
          </span>
          <Button type="button" disabled={busy || counts.selected === 0} onClick={() => openDialog({ kind: "attest", recordIds: [...selected] })}>
            Save selected approvals
          </Button>
          <span className="text-xs text-muted-foreground">Only active, not-yet-attested records in the selected mission, crew and provenance can be selected. Already attested records are locked against duplicate approval; use History to inspect, Revoke to withdraw approval, or Edit to create a corrected version.</span>
        </div>
      )}

      {views.length ? (
        <CompactScrollRegion
          label={`Stored observations review (${views.length} records); scroll to see all records and actions`}
          maxHeight="approvalTable"
          className="max-w-full overflow-x-auto"
          testId="stored-observations-scroll"
        >
          <table className="hidden w-full min-w-[980px] table-fixed text-left text-sm lg:table" data-testid="stored-observations-table">
            <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_var(--border)]">
              <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                {isGroundMedical && scope && (
                  <th className="py-2 pl-2 pr-2">
                    <Checkbox
                      aria-label="Select all eligible observations in this mission, crew and provenance"
                      checked={allSelected}
                      disabled={busy || counts.eligible === 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                )}
                <th className="w-[155px] px-2 py-2">Observed</th>
                <th className="w-[75px] px-2 py-2">Metric</th>
                <th className="w-[90px] px-2 py-2">Value</th>
                <th className="w-[205px] px-2 py-2">Origin</th>
                <th className="w-[100px] px-2 py-2">Observation</th>
                <th className="w-[110px] px-2 py-2">Ground Medical</th>
                <th className="w-[150px] px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {views.map((v) => {
                const o = v.observation;
                return (
                  <tr key={o.id} className={`border-b border-border/60 align-top ${v.lifecycle !== "active" ? "text-muted-foreground" : ""}`}>
                    {isGroundMedical && scope && <td className="py-2 pl-2 pr-2">{renderSelect(v, "table")}</td>}
                    <td className="break-words px-2 py-3 text-xs leading-relaxed">{renderIneligible(v, "table")}{formatObservedAt(o.observedAt)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{o.metricId}</td>
                    <td className={`py-2 pr-3 ${v.lifecycle !== "active" ? "line-through" : ""}`}>
                      {o.value} {o.originalUnit}
                    </td>
                    <td className="break-all px-2 py-3 text-xs leading-relaxed">{renderOrigin(o)}</td>
                    <td className="py-2 pr-3">{renderLifecycle(v)}</td>
                    <td className="py-2 pr-3">{renderGroundMedical(v)}</td>
                    <td className="px-2 py-3">{renderActions(v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="divide-y divide-border lg:hidden" aria-label="Stored observations" data-testid="stored-observations-cards">
            {views.map((v) => {
              const o = v.observation;
              return (
                <li key={o.id} className={`space-y-2 p-3 text-sm ${v.lifecycle !== "active" ? "text-muted-foreground" : ""}`}>
                  <div className="flex items-start gap-3">
                    {isGroundMedical && scope ? <div className="pt-0.5">{renderSelect(v, "card")}</div> : null}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-xs">{o.metricId}</span>
                        <span className={`font-medium ${v.lifecycle !== "active" ? "line-through" : ""}`}>
                          {o.value} {o.originalUnit}
                        </span>
                      </p>
                      <p className="break-words text-xs">{renderIneligible(v, "card")}{formatObservedAt(o.observedAt)}</p>
                      <p className="break-all text-xs">{renderOrigin(o)}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Observation</span>
                        {renderLifecycle(v)}
                        <span className="text-muted-foreground">Ground Medical</span>
                        {renderGroundMedical(v)}
                      </div>
                    </div>
                  </div>
                  {renderActions(v, "card")}
                </li>
              );
            })}
          </ul>
        </CompactScrollRegion>
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
        <ReviewCloudSync scope={scope} userId={userId} rolesForScope={rolesForScope} history={history} onImported={() => afterWrite("Cloud observations and review events were added to this device (nothing local was changed or replaced).")} ledgerVersion={ledgerVersion} />
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
      setObservedAt(state.observation.observedAt);
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
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overflow-x-hidden sm:max-w-lg [&>*]:min-w-0">
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
          <div className="grid min-w-0 gap-3 text-sm">
            <p className="break-all text-xs text-muted-foreground">
              Original: {state.observation.metricId} = {state.observation.value} {state.observation.originalUnit} at {state.observation.observedAt} · {state.observation.provenance} · source {state.observation.source.label}
            </p>
            <div className="space-y-1">
              <Label htmlFor="corr-metric">Catalog metric ID</Label>
              <Input id="corr-metric" value={metricId} onChange={(e) => setMetricId(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
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
              <Label htmlFor="corr-observed">Observed date or zoned ISO timestamp</Label>
              <Input id="corr-observed" type={isCalendarDate(state.observation.observedAt) ? "date" : "text"} value={observedAt} onChange={(e) => setObservedAt(e.target.value)} placeholder="2026-10-14T07:35:00.000Z" />
            </div>
            <p className="break-words text-xs text-muted-foreground">Provenance ({state.observation.provenance}) and source ({state.observation.source.label}) are preserved from the original.</p>
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
        <DialogFooter className="gap-2 sm:gap-0">
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

type RunState = { status: "ok" | "partial" | "failed" | "skipped"; message: string; at: string } | null;

const runTone = (s: RunState) => (!s ? "" : s.status === "ok" ? "text-foreground" : s.status === "skipped" ? "text-muted-foreground" : "text-destructive");
const runLabel = (s: RunState) => (!s ? "" : s.status === "ok" ? "Completed" : s.status === "partial" ? "Partly completed — see details" : s.status === "skipped" ? "Skipped" : "Failed — nothing marked as synced");

/**
 * v9.4 explicit "Sync observations & reviews": first the encrypted observation
 * events (upload, then download + append-only import), then the existing
 * metadata-only review sync. Each step reports its own result; a failure in one
 * never hides or fakes the other.
 */
function ReviewCloudSync(props: { scope: Scope; userId: string | null; rolesForScope: readonly string[]; history: UnifiedObservation[]; onImported: () => Promise<void>; ledgerVersion: number }) {
  const { scope, userId, rolesForScope, history } = props;
  const canReviewPush = rolesForScope.includes("ground_medical") && Boolean(userId);
  const canAccess = Boolean(userId) && (rolesForScope.includes("ground_medical") || rolesForScope.includes("crew_self"));
  const [receipts, setReceipts] = useState<SyncReceipt[]>([]);
  const [obsReceipts, setObsReceipts] = useState<ObservationSyncReceipt[]>([]);
  const [localEvents, setLocalEvents] = useState<ObservationSyncEvent[]>([]);
  const [local, setLocal] = useState<Awaited<ReturnType<typeof listAttestationEvents>>>([]);
  const [remoteCorrections, setRemoteCorrections] = useState<RemoteCorrectionIntent[]>([]);
  const [runs, setRuns] = useState<SyncRunRecord[]>([]);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [obsFailed, setObsFailed] = useState<Set<string>>(new Set());
  const [obsRun, setObsRun] = useState<RunState>(null);
  const [revRun, setRevRun] = useState<RunState>(null);
  const [obsCounts, setObsCounts] = useState<ObservationSyncCounts | null>(null);
  const [realConfirmed, setRealConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState("");
  const [version, setVersion] = useState(0);
  const key = `${scope.missionId}|${scope.crewMemberId}|${scope.provenance}`;
  useEffect(() => {
    let active = true;
    void Promise.all([
      listAttestationEvents(scope),
      listSyncReceipts(scope),
      listRemoteCorrectionIntents(scope),
      listObservationSyncReceipts(scope),
      listUnifiedObservationEvents(scope.missionId, scope.crewMemberId),
      listSyncRuns(scope),
    ])
      .then(([a, r, c, or, ev, rn]) => {
        if (!active) return;
        setLocal(a);
        setReceipts(r);
        setRemoteCorrections(c);
        setObsReceipts(or);
        setLocalEvents(ev.map((e) => ({ eventId: e.eventId, eventKind: e.eventKind, observation: e.observation })));
        setRuns(rn);
        setReadError("");
      })
      .catch(() => active && setReadError("Local sync records unavailable; sync status unknown (not zero)."));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures scope
  }, [key, version, props.ledgerVersion, history]);
  useEffect(() => {
    setFailed(new Set());
    setObsFailed(new Set());
    setObsRun(null);
    setRevRun(null);
    setRealConfirmed(false);
  }, [key]);
  useEffect(() => {
    let active = true;
    void observationSyncCounts(localEvents, obsReceipts, obsFailed, scope).then((c) => active && setObsCounts(c));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures scope
  }, [localEvents, obsReceipts, obsFailed, key]);

  const corrections = useMemo(
    () => history.filter((o) => o.missionId === scope.missionId && o.crewMemberId === scope.crewMemberId && o.provenance === scope.provenance).map(correctionSyncPayload).filter((p): p is NonNullable<typeof p> => p !== null),
    [history, scope.missionId, scope.crewMemberId, scope.provenance],
  );
  const counts = syncCounts(local, corrections, receipts, failed, userId);
  const reconciliation = reconcileReviewEvents(history.filter((o) => o.provenance === scope.provenance), local);
  const lastObs = [...runs].reverse().find((r) => r.observations.status === "ok" || r.observations.status === "partial")?.at ?? null;
  const lastRev = [...runs].reverse().find((r) => r.reviews.status === "ok" || r.reviews.status === "partial")?.at ?? null;

  const sync = async () => {
    if (!userId || !canAccess) return;
    setBusy(true);
    setObsRun(null);
    setRevRun(null);
    let obsState: RunState = null;
    let revState: RunState = null;
    try {
      const fresh = await freshRoles(scope, userId);
      if (!fresh.userId) throw new Error("Your session changed. Sign in again; nothing was synced.");
      const freshUser = fresh.userId;
      const mayAccess = fresh.roles.includes("ground_medical") || fresh.roles.includes("crew_self");
      // ---- Step 1: observations ----
      if (!mayAccess) {
        obsState = { status: "failed", message: "Your access to this mission and crew member is no longer valid. Nothing was synced.", at: new Date().toISOString() };
      } else {
        try {
          const r = await runObservationSync(
            { scope, canUpload: true, realDataConfirmed: scope.provenance === "real" ? realConfirmed : false },
            {
              listLocal: async () => (await listUnifiedObservationEvents(scope.missionId, scope.crewMemberId)).map((e) => ({ eventId: e.eventId, eventKind: e.eventKind, observation: e.observation })),
              listReceipts: () => listObservationSyncReceipts(scope),
              appendReceipts: async (rs) => {
                await appendObservationSyncReceipts(rs, scope, freshUser);
              },
              importEvent: (e) => importUnifiedObservationEvent(e),
              push: (a) => pushObservationEvents({ data: a }),
              pull: (a) => pullObservationEvents({ data: a }),
              now: () => new Date().toISOString(),
            },
          );
          setObsFailed(new Set(r.failedIds));
          obsState = { status: r.status, message: r.message + (r.conflicts.length ? ` Conflicts: ${r.conflicts.slice(0, 3).map((c) => `${c.eventId} (${c.detail})`).join("; ")}.` : ""), at: r.finishedAt };
          if (r.downloaded.imported) await props.onImported();
        } catch (error) {
          obsState = { status: "failed", message: `Observation sync failed: ${error instanceof Error ? error.message : "network error"}. Observations stay on this device; use Retry.`, at: new Date().toISOString() };
        }
      }
      // ---- Step 2: review metadata (always attempted; independent result) ----
      try {
        const freshHistory = await listUnifiedObservations(scope.missionId, scope.crewMemberId);
        const r = await runReviewSync(
          { scope, actorUserId: freshUser, canPush: canReviewPush && fresh.roles.includes("ground_medical"), history: freshHistory },
          { push: (a) => pushReviewEvents({ data: a }), pull: (a) => pullReviewEvents({ data: a }), now: () => new Date().toISOString() },
        );
        setFailed(new Set(r.failedIds));
        revState = { status: r.status, message: r.message, at: r.finishedAt };
        if (r.imported) await props.onImported();
      } catch (error) {
        revState = { status: "failed", message: `Review sync failed: ${error instanceof Error ? error.message : "network error"}. Local events are kept; use Retry.`, at: new Date().toISOString() };
      }
      await appendSyncRun(
        {
          at: new Date().toISOString(),
          actorUserId: freshUser,
          observations: { status: obsState?.status ?? "skipped", message: obsState?.message ?? "" },
          reviews: { status: revState?.status ?? "skipped", message: revState?.message ?? "" },
        },
        scope,
      ).catch(() => undefined);
    } catch (error) {
      const message = `Sync failed: ${error instanceof Error ? error.message : "network error"}. Local data is kept; use Retry.`;
      obsState ??= { status: "failed", message, at: new Date().toISOString() };
      revState ??= { status: "failed", message, at: new Date().toISOString() };
    } finally {
      setObsRun(obsState);
      setRevRun(revState);
      setBusy(false);
      setVersion((v) => v + 1);
    }
  };

  const anyFailure = [obsRun, revRun].some((s) => s && s.status !== "ok" && s.status !== "skipped") || counts.failed > 0 || (obsCounts?.failed ?? 0) > 0;
  const needsRealConfirm = scope.provenance === "real";

  return (
    <div className="space-y-3 rounded-md border border-border p-3 text-sm" aria-label="Cloud sync for observations and reviews">
      <p className="font-semibold">Cloud sync (explicit; nothing syncs automatically)</p>
      <p className="text-xs text-muted-foreground">
        One action, two independent steps. <strong>Observations</strong>: the full stored records for this mission, crew member and provenance are
        encrypted on the server before they are stored, then records from your other devices are added to this device without changing or replacing
        anything here. <strong>Reviews</strong>: only Ground Medical attestation, revocation and correction metadata (record IDs, fingerprints,
        reviewer, reason, UTC time). The cloud checks your membership for this exact mission and crew member. Importing a record is never an
        attestation or scientific approval.
      </p>
      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded border border-border p-2" role="status" aria-live="polite" aria-label="Observation sync status">
          <dt className="font-semibold">Observations</dt>
          <dd>
            {obsCounts
              ? `Pending ${obsCounts.pending} · Synced ${obsCounts.synced} · Failed ${obsCounts.failed} · Conflict ${obsCounts.conflict}`
              : "Counting…"}
          </dd>
          <dd className="text-muted-foreground">Last sync {lastObs ?? "never"}</dd>
          {obsRun && (
            <dd className={runTone(obsRun)}>
              {runLabel(obsRun)}: {obsRun.message}
            </dd>
          )}
        </div>
        <div className="rounded border border-border p-2" role="status" aria-live="polite" aria-label="Review sync status">
          <dt className="font-semibold">Reviews</dt>
          <dd>
            Pending {counts.pending} · Synced {counts.synced} · Failed {counts.failed} · Conflict {counts.conflict}
            {counts.otherAuthor ? ` · ${counts.otherAuthor} by another reviewer (only they can send them)` : ""}
          </dd>
          <dd className="text-muted-foreground">Last sync {lastRev ?? "never"}</dd>
          {reconciliation.absentRecordIds.length > 0 && (
            <dd className="text-muted-foreground">
              {reconciliation.absentRecordIds.length} reviewed record(s) are not on this device; they are not shown as Attested until the exact record version is present.
            </dd>
          )}
          {remoteCorrections.length > 0 && <dd className="text-muted-foreground">{remoteCorrections.length} correction(s) recorded on other devices.</dd>}
          {revRun && (
            <dd className={runTone(revRun)}>
              {runLabel(revRun)}: {revRun.message}
            </dd>
          )}
        </div>
      </dl>
      {needsRealConfirm && (
        <label className="flex items-start gap-2 text-xs">
          <Checkbox checked={realConfirmed} onCheckedChange={(c) => setRealConfirmed(c === true)} aria-label="Confirm uploading encrypted REAL observation data" />
          <span>
            I confirm uploading <strong>REAL</strong> observation records for exactly this mission and crew member to the encrypted cloud store. Without
            this, real records are only downloaded, never uploaded.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !canAccess} onClick={() => void sync()}>
          {busy ? "Syncing…" : "Sync observations & reviews"}
        </Button>
        {anyFailure && !busy && (
          <Button type="button" variant="ghost" onClick={() => void sync()}>
            Retry
          </Button>
        )}
      </div>
      {!canAccess && <p className="text-xs text-muted-foreground">Cloud sync requires Crew Self access for this crew member or scoped Ground Medical access.</p>}
      {readError && (
        <p className="text-xs text-destructive" role="alert">
          {readError}
        </p>
      )}
    </div>
  );
}
