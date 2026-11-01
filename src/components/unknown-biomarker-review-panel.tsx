/**
 * Unknown Biomarker Review & Catalog Extension panel (Unified Intake).
 * Review-only candidates, append-only session decisions (ground medical only),
 * local JSON export and read-only re-evaluation against the governed registry.
 * Never saves observations, edits the catalog, approves or uploads anything.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  REQUIRED_SCIENTIFIC_GATE,
  REVIEWER_DECISION_LABELS,
  type ReevaluationResult,
  type ReviewerDecision,
  type ReviewerDecisionKind,
  type ReviewScope,
  type ReviewSourceRow,
} from "@/domain/health-intelligence/unknown-biomarker-review";

const STATUS_LABELS = {
  unclassified: "Unknown — not in catalog",
  ambiguous: "Ambiguous name",
  unit_review_required: "Unit mismatch",
} as const;

export function UnknownBiomarkerReviewPanel(props: {
  rows: readonly ReviewSourceRow[];
  scope: ReviewScope | null;
  reviewerUserId: string | null;
  rolesForScope: readonly string[];
}) {
  const terms = useMemo(() => buildUnknownBiomarkerTerms(props.rows), [props.rows]);
  const evaluation = useMemo(() => evaluateCatalogExtensionRegistry(GOVERNED_CATALOG_EXTENSIONS), []);
  const [ledger, setLedger] = useState<ReviewerDecision[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { kind: ReviewerDecisionKind; target: string; name: string; unit: string; domain: string; rationale: string }>>({});
  const [message, setMessage] = useState("");
  const [realAck, setRealAck] = useState(false);
  const [reevaluation, setReevaluation] = useState<ReevaluationResult[] | null>(null);
  const reviewer = canRecordReviewerDecision(props.rolesForScope) && Boolean(props.reviewerUserId);
  const latest = latestDecisions(ledger);
  const proposal = buildCatalogExtensionProposal(terms, ledger);
  const isReal = props.scope?.provenance === "real";

  const draftFor = (termId: string) =>
    drafts[termId] ?? { kind: "needs_more_evidence" as ReviewerDecisionKind, target: "", name: "", unit: "", domain: "", rationale: "" };

  const submit = (termId: string) => {
    if (!props.scope || !props.reviewerUserId) return setMessage("Select an authorized scope and provenance first.");
    const d = draftFor(termId);
    const result = recordReviewerDecision(ledger, terms, {
      termId, kind: d.kind, targetMetricId: d.target, proposedName: d.name, proposedUnit: d.unit, proposedDomain: d.domain, rationale: d.rationale,
    }, { reviewerUserId: props.reviewerUserId, rolesForScope: props.rolesForScope, scope: props.scope, decidedAt: new Date().toISOString() });
    if (!result.ok) return setMessage(result.reason);
    setLedger(result.ledger);
    setMessage(`Decision ${result.decision.decisionId} recorded for this session. Status remains ${REQUIRED_SCIENTIFIC_GATE}; the catalog is unchanged.`);
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
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Review request downloaded to this device. Nothing was uploaded and no catalog change was applied.");
  };

  const reevaluateFile = async (file: File | undefined) => {
    if (!file || !props.scope) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const result = reevaluateReviewRequest(parsed, props.scope, evaluation);
      if (!result.ok) { setReevaluation(null); return setMessage(result.reason); }
      setReevaluation(result.results);
      setMessage("Re-evaluation is read-only: matched candidates must be re-imported and confirmed row by row before saving.");
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
          source evidence. They are never saved, synchronized, charted or reported. Reviewer decisions
          are proposals only; every catalog change stays {REQUIRED_SCIENTIFIC_GATE} until independent
          scientific approval is recorded in the governed catalog registry.
        </p>
        <p className="text-xs text-muted-foreground">
          Catalog registry {evaluation.registryVersion} · {evaluation.effective.length} approved extension(s) in effect ·{" "}
          {evaluation.approvalHistory.length} approval record(s).
        </p>
      </div>

      {!props.scope ? (
        <p className="text-sm text-muted-foreground">Select an authorized mission, crew member and provenance to review candidates.</p>
      ) : terms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No unknown, ambiguous or unit-mismatched candidates in the current review batch.</p>
      ) : (
        <>
          <p className="text-sm">
            {terms.length} catalog term(s) from {terms.reduce((n, t) => n + t.observations.length, 0)} distinct observation(s)
            {terms.some((t) => t.duplicateRowsCollapsed) ? ` · ${terms.reduce((n, t) => n + t.duplicateRowsCollapsed, 0)} duplicate row(s) counted once` : ""}.{" "}
            {reviewer ? "You can record reviewer decisions for this session." : "View only: decisions require the ground medical reviewer role for this mission and crew."}
          </p>
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
                      <Button type="button" variant="outline" className="sm:col-span-2" onClick={() => submit(term.termId)}>Record reviewer decision</Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {ledger.length ? (
        <div className="space-y-1 text-xs">
          <h3 className="text-sm font-semibold">Decision history (this session, append-only)</h3>
          <ol className="list-decimal space-y-1 pl-5">
            {ledger.map((d) => (
              <li key={d.decisionId} className="break-words">
                {d.decidedAt} · {REVIEWER_DECISION_LABELS[d.kind]}{d.targetMetricId ? ` → ${d.targetMetricId}` : ""}{d.proposedName ? ` → ${d.proposedName} (${d.proposedUnit}, ${d.proposedDomain})` : ""} · {d.rationale} · {d.scientificStatus}
              </li>
            ))}
          </ol>
          <p>Draft extension v{proposal.proposedExtensionVersion}: {proposal.draftExtensions.length} mapping(s), {proposal.newMetricRequests.length} new-metric request(s), {proposal.keptExcluded.length} kept excluded. Not applied.</p>
        </div>
      ) : null}

      {props.scope ? (
        <div className="space-y-2">
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
        A qualified reviewer must separately approve canonical ID, specimen, method, units, reference context and catalog version before any reclassification. Decisions are kept in this browser session only.
      </p>
    </section>
  );
}
