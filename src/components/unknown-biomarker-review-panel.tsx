/**
 * Unknown Biomarker Review & Catalog Extension panel (Unified Intake).
 * Review-only candidates, a durable encrypted local registry of pending review
 * requests, append-only Ground Medical decisions, local JSON export and a
 * read-only re-evaluation of a previously exported file against the governed
 * catalog registry. Never saves observations, edits the catalog, approves or
 * uploads anything.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import {
  buildCatalogExtensionProposal,
  buildReviewRequestExport,
  buildUnknownBiomarkerTerms,
  canRecordReviewerDecision,
  evaluateCatalogExtensionRegistry,
  GOVERNED_CATALOG_EXTENSIONS,
  latestDecisions,
  recordReviewerDecision,
  reevaluateReviewRequest,
  REEVALUATION_MAX_BYTES,
  REQUIRED_SCIENTIFIC_GATE,
  REVIEWER_DECISION_LABELS,
  type ReevaluationResult,
  type ReviewerDecision,
  type ReviewerDecisionKind,
  type ReviewScope,
  type ReviewSourceRow,
  type UnknownBiomarkerTerm,
} from "@/domain/health-intelligence/unknown-biomarker-review";
import {
  appendReviewerDecision,
  canSubmitReviewRequest,
  listUnknownBiomarkerReviewState,
  reviewRequestIdFor,
  savePendingReviewRequest,
  type PendingReviewRequest,
} from "@/domain/health-intelligence/review-ledger";

const STATUS_LABELS = {
  unclassified: "Unknown — not in catalog",
  ambiguous: "Ambiguous name",
  unit_review_required: "Unit mismatch",
} as const;

/** Merge current-batch terms with terms from registered requests (current batch wins). */
function mergeTerms(current: readonly UnknownBiomarkerTerm[], requests: readonly PendingReviewRequest[]): UnknownBiomarkerTerm[] {
  const map = new Map<string, UnknownBiomarkerTerm>();
  for (const r of requests) for (const t of r.terms) if (!map.has(t.termId)) map.set(t.termId, t);
  for (const t of current) map.set(t.termId, t);
  return [...map.values()].sort((a, b) => a.normalizedLabel.localeCompare(b.normalizedLabel) || a.originalUnit.localeCompare(b.originalUnit));
}

export function UnknownBiomarkerReviewPanel(props: {
  rows: readonly ReviewSourceRow[];
  scope: ReviewScope | null;
  reviewerUserId: string | null;
  rolesForScope: readonly string[];
}) {
  const batchTerms = useMemo(() => buildUnknownBiomarkerTerms(props.rows), [props.rows]);
  const evaluation = useMemo(() => evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS), []);
  const [requests, setRequests] = useState<PendingReviewRequest[]>([]);
  const [ledger, setLedger] = useState<ReviewerDecision[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [drafts, setDrafts] = useState<Record<string, { kind: ReviewerDecisionKind; target: string; name: string; unit: string; domain: string; rationale: string }>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [realAck, setRealAck] = useState(false);
  const [reevaluation, setReevaluation] = useState<ReevaluationResult[] | null>(null);
  const reviewer = canRecordReviewerDecision(props.rolesForScope) && Boolean(props.reviewerUserId);
  const submitter = canSubmitReviewRequest(props.rolesForScope);
  const terms = useMemo(() => mergeTerms(batchTerms, requests), [batchTerms, requests]);
  const latest = latestDecisions(ledger);
  const proposal = buildCatalogExtensionProposal(terms, ledger);
  const isReal = props.scope?.provenance === "real";
  const scopeKey = props.scope ? `${props.scope.missionId}|${props.scope.crewMemberId}|${props.scope.provenance}` : "";
  const batchRequestId = props.scope && batchTerms.length ? reviewRequestIdFor(props.scope, batchTerms) : null;
  const batchRegistered = Boolean(batchRequestId && requests.some((r) => r.requestId === batchRequestId));

  const reload = useCallback(async (scope: ReviewScope) => {
    setLoadState("loading");
    try {
      const state = await listUnknownBiomarkerReviewState(scope);
      setRequests(state.requests);
      setLedger(state.decisions);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    setRequests([]);
    setLedger([]);
    setReevaluation(null);
    if (!props.scope) {
      setLoadState("idle");
      return;
    }
    void reload(props.scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scopeKey captures the scope identity
  }, [scopeKey, reload]);

  /** Fresh server-backed authorization for exactly this scope before every write. */
  const freshRoles = async (): Promise<string[] | null> => {
    if (!props.scope || !props.reviewerUserId) return null;
    const fresh = await loadMissionIdentity();
    if (!fresh.signedIn || fresh.error || fresh.userId !== props.reviewerUserId) return null;
    return fresh.memberships
      .filter((m) => m.missionId === props.scope!.missionId && m.crewMemberId === props.scope!.crewMemberId)
      .map((m) => m.role);
  };

  const draftFor = (termId: string) =>
    drafts[termId] ?? { kind: "needs_more_evidence" as ReviewerDecisionKind, target: "", name: "", unit: "", domain: "", rationale: "" };

  const registerRequest = async () => {
    if (!props.scope || busy) return;
    setBusy(true);
    try {
      const roles = await freshRoles();
      if (!roles || !canSubmitReviewRequest(roles)) return setMessage("Authorization for this mission and crew member could not be confirmed. Nothing was saved.");
      const { request, result } = await savePendingReviewRequest(props.scope, batchTerms, { actorUserId: props.reviewerUserId, rolesForScope: roles }, new Date().toISOString());
      await reload(props.scope);
      setMessage(result === "inserted"
        ? `Review request ${request.requestId} registered as ${REQUIRED_SCIENTIFIC_GATE} in encrypted local storage on this device. Nothing was uploaded.`
        : `Review request ${request.requestId} was already registered; no duplicate was created.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The review request could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async (termId: string) => {
    if (!props.scope || !props.reviewerUserId || busy) return setMessage("Select an authorized scope and provenance first.");
    setBusy(true);
    try {
      const roles = await freshRoles();
      if (!roles || !canRecordReviewerDecision(roles)) return setMessage("Only a currently authorized Ground Medical reviewer for this mission and crew member can record decisions.");
      const d = draftFor(termId);
      const result = recordReviewerDecision(ledger, terms, {
        termId, kind: d.kind, targetMetricId: d.target, proposedName: d.name, proposedUnit: d.unit, proposedDomain: d.domain, rationale: d.rationale,
      }, { reviewerUserId: props.reviewerUserId, rolesForScope: roles, scope: props.scope, decidedAt: new Date().toISOString() });
      if (!result.ok) return setMessage(result.reason);
      await appendReviewerDecision(result.decision, { actorUserId: props.reviewerUserId, rolesForScope: roles });
      await reload(props.scope);
      setMessage(`Decision ${result.decision.decisionId} saved to the encrypted local review ledger. Status remains ${REQUIRED_SCIENTIFIC_GATE}; the catalog is unchanged.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The decision could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const exportRequest = () => {
    if (!props.scope) return;
    if (isReal && !realAck) return setMessage("Confirm the real-data handling statement before exporting.");
    const request = buildReviewRequestExport({ scope: props.scope, terms, ledger, generatedAt: new Date().toISOString() });
    const blob = new Blob([JSON.stringify(request, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "MITOCHONDRIA_unknown_biomarker_review_request.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setMessage("Review request downloaded to this device. Nothing was uploaded and no catalog change was applied.");
  };

  const reevaluateFile = async (file: File | undefined) => {
    if (!file || !props.scope) return;
    if (file.size > REEVALUATION_MAX_BYTES) {
      setReevaluation(null);
      return setMessage("The file is larger than 5 MB and was not read.");
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = reevaluateReviewRequest(parsed, props.scope, evaluation);
      if (!result.ok) { setReevaluation(null); return setMessage(result.reason); }
      setReevaluation(result.results);
      setMessage("Re-evaluation is read-only: nothing was saved, approved or changed. Matched candidates must be re-imported and confirmed row by row before saving.");
    } catch {
      setReevaluation(null);
      setMessage("The file is not valid JSON.");
    }
  };

  return (
    <section id="unknown-biomarker-review" aria-label="Unknown Biomarker Review and Catalog Extension" className="scroll-mt-24 space-y-4 rounded-lg border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Unknown Biomarker Review &amp; Catalog Extension</h2>
        <p className="text-sm text-muted-foreground">
          Unknown, ambiguous and unit-mismatched measurements are grouped by name and unit with their
          source evidence. They are never saved as observations, synchronized, charted or reported. Reviewer decisions
          are proposals only; every catalog change stays {REQUIRED_SCIENTIFIC_GATE} until independent
          scientific approval is recorded in the governed catalog registry.
        </p>
        <p className="text-xs text-muted-foreground">
          Catalog registry {evaluation.registryVersion} · {evaluation.effective.length} approved extension(s) in effect ·{" "}
          {evaluation.approvalHistory.length} independent scientific approval record(s) · {evaluation.notEffective.length} not in effect.
        </p>
      </div>

      {!props.scope ? (
        <p className="text-sm text-muted-foreground">Select an authorized mission, crew member and provenance to review candidates.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground" role="status">
            {loadState === "loading" ? "Reading the encrypted local review registry…"
              : loadState === "error" ? "The encrypted local review registry could not be read. Nothing is shown from it; current-batch candidates are still listed."
              : `${requests.length} registered pending review request(s) and ${ledger.length} reviewer decision(s) stored on this device for this scope.`}
          </p>
          {requests.length ? (
            <ul className="space-y-1 text-xs" aria-label="Pending review registry">
              {requests.map((r) => (
                <li key={r.requestId} className="break-words">
                  {r.requestId} · {r.createdAt} · registered by {r.createdByRole === "ground_medical" ? "Ground Medical" : "crew member"} · {r.terms.length} term(s) · {r.status}
                </li>
              ))}
            </ul>
          ) : null}
          {terms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unknown, ambiguous or unit-mismatched candidates in the current review batch.</p>
          ) : (
            <>
              <p className="text-sm">
                {terms.length} catalog term(s) from {terms.reduce((n, t) => n + t.observations.length, 0)} distinct observation(s)
                {terms.some((t) => t.duplicateRowsCollapsed) ? ` · ${terms.reduce((n, t) => n + t.duplicateRowsCollapsed, 0)} duplicate row(s) counted once` : ""}.{" "}
                {reviewer ? "You can record reviewer decisions; each one is kept in the encrypted local review ledger." : "View only: decisions require the Ground Medical reviewer role for this mission and crew."}
              </p>
              {batchTerms.length && submitter ? (
                <Button type="button" variant="outline" disabled={busy || batchRegistered || loadState !== "ready"} onClick={() => void registerRequest()}>
                  {batchRegistered ? "Current batch registered as pending review" : "Register current batch as a pending review request"}
                </Button>
              ) : null}
              <ul className="space-y-3" aria-label="Catalog review candidates">
                {terms.map((term) => {
                  const d = draftFor(term.termId);
                  const set = (patch: Partial<typeof d>) => setDrafts((prev) => ({ ...prev, [term.termId]: { ...d, ...patch } }));
                  const decided = latest.get(term.termId);
                  return (
                    <li key={term.termId} className="space-y-2 rounded-md border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="break-words">{term.originalLabels.join(" / ")}</strong>
                        <span className="text-muted-foreground">{term.originalUnit || "unit missing"}</span>
                        <Badge variant="outline">{STATUS_LABELS[term.classification]}</Badge>
                        {decided ? <Badge variant="secondary">{REVIEWER_DECISION_LABELS[decided.kind]} · {REQUIRED_SCIENTIFIC_GATE}</Badge> : null}
                      </div>
                      {term.candidateMetricIds.length ? <p className="text-xs">Possible catalog IDs: {term.candidateMetricIds.join(", ")}</p> : null}
                      <details className="text-xs">
                        <summary className="cursor-pointer">Source evidence ({term.observations.length})</summary>
                        <ul className="mt-1 space-y-1">
                          {term.observations.map((o) => (
                            <li key={o.observationKey} className="break-words border-b border-border py-1">
                              {o.value || "no value"} {term.originalUnit} · {o.observedAt ?? "time missing"} ·{" "}
                              {o.evidence.map((e) => `${e.sourceLabel}${e.documentName ? ` (${e.documentName})` : ""}${e.documentSha256 ? ` sha256 ${e.documentSha256.slice(0, 12)}…` : ""}${e.excerpt ? ` — “${e.excerpt}”` : ""}`).join("; ")}
                            </li>
                          ))}
                        </ul>
                      </details>
                      {reviewer ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <select aria-label={`Decision for ${term.normalizedLabel}`} className="rounded-md border border-border bg-background px-2 py-1.5" value={d.kind} onChange={(e) => set({ kind: e.target.value as ReviewerDecisionKind })}>
                            {Object.entries(REVIEWER_DECISION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                          </select>
                          {d.kind === "propose_alias_to_existing_metric" ? (
                            <Input aria-label={`Target catalog ID for ${term.normalizedLabel}`} placeholder="Existing catalog ID, e.g. cv-001" value={d.target} onChange={(e) => set({ target: e.target.value })} />
                          ) : d.kind === "propose_new_catalog_metric" ? (
                            <div className="grid grid-cols-3 gap-2">
                              <Input aria-label="Proposed name" placeholder="Name" value={d.name} onChange={(e) => set({ name: e.target.value })} />
                              <Input aria-label="Proposed unit" placeholder="Unit" value={d.unit} onChange={(e) => set({ unit: e.target.value })} />
                              <select aria-label="Proposed domain" className="rounded-md border border-border bg-background px-2" value={d.domain} onChange={(e) => set({ domain: e.target.value })}>
                                <option value="">Domain</option><option value="bone">Bone</option><option value="immune">Immune</option><option value="cardiovascular">Cardiovascular</option><option value="behavioral">Behavioral</option>
                              </select>
                            </div>
                          ) : <span />}
                          <Input className="sm:col-span-2" aria-label={`Rationale for ${term.normalizedLabel}`} placeholder="Rationale with source reference (required)" value={d.rationale} onChange={(e) => set({ rationale: e.target.value })} />
                          <Button type="button" variant="outline" className="sm:col-span-2" disabled={busy} onClick={() => void submit(term.termId)}>Record reviewer decision</Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      {ledger.length ? (
        <div className="space-y-1 text-xs">
          <h3 className="text-sm font-semibold">Reviewer decision history (append-only, encrypted on this device)</h3>
          <ol className="list-decimal space-y-1 pl-5">
            {ledger.map((d) => (
              <li key={d.decisionId} className="break-words">
                {d.decidedAt} · {REVIEWER_DECISION_LABELS[d.kind]}{d.targetMetricId ? ` → ${d.targetMetricId}` : ""}{d.proposedName ? ` → ${d.proposedName} (${d.proposedUnit}, ${d.proposedDomain})` : ""} · {d.rationale} · reviewer {d.reviewerUserId} · {d.scientificStatus}
              </li>
            ))}
          </ol>
          <p>Draft extension v{proposal.proposedExtensionVersion}: {proposal.draftExtensions.length} mapping(s), {proposal.newMetricRequests.length} new-metric request(s), {proposal.keptExcluded.length} kept excluded. Not applied.</p>
        </div>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer text-sm font-medium">Independent scientific catalog approvals ({evaluation.approvalHistory.length})</summary>
        <div className="mt-2 space-y-1">
          <p>Approvals are recorded only in the versioned governed registry through code review, each with a named reviewer, decision time and handbook evidence references. This app never writes that registry, and a Ground Medical decision is never an approval.</p>
          {evaluation.approvalHistory.length ? (
            <ul className="list-disc pl-5">{evaluation.approvalHistory.map((a) => <li key={`${a.extensionId}:${a.version}:${a.decidedAt}`}>{a.extensionId} v{a.version} · {a.decision} · {a.reviewer} · {a.decidedAt} · evidence {a.handbookEvidenceRefs.join(", ")}</li>)}</ul>
          ) : <p>No scientific approvals are recorded. All proposals remain {REQUIRED_SCIENTIFIC_GATE}.</p>}
          {evaluation.notEffective.length ? <ul className="list-disc pl-5">{evaluation.notEffective.map((n) => <li key={`${n.extensionId}:${n.version}`}>{n.extensionId} v{n.version}: not in effect — {n.reason}</li>)}</ul> : null}
        </div>
      </details>

      {props.scope ? (
        <div className="space-y-2">
          <div className="space-y-1 rounded-md border border-border p-3 text-xs" aria-label="Export and re-evaluation guidance">
            <p className="text-sm font-medium">How export and re-evaluation work</p>
            <p><strong>Export</strong> downloads a JSON review request (candidates, source evidence, decision history and the draft proposal) to this device so it can be handed to the scientific reviewer through an approved channel. The app uploads nothing.</p>
            <p><strong>Re-evaluate</strong> imports a JSON file you exported earlier for this same mission, crew member and provenance and checks each term against the current approved catalog registry. It is read-only: it saves, approves and changes nothing. A term that now matches must be imported again in Unified Intake and confirmed row by row before it can be saved.</p>
            <p>Files from another scope, modified files claiming approval, and files over 5 MB are refused.</p>
          </div>
          {isReal ? (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={realAck} onChange={(e) => setRealAck(e.target.checked)} />
              This export contains real measurements. I will share it only through an approved secure channel.
            </label>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={terms.length === 0 || (isReal && !realAck)} onClick={exportRequest}>
              Export scientific review request (JSON)
            </Button>
            {terms.length === 0 ? (
              <p className="w-full text-xs text-muted-foreground" role="status">
                Export is unavailable because this import batch contains no unknown, ambiguous or unit-mismatched measurements. Import review-only rows first; previously stored accepted observations are not review candidates.
              </p>
            ) : null}
            <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-2 text-sm">
              Re-evaluate a saved review request
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void reevaluateFile(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
        </div>
      ) : null}

      {reevaluation ? (
        <ul className="space-y-1 text-xs" aria-label="Re-evaluation results">
          {reevaluation.map((r) => (
            <li key={r.termId} className="break-words">
              {r.label} ({r.unit || "unit missing"}): {r.outcome === "still_review_only" ? "still review-only" : r.outcome === "matched_by_approved_extension" ? `matches ${r.metricId} via approved extension ${r.extension?.extensionId} v${r.extension?.version} — re-import and confirm to save` : `matches ${r.metricId} in the base catalog — re-import and confirm to save`}
            </li>
          ))}
        </ul>
      ) : null}

      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      <p className="text-xs text-muted-foreground">
        A qualified reviewer must separately approve canonical ID, specimen, method, units, reference context and catalog version before any reclassification. Requests and decisions are stored encrypted on this device only and are not synchronized.
      </p>
    </section>
  );
}
