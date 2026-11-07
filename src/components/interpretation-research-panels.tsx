/**
 * P41 Researcher panels: literature evidence + AI-assisted drafts for one
 * interpretation (or research candidate), backlog preflight/batch drafting,
 * and dynamic research candidates from submitted unknown biomarkers.
 *
 * Nothing here approves, activates or saves an observation. Drafts are loaded
 * into the P40 editor only on an explicit Researcher click and must still be
 * reviewed, saved and approved one entry at a time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  DRAFT_FIELD_LABELS,
  INSPECTION_LABELS,
  VERIFICATION_LABELS,
  conceptPrivacyProblem,
  toInterpretationDraft,
  type EvidenceBundle,
  type EvidenceReference,
  type LiteratureConcept,
} from "@/domain/health-intelligence/interpretation-evidence";
import {
  backlogProgress,
  interpretationPreflight,
  latestAttempts,
  nextBacklogBatch,
  planAttempt,
  type AttemptStatus,
  type EvidenceAttempt,
} from "@/domain/health-intelligence/interpretation-backlog";
import { appendEvidenceAttempt, listEvidenceAttempts } from "@/domain/health-intelligence/interpretation-evidence-store";
import {
  INSUFFICIENT_RELEVANT_EVIDENCE,
  RELEVANCE_LABELS,
  assessRelevance,
  automaticDraftRefIds,
  selectableForDraft,
  type RelevanceAssessment,
} from "@/domain/health-intelligence/literature-relevance";
import {
  IDENTIFICATION_LABELS,
  activatedIdentityFor,
  candidateConcept,
  deriveResearchCandidates,
  identityConcept,
  type CandidateSourceTerm,
  type ResearchCandidate,
} from "@/domain/health-intelligence/interpretation-research-candidates";
import type { InterpretationDraft, InterpretationSnapshot, ResolvedInterpretation } from "@/domain/health-intelligence/biomarker-interpretation";
import {
  draftInterpretationFromEvidence,
  searchInterpretationLiterature,
  verifyInterpretationCitation,
} from "@/lib/interpretation-research.functions";
import { listGlobalReviewMissions, listGlobalReviewSubmissions } from "@/lib/p36-global-review.functions";
import type { GlobalReviewMission } from "@/lib/p36-global-review.server";

type ServerFail = { ok: false; message: string };
const failText = (r: unknown) => ((r as ServerFail | null)?.message ?? "The request failed; nothing was changed.");

function useEvidenceAttempts() {
  const [attempts, setAttempts] = useState<EvidenceAttempt[]>([]);
  const reload = useCallback(async () => setAttempts(await listEvidenceAttempts().catch(() => [])), []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { attempts, reload };
}

function ReferenceItem({ r, relevance, checked, onToggle, disabled }: { r: EvidenceReference; relevance?: RelevanceAssessment | undefined; checked?: boolean; onToggle?: () => void; disabled?: boolean }) {
  const selectable = relevance ? selectableForDraft(relevance, r) : false;
  return (
    <li className="space-y-0.5 rounded border border-border p-2 text-xs">
      <label className="flex items-start gap-2">
        {onToggle && <input type="checkbox" checked={!!checked} disabled={disabled || !selectable} onChange={onToggle} aria-label={`Use ${r.refId} for the draft`} />}
        <span className="min-w-0 break-words">
          <a className="font-medium underline" href={r.identifiers.url} target="_blank" rel="noreferrer">{r.title}</a>
          {r.source ? ` — ${r.source}` : ""}{r.year ? ` (${r.year})` : ""}
        </span>
      </label>
      <p className="break-all font-mono text-muted-foreground">
        {[r.identifiers.pmid && `PMID ${r.identifiers.pmid}`, r.identifiers.pmcid, r.identifiers.doi && `DOI ${r.identifiers.doi}`, r.identifiers.ntrsId && `NTRS ${r.identifiers.ntrsId}`].filter(Boolean).join(" · ")}
      </p>
      <p className="text-muted-foreground">
        Bibliographic existence: {r.existence === "verified_by_provider" ? "confirmed by provider" : "not found"} · {INSPECTION_LABELS[r.inspected]} · {r.population === "spaceflight_or_analog" ? "spaceflight / analog keyword present (not a relevance assessment)" : "no spaceflight keyword"} · retrieved {r.retrievedAt.slice(0, 16)}Z{r.sourceVersion ? ` · ${r.sourceVersion}` : ""}
      </p>
      {relevance && (
        <p>
          <span className="font-medium">Scientific relevance: {RELEVANCE_LABELS[relevance.classification]}</span> — {relevance.reason}
        </p>
      )}
      {relevance && <p className="text-muted-foreground">Claim-level support is assessed separately for each draft claim; existence and relevance do not support any claim by themselves.</p>}
    </li>
  );
}

function DraftView({ bundle }: { bundle: EvidenceBundle }) {
  const d = bundle.draft;
  if (!d) return null;
  return (
    <div className="space-y-2 text-xs">
      <p className="font-semibold">
        AI-assisted synthesis ({d.generatedBy.model}, {d.generatedBy.generatedAt.slice(0, 16)}Z) — model-generated wording, not a verified conclusion.
      </p>
      <ul className="space-y-1">
        {d.claims.map((c, i) => (
          <li key={i} className="rounded border border-border p-2">
            <p><span className="font-medium">{DRAFT_FIELD_LABELS[c.field]}:</span> {c.text}</p>
            <p className="text-muted-foreground">{VERIFICATION_LABELS[c.verification]} · {c.evidenceScope === "spaceflight_specific" ? "spaceflight-specific" : "general biomedical"}</p>
            {c.support.map((s) => <blockquote key={s.refId + s.excerpt} className="border-l-2 border-border pl-2 italic text-muted-foreground">“{s.excerpt}” — {s.refId}</blockquote>)}
            {c.problems.map((p) => <p key={p} className="text-muted-foreground">• {p}</p>)}
          </li>
        ))}
      </ul>
      {d.rejected.length > 0 && (
        <details>
          <summary className="cursor-pointer">{d.rejected.length} statement(s) rejected by validation</summary>
          <ul className="list-disc pl-4">{d.rejected.map((r, i) => <li key={i} className="break-words">{r.text} — {r.reason}</li>)}</ul>
        </details>
      )}
      {d.contradictions.length > 0 && (
        <div>
          <p className="font-medium">Contradictory findings (shown, not resolved)</p>
          <ul className="list-disc pl-4">{d.contradictions.map((c, i) => <li key={i}>{c.summary} [{c.refIds.join(", ")}]{c.verified ? "" : " — cited references not all retrieved"}</li>)}</ul>
        </div>
      )}
      <div>
        <p className="font-medium">Evidence gaps</p>
        <ul className="list-disc pl-4">{d.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
      </div>
    </div>
  );
}

/** Literature evidence and AI-assisted draft for one interpretation key or research candidate. */
export function InterpretationEvidencePanel(props: {
  researchKey: string;
  concept: LiteratureConcept;
  canReview: boolean;
  userId: string | null;
  onUseDraft?: (draft: InterpretationDraft, bundle: EvidenceBundle) => void;
  /** Extra keys whose bundles are shown (e.g. the research candidate that preceded activation). */
  relatedKeys?: string[];
}) {
  const search = useServerFn(searchInterpretationLiterature);
  const draftFn = useServerFn(draftInterpretationFromEvidence);
  const verifyFn = useServerFn(verifyInterpretationCitation);
  const { attempts, reload } = useEvidenceAttempts();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cite, setCite] = useState("");
  const [citeResult, setCiteResult] = useState<EvidenceReference | null | "none">(null);
  const state = useMemo(() => latestAttempts(attempts), [attempts]);
  const keys = [props.researchKey, ...(props.relatedKeys ?? [])];
  const entry = keys.map((k) => state.get(k)).find((s) => s?.bundle) ?? state.get(props.researchKey);
  const bundle = entry?.bundle ?? null;
  const privacy = conceptPrivacyProblem(props.concept);
  // P41.1: relevance is re-assessed deterministically (also for bundles stored before P41.1).
  const relevance = useMemo(() => new Map((bundle?.references ?? []).map((r) => [r.refId, assessRelevance(r, bundle!.concept)])), [bundle]);
  const selectableCount = (bundle?.references ?? []).filter((r) => selectableForDraft(relevance.get(r.refId)!, r)).length;

  // P41.1: no reference is pre-selected; the Researcher ticks each one explicitly.
  useEffect(() => {
    setSelected(new Set());
  }, [bundle]);

  const record = async (status: AttemptStatus, b: EvidenceBundle | null, error: string | null) => {
    if (!props.userId) return;
    await appendEvidenceAttempt(planAttempt(props.researchKey, attempts, status, b, error, props.userId, new Date().toISOString()));
    await reload();
  };

  const runSearch = async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await search({ data: { key: props.researchKey, concept: props.concept } });
      if (!r.ok) {
        await record("failed", null, failText(r));
        setNote(failText(r));
        return;
      }
      await record(r.bundle.status, r.bundle, null);
      setNote(`${r.bundle.references.length} reference(s) retrieved. Nothing was drafted or approved.`);
    } catch {
      setNote("Literature search failed; nothing was changed.");
    } finally {
      setBusy(false);
    }
  };
  const runDraft = async () => {
    if (!bundle) return;
    setBusy(true);
    setNote("");
    try {
      const r = await draftFn({ data: { key: props.researchKey, concept: props.concept, refIds: [...selected].filter((x) => /^(pmid|ntrs):/.test(x) && !!bundle.references.find((r) => r.refId === x && selectableForDraft(relevance.get(x)!, r))).slice(0, 10), selection: "researcher_explicit" } });
      if (!r.ok) {
        await record("failed", bundle, failText(r));
        setNote(failText(r));
        return;
      }
      await record(r.bundle.status, { ...r.bundle, queries: bundle.queries }, null);
      setNote(
        r.bundle.status === "draft_ready"
          ? "AI-assisted draft prepared. Review each claim against its source; nothing was approved."
          : !r.bundle.draft
            ? `${INSUFFICIENT_RELEVANT_EVIDENCE} — no AI draft was generated.`
            : "Insufficient verified evidence for a draft; gaps are listed.",
      );
    } catch {
      setNote("Drafting failed; nothing was changed.");
    } finally {
      setBusy(false);
    }
  };
  const runVerify = async () => {
    setBusy(true);
    setCiteResult(null);
    try {
      const r = await verifyFn({ data: { citation: cite } });
      if (!r.ok) setNote(failText(r));
      else setCiteResult(r.reference ?? "none");
    } catch {
      setNote("Identifier lookup failed.");
    } finally {
      setBusy(false);
    }
  };

  const disabled = !props.canReview || busy || !!privacy;
  return (
    <section aria-label="Scientific literature evidence" className="space-y-2 rounded-md border border-border p-3">
      <h4 className="font-semibold">Scientific literature evidence (P41)</h4>
      <p className="text-xs text-muted-foreground">
        Searches PubMed (abstracts) and the NASA Technical Reports Server using only the biomarker name{props.concept.aliases.length ? " and aliases" : ""}: “{props.concept.label}”. No values, dates or crew data are sent. Full text is never claimed unless inspected.
      </p>
      {privacy && <p className="text-xs" role="alert">{privacy}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void runSearch()}>{bundle ? "Search literature again" : "Search literature"}</Button>
        <Button type="button" size="sm" variant="outline" disabled={disabled || !bundle || !selected.size} onClick={() => void runDraft()}>Prepare AI-assisted draft from selected sources</Button>
        {props.onUseDraft && bundle?.draft && (
          <Button type="button" size="sm" disabled={!props.canReview || busy} onClick={() => props.onUseDraft!(toInterpretationDraft(bundle), bundle)}>
            Load excerpt-verified claims into the editor
          </Button>
        )}
      </div>
      {entry && (
        <p className="text-xs text-muted-foreground" role="status">
          Last attempt {entry.latest.at.slice(0, 16)}Z: {entry.latest.status.replace(/_/g, " ")}{entry.latest.error ? ` — ${entry.latest.error}` : ""} ({entry.count} attempt(s) stored on this device).
        </p>
      )}
      {bundle && (
        <>
          <p className="text-xs text-muted-foreground">
            Providers: {bundle.providerOutcomes.map((o) => `${o.provider} ${o.status}${o.detail ? ` (${o.detail})` : ""}: ${o.count}`).join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            No source is selected automatically. Tick only sources you have judged relevant; “Potentially relevant” sources need your manual review, and “Irrelevant” or “Insufficient information” sources cannot be used.
          </p>
          {bundle.references.length > 0 && selectableCount === 0 && (
            <p className="text-sm font-medium" role="status">{INSUFFICIENT_RELEVANT_EVIDENCE} — none of the retrieved sources can be used for an AI draft.</p>
          )}
          <ul className="space-y-1">
            {bundle.references.map((r) => (
              <ReferenceItem key={r.refId} r={r} relevance={relevance.get(r.refId)} disabled={disabled} checked={selected.has(r.refId)} onToggle={() => setSelected((s) => { const n = new Set(s); if (n.has(r.refId)) n.delete(r.refId); else n.add(r.refId); return n; })} />
            ))}
          </ul>
          {!bundle.references.length && <p className="text-xs">No literature found for this concept.</p>}
          {bundle.relevanceGate && bundle.relevanceGate.excluded.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer">{bundle.relevanceGate.excluded.length} source(s) excluded from the last AI request</summary>
              <ul className="list-disc pl-4">{bundle.relevanceGate.excluded.map((x) => <li key={x.refId} className="break-words">{x.refId}: {RELEVANCE_LABELS[x.classification]} — {x.reason}</li>)}</ul>
            </details>
          )}
          {!bundle.draft && bundle.status === "insufficient_evidence" && bundle.relevanceGate && (
            <p className="text-sm font-medium" role="status">{INSUFFICIENT_RELEVANT_EVIDENCE} — no AI draft was generated.</p>
          )}
          <DraftView bundle={bundle} />
        </>
      )}
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
        <label className="min-w-0 flex-1 space-y-1 text-xs">
          <span className="block">Verify a citation identifier (PMID, PMCID, DOI or NASA NTRS ID)</span>
          <input className="w-full rounded border bg-background p-2" value={cite} disabled={!props.canReview || busy} onChange={(e) => setCite(e.target.value)} />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={!props.canReview || busy || cite.trim().length < 3} onClick={() => void runVerify()}>Verify identifier</Button>
      </div>
      {citeResult === "none" && <p className="text-xs" role="status">The provider has no record for this identifier — treat the citation as unverified.</p>}
      {citeResult && citeResult !== "none" && <ul><ReferenceItem r={citeResult} /></ul>}
      {note && <p className="text-xs" role="status">{note}</p>}
    </section>
  );
}

/** Deterministic preflight inventory and resumable batch drafting (never batch approval). */
export function InterpretationBacklogPanel(props: { snapshot: InterpretationSnapshot; canReview: boolean; userId: string | null }) {
  const search = useServerFn(searchInterpretationLiterature);
  const draftFn = useServerFn(draftInterpretationFromEvidence);
  const { attempts, reload } = useEvidenceAttempts();
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const stop = useRef(false);
  const bundles = useMemo(() => new Map([...latestAttempts(attempts)].flatMap(([k, v]) => (v.bundle ? [[k, v.bundle] as const] : []))), [attempts]);
  const report = useMemo(() => interpretationPreflight(props.snapshot, bundles), [props.snapshot, bundles]);
  const eligible = useMemo(
    () => props.snapshot.records.filter((r) => r.status !== "approved" && !conceptPrivacyProblem(identityConcept(r.identity, r.aliases))),
    [props.snapshot],
  );
  const byKey = useMemo(() => new Map(eligible.map((r) => [r.key, r])), [eligible]);
  const keys = useMemo(() => eligible.map((r) => r.key), [eligible]);
  const progress = useMemo(() => backlogProgress(keys, attempts), [keys, attempts]);

  const runBatch = async (size: number) => {
    if (!props.userId || running) return;
    setRunning(true);
    stop.current = false;
    let local = await listEvidenceAttempts();
    let done = 0;
    try {
      for (const key of nextBacklogBatch(keys, local, size)) {
        if (stop.current) break;
        const r: ResolvedInterpretation = byKey.get(key)!;
        const concept = identityConcept(r.identity, r.aliases);
        const at = () => new Date().toISOString();
        let attempt: EvidenceAttempt;
        try {
          const s = await search({ data: { key, concept } });
          if (!s.ok) attempt = planAttempt(key, local, "failed", null, failText(s), props.userId, at());
          else {
            // P41.1: batch drafting uses only references assessed as relevant (never potentially relevant or irrelevant ones).
            const usable = automaticDraftRefIds(s.bundle.references, concept).filter((x) => /^(pmid|ntrs):/.test(x)).slice(0, 10);
            if (!usable.length)
              attempt = planAttempt(
                key,
                local,
                s.bundle.status === "evidence_retrieved" ? "insufficient_evidence" : s.bundle.status,
                s.bundle.status === "evidence_retrieved" ? { ...s.bundle, gaps: [`${INSUFFICIENT_RELEVANT_EVIDENCE}: no retrieved reference was assessed as relevant; no AI draft was generated.`, ...s.bundle.gaps] } : s.bundle,
                null,
                props.userId,
                at(),
              );
            else {
              const d = await draftFn({ data: { key, concept, refIds: usable, selection: "automatic_batch" } });
              attempt = d.ok ? planAttempt(key, local, d.bundle.status, { ...d.bundle, queries: s.bundle.queries }, null, props.userId, at()) : planAttempt(key, local, "evidence_retrieved", s.bundle, failText(d), props.userId, at());
            }
          }
        } catch {
          attempt = planAttempt(key, local, "failed", null, "network error", props.userId, at());
        }
        await appendEvidenceAttempt(attempt);
        local = [...local, attempt];
        done++;
        setNote(`Processed ${done} entr${done === 1 ? "y" : "ies"} in this run…`);
      }
      setNote(`Batch finished: ${done} entr${done === 1 ? "y" : "ies"} processed. Drafts are not approvals; each entry must be reviewed and approved individually.`);
    } finally {
      await reload();
      setRunning(false);
    }
  };

  const c = report.conflicts;
  return (
    <section aria-label="Interpretation backlog" className="space-y-2 rounded-lg border border-border p-4">
      <h3 className="text-lg font-semibold">Interpretation backlog preflight and evidence-grounded batch drafts</h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-4">
        <dt className="text-muted-foreground">Records</dt><dd>{report.totalRecords}</dd>
        <dt className="text-muted-foreground">Distinct names</dt><dd>{report.distinctNormalizedNames}</dd>
        <dt className="text-muted-foreground">Canonical clusters</dt><dd>{report.distinctCanonicalClusters}</dd>
        <dt className="text-muted-foreground">Duplicate clusters</dt><dd>{report.duplicateClusters.length}</dd>
        <dt className="text-muted-foreground">Approved</dt><dd>{report.byLifecycle.approved}</dd>
        <dt className="text-muted-foreground">Pending / draft</dt><dd>{report.byLifecycle.pending_review} / {report.byLifecycle.draft}</dd>
        <dt className="text-muted-foreground">Awaiting attestation</dt><dd>{report.byLifecycle.awaiting_attestation}</dd>
        <dt className="text-muted-foreground">Rejected / revoked</dt><dd>{report.byLifecycle.rejected} / {report.byLifecycle.revoked}</dd>
        <dt className="text-muted-foreground">Superseded approvals</dt><dd>{report.supersededApprovals}</dd>
        <dt className="text-muted-foreground">Evidence complete / partial / missing</dt><dd>{report.evidence.complete} / {report.evidence.partial} / {report.evidence.missing}</dd>
        <dt className="text-muted-foreground">Not unit-bound</dt><dd>{c.notUnitBound}</dd>
        <dt className="text-muted-foreground">Names in several domains</dt><dd>{c.nameInMultipleDomains.length}</dd>
      </dl>
      <p className="text-xs text-muted-foreground">
        Specimen undocumented: {c.specimenNotDocumented} · method undocumented: {c.methodNotDocumented} · protocol undocumented: {c.protocolNotDocumented} · names with several units: {c.nameWithMultipleUnits.length} · source unit text listing several units: {c.ambiguousSourceUnitText.length}.
      </p>
      <ul className="list-disc pl-5 text-xs">{report.manualDecisions.map((m) => <li key={m}>{m}</li>)}</ul>
      <p className="text-sm">
        Batch progress ({progress.total} unapproved entries): {progress.draftReady} draft ready · {progress.insufficientEvidence} insufficient evidence · {progress.noEvidence} no literature · {progress.awaitingDraft} awaiting AI draft · {progress.failedRetryable} retryable failures · {progress.failedExhausted} failed after retries · {progress.notStarted} not started.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!props.canReview || running} onClick={() => void runBatch(5)}>Process next 5</Button>
        <Button type="button" size="sm" variant="outline" disabled={!props.canReview || running} onClick={() => void runBatch(25)}>Process next 25</Button>
        <Button type="button" size="sm" variant="ghost" disabled={!running} onClick={() => (stop.current = true)}>Stop after current entry</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Resumable and idempotent: completed entries are skipped, failures are retried up to three times, and every attempt is stored on this device. Batch drafts use only sources assessed as relevant; entries without one are marked “{INSUFFICIENT_RELEVANT_EVIDENCE}”. Batch work prepares drafts only — approval stays one entry at a time.
      </p>
      {note && <p className="text-xs" role="status">{note}</p>}
    </section>
  );
}

/** Unknown biomarkers from submitted (synthetic) terms → identification → research candidates. */
export function ResearchCandidatesPanel(props: { snapshot: InterpretationSnapshot; canReview: boolean; userId: string | null; onOpenKey: (key: string) => void }) {
  const listMissions = useServerFn(listGlobalReviewMissions);
  const listSubs = useServerFn(listGlobalReviewSubmissions);
  const [missions, setMissions] = useState<GlobalReviewMission[]>([]);
  const [missionId, setMissionId] = useState("");
  const [terms, setTerms] = useState<CandidateSourceTerm[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!props.canReview) return;
    void listMissions({ data: { provenance: "synthetic" } })
      .then((r) => r.ok && (setMissions(r.missions), r.missions.length === 1 && setMissionId(r.missions[0]!.missionId)))
      .catch(() => undefined);
  }, [listMissions, props.canReview]);

  const load = async () => {
    if (!missionId) return;
    setState("loading");
    const r = await listSubs({ data: { missionId, provenance: "synthetic" } }).catch(() => null);
    if (!r || !r.ok) {
      setState("error");
      setNote(r ? failText(r) : "Submitted terms are unavailable.");
      return;
    }
    setTerms(
      r.submissions.flatMap((s) =>
        s.terms.map((t) => ({
          termId: t.termId,
          originalLabels: t.originalLabels,
          exactUnit: t.exactUnit,
          candidateMetricIds: t.candidateMetricIds,
          specimen: t.specimen,
          method: t.method,
          sourceDocumentSha256: t.sourceDocumentSha256,
          origin: { kind: "p36_submitted_term" as const, missionId: s.missionId, provenance: s.provenance, submissionId: s.submissionId },
        })),
      ),
    );
    setState("ready");
  };

  const candidates = useMemo(() => deriveResearchCandidates(terms, props.snapshot), [terms, props.snapshot]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of candidates) m.set(c.identification, (m.get(c.identification) ?? 0) + 1);
    return m;
  }, [candidates]);
  const selected: ResearchCandidate | undefined = candidates.find((c) => c.candidateId === open);
  const activated = selected ? activatedIdentityFor(selected, props.snapshot) : null;

  return (
    <section aria-label="Interpretation research candidates" className="space-y-2 rounded-lg border border-border p-4">
      <h3 className="text-lg font-semibold">Unknown biomarkers: interpretation research candidates</h3>
      <p className="text-xs text-muted-foreground">
        Submitted unknown biomarkers stay review-only. Each label + exact unit is matched deterministically against existing interpretations; anything without a safe exact match becomes one shared research candidate. Values, dates and crew data are never copied.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="block">Mission (synthetic submissions)</span>
          <select className="rounded border bg-background p-2" value={missionId} disabled={!props.canReview} onChange={(e) => setMissionId(e.target.value)}>
            <option value="">Choose…</option>
            {missions.map((m) => <option key={m.missionId} value={m.missionId}>{m.missionCode}</option>)}
          </select>
        </label>
        <Button type="button" size="sm" variant="outline" disabled={!props.canReview || !missionId || state === "loading"} onClick={() => void load()}>Load submitted terms</Button>
      </div>
      {state === "error" && <p className="text-xs" role="alert">{note}</p>}
      {state === "ready" && (
        <>
          <p className="text-sm">
            {terms.length} submitted term(s) → {candidates.length} research candidate(s).{" "}
            {[...counts].map(([k, n]) => `${n} ${IDENTIFICATION_LABELS[k as ResearchCandidate["identification"]].split(" —")[0]!.toLowerCase()}`).join(" · ")}
          </p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="text-muted-foreground"><th className="p-1">Label</th><th className="p-1">Exact unit</th><th className="p-1">Identification</th><th className="p-1">Terms</th><th className="p-1" /></tr></thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.candidateId} className="border-t border-border align-top">
                    <td className="break-words p-1">{c.label}{c.aliases.length ? <span className="text-muted-foreground"> ({c.aliases.join(", ")})</span> : null}</td>
                    <td className="p-1 font-mono">{c.exactUnit}</td>
                    <td className="p-1">{IDENTIFICATION_LABELS[c.identification]}</td>
                    <td className="p-1">{c.termIds.length}</td>
                    <td className="p-1"><Button type="button" size="sm" variant="outline" onClick={() => setOpen(c.candidateId)}>Research</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {selected && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{selected.label} · {selected.exactUnit}</p>
              <p className="text-xs text-muted-foreground">{selected.note}</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{selected.candidateId} · terms {selected.termIds.join(", ")}</p>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>Close</Button>
          </div>
          {activated ? (
            <p className="text-sm">
              Activated as {activated.identity.displayName} ({activated.identity.unit}).{" "}
              <Button type="button" size="sm" variant="outline" onClick={() => props.onOpenKey(activated.key)}>Open its interpretation review</Button>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Not activated in a catalog yet. Evidence can be prepared now; it is attached to the interpretation only after Ground Medical activation and only by a Researcher action.</p>
          )}
          <InterpretationEvidencePanel researchKey={selected.key} concept={candidateConcept(selected)} canReview={props.canReview} userId={props.userId} />
        </div>
      )}
    </section>
  );
}
