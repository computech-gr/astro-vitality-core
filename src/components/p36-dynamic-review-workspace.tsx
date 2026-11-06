import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { loadMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import { listUnknownBiomarkerReviewState, type PendingReviewRequest } from "@/domain/health-intelligence/review-ledger";
import { cloudAuthorizationContext, cloudTermDossier, type CloudTerm } from "@/domain/health-intelligence/p36-cloud-handoff";
import { buildDynamicHandoff, draftBulkProposal, groupForProposal, type DynamicTerm } from "@/domain/health-intelligence/p36-dynamic-handoff";
import { buildAuthorizationView, type AuthorizationView } from "@/domain/health-intelligence/p36-scientific-authorization";
import { prepareGovernedPromotion } from "@/domain/health-intelligence/p36-governed-promotion";
import { loadVerifiedRevisions } from "@/domain/health-intelligence/p36-verified-revisions";
import type { ReviewScope } from "@/domain/health-intelligence/unknown-biomarker-review";
import { listDynamicHandoff } from "@/lib/p36-dynamic-handoff.functions";
import { listDynamicAuthorization } from "@/lib/p36-dynamic-authorization.functions";
import { TermAuthorizationPanel } from "./p36-final-authorization";
import { P36HandoffSubmission } from "./p36-handoff-submission";
import { P36PendingRequestsSummary } from "./p36-pending-requests-summary";
import type { useP36Authorization } from "@/hooks/use-p36-authorization";
import { loadMissionCrewRoster } from "@/infrastructure/mission-crew-roster";
import { buildCrewChoices, canHoldLocalRequests, rolesForScope, type CrewChoice, type RosterCrewMember } from "@/domain/health-intelligence/p36-crew-choices";

/** Searchable authorized-crew selector: displays names, resolves to exact authorized IDs. */
function CrewSelector({
  choices,
  value,
  onChange,
}: {
  choices: CrewChoice[];
  value: string;
  onChange: (crewId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = choices.find((c) => c.crewId === value) ?? null;
  const matches = query
    ? choices.filter((c) => `${c.name} ${c.crewId}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20)
    : choices.slice(0, 20);
  if (selected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{selected.name}</Badge>
        <Button variant="outline" onClick={() => { onChange(""); setQuery(""); }}>Change crew member</Button>
        <details className="text-xs">
          <summary className="cursor-pointer">Technical identifiers</summary>
          <p className="break-all text-muted-foreground">crew {selected.crewId} · mission {selected.missionId}</p>
        </details>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Input
        className="max-w-xs"
        aria-label="Search authorized crew members"
        placeholder={choices.length ? "Search crew member name" : "No authorized crew membership for this mission"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={!choices.length}
      />
      {choices.length ? (
        <ul className="max-h-48 max-w-md overflow-auto rounded-md border border-border" aria-label="Authorized crew members">
          {matches.map((c) => (
            <li key={c.crewId}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent"
                onClick={() => { onChange(c.crewId); setQuery(""); }}
              >
                {c.name} <span className="text-xs text-muted-foreground">· your role: {c.roles.join(" + ")}</span>
              </button>
            </li>
          ))}
          {!matches.length ? <li className="px-3 py-2 text-xs text-muted-foreground">No authorized crew member matches this search.</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

export function P36DynamicReviewWorkspace({ auth }: { auth: ReturnType<typeof useP36Authorization> }) {
  const [crew, setCrew] = useState("");
  const [provenance, setProvenance] = useState<"synthetic" | "real">("synthetic");
  const [local, setLocal] = useState<PendingReviewRequest[]>([]);
  const [cloud, setCloud] = useState<CloudTerm[]>([]);
  const [view, setView] = useState<AuthorizationView | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [commit, setCommit] = useState("");
  const [memberships, setMemberships] = useState<MissionMembershipContext[]>([]);
  const [roster, setRoster] = useState<RosterCrewMember[]>([]);
  const [rosterMessage, setRosterMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const epoch = useRef(0);
  const listCloud = useServerFn(listDynamicHandoff);
  const listAuthority = useServerFn(listDynamicAuthorization);
  const revisions = useMemo(() => loadVerifiedRevisions(), []);
  const scope = useMemo<ReviewScope | null>(() => auth.missionId && crew ? { missionId: auth.missionId, crewMemberId: crew, provenance } : null, [auth.missionId, crew, provenance]);

  // Memberships are bound to the signed-in account: cleared and reloaded on every account change; late responses discarded.
  useEffect(() => {
    let live = true;
    setMemberships([]);
    if (!auth.userId) return;
    void loadMissionIdentity().then((id) => {
      if (live && id.signedIn && !id.error && id.userId === auth.userId) setMemberships(id.memberships);
    });
    return () => { live = false; };
  }, [auth.userId]);
  // Mission-level reviewers receive the caller-readable mission roster; crew-bound members only their own crew.
  useEffect(() => {
    let live = true;
    setRoster([]); setRosterMessage("");
    const missionId = auth.missionId;
    if (!missionId || !auth.userId || !memberships.some((m) => m.missionId === missionId && !m.crewMemberId && (m.role === "ground_medical" || m.role === "researcher"))) return;
    void loadMissionCrewRoster(missionId).then((r) => {
      if (!live) return;
      if (r.ok) setRoster(r.crew); else setRosterMessage(r.message);
    });
    return () => { live = false; };
  }, [auth.missionId, auth.userId, memberships]);
  useEffect(() => { ++epoch.current; setCrew(""); setCloud([]); setLocal([]); setView(null); setSelected([]); setMessage(""); }, [auth.missionId, auth.userId]);

  const crewChoices = useMemo<CrewChoice[]>(() => buildCrewChoices(memberships, roster, auth.missionId), [memberships, roster, auth.missionId]);
  // A selected crew that is no longer authorized (revocation/account change) is cleared.
  useEffect(() => { if (crew && !crewChoices.some((c) => c.crewId === crew)) setCrew(""); }, [crew, crewChoices]);

  /** Roles the signed-in account holds for the exact selected scope (mission-level roles included). */
  const scopeRoles = useMemo(() => (scope ? rolesForScope(memberships, scope.missionId, scope.crewMemberId) : []), [memberships, scope]);
  const showLocalSummary = canHoldLocalRequests(memberships, null);
  const canSubmit = scopeRoles.includes("ground_medical") || scopeRoles.includes("crew_self");
  const researcherOnly = scopeRoles.includes("researcher") && !canSubmit;

  const reload = useCallback(async () => {
    const current = ++epoch.current;
    setCloud([]); setLocal([]); setView(null); setSelected([]); setPage(0);
    if (!scope || !auth.userId) return;
    setLoading(true); setMessage("");
    try {
      const identity = await loadMissionIdentity();
      if (!identity.signedIn || identity.error || identity.userId !== auth.userId || !identity.memberships.some((m) => m.missionId === scope.missionId && (m.crewMemberId === scope.crewMemberId || !m.crewMemberId && ["ground_medical", "researcher"].includes(m.role)))) throw new Error("Authorization for this scope could not be confirmed.");
      if (current !== epoch.current) return;
      const [localResult, cloudResult] = await Promise.all([listUnknownBiomarkerReviewState(scope), listCloud({ data: scope })]);
      if (current !== epoch.current) return;
      setLocal(localResult.requests);
      if (!cloudResult.ok) { setMessage(cloudResult.message); return; }
      setCloud(cloudResult.terms);
      const authority = await listAuthority({ data: scope });
      if (current !== epoch.current) return;
      if (authority.ok) {
        const next = await buildAuthorizationView(authority.rows, scope.missionId, undefined, await cloudAuthorizationContext(cloudResult.terms));
        if (current !== epoch.current) return;
        setView(next);
      }
      setMessage(`${cloudResult.submissions.length} server receipt(s); ${cloudResult.conflicts.length} conflicting term(s) held. ${authority.ok ? "Scoped authorization history verified." : authority.message}`);
    } catch (e) { if (current === epoch.current) setMessage(e instanceof Error ? e.message : "Unable to read this scope."); }
    finally { if (current === epoch.current) setLoading(false); }
  }, [scope, auth.userId, listCloud, listAuthority]);
  useEffect(() => { void reload(); const current = epoch.current; return () => { epoch.current = current + 1; }; }, [reload]);
  useEffect(() => {
    const focus = () => { void reload(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [reload]);

  const localView = scope ? buildDynamicHandoff(scope, local) : null;
  const cloudIds = new Set(cloud.map((t) => t.termId));
  const cloudTerms: DynamicTerm[] = cloud.map((t): DynamicTerm => ({ termId: t.termId, canonicalKey: `${t.termId}|${t.exactUnit}`, normalizedLabel: t.originalLabels[0] ?? "", originalLabels: t.originalLabels, exactUnit: t.exactUnit, classification: t.classification, candidateMetricIds: t.candidateMetricIds, observationCount: 0, sourceDocumentSha256: t.sourceDocumentSha256, evidencePointers: t.evidencePointers, requestIds: [], syncState: "LOCAL_ONLY", inLegacyHandoff: false, scientificStatus: "PENDING_NIKOLAS_REVIEW", blockers: ["PENDING_SCIENTIFIC_REVIEW", "METHOD_PROTOCOL_UNRECORDED", "SPECIMEN_UNRECORDED", ...(t.classification === "source_unvalidated" ? ["SOURCE_UNVALIDATED" as const] : []), ...(t.classification === "ambiguous" || t.candidateMetricIds.length > 1 ? ["AMBIGUOUS_CANDIDATES" as const] : []), ...(t.candidateMetricIds.length === 0 ? ["NO_CANDIDATE" as const] : [])] }));
  // Researchers see only successfully submitted, authorized cloud terms — never device-local registrations.
  const terms = researcherOnly ? cloudTerms : [...cloudTerms, ...(localView?.terms.filter((t) => !cloudIds.has(t.termId) && !t.inLegacyHandoff) ?? [])];
  const safeIds = new Set(groupForProposal(terms).filter((g) => g.selectable).flatMap((g) => g.termIds));
  const filtered = terms.filter((t) => `${t.originalLabels.join(" ")} ${t.exactUnit} ${t.termId}`.toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const bulk = draftBulkProposal(terms, selected);
  const dynamicAuth = { ...auth, view, load: view?.loaded ? "ready" as const : "error" as const, reload };
  const isVerifiedSelection = revisions.revisions.some((r) => r.revision === commit);
  const exportPromotion = async (termId: string) => {
    try {
      const state = view?.terms.find((t) => t.termId === termId);
      if (!state) throw new Error("Authorization not loaded.");
      if (!isVerifiedSelection) throw new Error("Select a verified revision from the governed registry.");
      const artifact = await prepareGovernedPromotion(state, commit);
      const url = URL.createObjectURL(new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = `P36_${termId}_governed_promotion.json`; a.click(); URL.revokeObjectURL(url);
      setMessage("Promotion proposal downloaded for code review. No catalog was changed; future imports remain blocked until approved deployment and row-by-row re-import.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Promotion blocked."); }
  };
  return <section aria-label="Dynamic submitted scientific terms" className="space-y-3 border-y border-border py-5">
    <h2 className="text-xl font-semibold">Submitted and device-local terms</h2>
    {showLocalSummary ? <P36PendingRequestsSummary userId={auth.userId} refreshKey={refreshKey} focusScope={scope} /> : null}
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Scientific review provenance" className="border border-border bg-background px-3 py-2" value={provenance} onChange={(e) => setProvenance(e.target.value as "synthetic" | "real")}><option value="synthetic">Synthetic</option><option value="real">Real</option></select>
        <Button variant="outline" disabled={!scope || loading} onClick={() => void reload()}>Refresh submitted terms</Button>
        {auth.missionId ? <details className="text-xs"><summary className="cursor-pointer">Technical identifiers</summary><p className="break-all text-muted-foreground">mission {auth.missionId}</p></details> : null}
      </div>
      {auth.missionId ? <CrewSelector choices={crewChoices} value={crew} onChange={setCrew} /> : null}
      {rosterMessage ? <p role="status" className="text-xs text-destructive">{rosterMessage}</p> : null}
    </div>
    {!auth.missionId ? <p>Select an authorized mission above to read submitted terms. The original 12 documentary dossiers remain below.</p> : null}
    {researcherOnly ? <p className="text-xs text-muted-foreground">Researcher view: only successfully submitted and authorized cloud terms are shown. Device-local registrations and submission controls are not part of the Researcher workflow.</p> : null}
    {loading ? <p role="status">Reading authorized cloud metadata and encrypted local requests…</p> : null}
    {message ? <p role="status" className="break-words text-sm">{message}</p> : null}
    {!researcherOnly && auth.userId ? local.map((r) => <P36HandoffSubmission key={r.requestId} request={r} userId={auth.userId!} onSubmitted={() => { setRefreshKey((k) => k + 1); void reload(); }} />) : null}
    <Input aria-label="Search dynamic terms" placeholder="Search label, exact unit or term ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
    <p className="text-xs">{terms.length} {researcherOnly ? "submitted" : "additional"} term(s) · {cloud.length} cloud term(s) · {selected.length} proposal selection(s). Grouping is not scientific approval. Recommendations and approvals require an independently verified source receipt; uploaded labels never validate a source.</p>
    {scope && !loading && terms.length === 0 ? <p>{researcherOnly ? "No successfully submitted terms are available in this exact scope." : "No submitted or device-local terms available in this exact scope. A request registered on another browser is not present here until explicitly submitted."}</p> : null}
    <ul className="space-y-3">{filtered.slice(Math.min(page, pages - 1) * 20, (Math.min(page, pages - 1) + 1) * 20).map((t) => {
      const cloudTerm = cloud.find((c) => c.termId === t.termId);
      return <li key={t.termId} className="space-y-2 rounded-md border border-border p-3 text-sm">
        <div className="flex flex-wrap items-start gap-2"><input aria-label={`Select proposal ${t.originalLabels[0]}`} type="checkbox" disabled={!safeIds.has(t.termId)} checked={selected.includes(t.termId)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, t.termId] : s.filter((id) => id !== t.termId))} /><strong className="break-words">{t.originalLabels.join(" / ")}</strong><span>{t.exactUnit || "unit missing"}</span><Badge variant="outline">{cloudTerm ? "SUBMITTED" : "LOCAL_ONLY — not shared"}</Badge></div>
        <p className="break-words text-xs">{t.termId} · {t.classification} · candidate IDs {t.candidateMetricIds.join(", ") || "none"} · method/specimen unrecorded · scientific review pending</p>
        <details><summary className="cursor-pointer">Evidence fingerprints</summary><ul>{t.sourceDocumentSha256.map((h) => <li className="break-all" key={h}>{h} (not source validation)</li>)}</ul><p>{t.evidencePointers.length} opaque evidence pointer(s); no clinical values sent.</p></details>
        {cloudTerm && scope ? <TermAuthorizationPanel dossier={cloudTermDossier(cloudTerm)} state={view?.terms.find((s) => s.termId === t.termId)} auth={dynamicAuth} scope={scope} /> : <p>Local-only evidence cannot authorize a cloud scientific decision.</p>}
        <Button variant="outline" disabled={view?.terms.find((s) => s.termId === t.termId)?.scientificStatus !== "SCIENTIFICALLY_APPROVED" || !isVerifiedSelection} onClick={() => void exportPromotion(t.termId)}>Prepare governed promotion artifact</Button>
      </li>;
    })}</ul>
    <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button><span>Page {Math.min(page, pages - 1) + 1} / {pages}</span><Button variant="outline" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
    {selected.length ? <p role="status" className="text-sm">{bulk.ok ? `Proposal prepared for ${bulk.proposal.termIds.length} terms → ${bulk.proposal.candidateMetricId}, exact unit ${bulk.proposal.exactUnit}. Each term requires its own recommendation and independent decision; nothing approved or persisted.` : bulk.reason}</p> : null}
    <div className="space-y-1">
      <select aria-label="Validated revision for governed promotion" className="border border-border bg-background px-3 py-2" value={commit} onChange={(e) => setCommit(e.target.value)} disabled={!revisions.revisions.length}>
        <option value="">{revisions.revisions.length ? "Choose a verified revision" : "No verified revisions registered"}</option>
        {revisions.revisions.map((r) => <option key={r.revision} value={r.revision}>{r.revision.slice(0, 12)}… · verified {r.verifiedAt.slice(0, 10)} by {r.verifier}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">
        {revisions.revisions.length
          ? "Only revisions in the governed registry with independently reviewable verification evidence are listed. The selection is a declaration checked against the registry, not proof of CI."
          : "Governed promotion preparation is unavailable: the verified-revisions registry is empty. Revisions are never generated, guessed or accepted from free text."}
      </p>
      {revisions.problems.length ? <p role="alert" className="text-xs text-destructive">Registry integrity problem; entries rejected: {revisions.problems.join("; ")}</p> : null}
      {commit ? <details className="text-xs"><summary className="cursor-pointer">Technical identifiers</summary><p className="break-all text-muted-foreground">revision {commit}</p></details> : null}
    </div>
  </section>;
}
