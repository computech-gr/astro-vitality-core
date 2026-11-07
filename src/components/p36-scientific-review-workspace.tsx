/**
 * P36 Scientific Review & Governed Activation Preparation workspace.
 * One dossier per handoff term with source evidence, unit comparison,
 * unresolved questions and a documentary, hash-chained reviewer worksheet.
 * Every term stays PENDING_NIKOLAS_REVIEW; nothing is activated, imported,
 * uploaded or written to the catalogs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import { REQUIRED_SCIENTIFIC_GATE } from "@/domain/health-intelligence/unknown-biomarker-review";
import {
  ACTIVATION_BLOCKER_LABELS,
  GLOBAL_ACTIVATION_PREREQUISITES,
  SCIENTIFIC_REVIEW_DECISION_LABELS,
  buildActivationManifest,
  buildScientificReviewDossiers,
  catalogEntryFor,
  buildScientificReviewEntry,
  latestEntryByTerm,
  type ActivationManifest,
  type ScientificReviewDecision,
  type ScientificReviewDossier,
  type ScientificReviewEntry,
} from "@/domain/health-intelligence/p36-scientific-review";
import { appendScientificReviewEntry, listScientificReviewEntries } from "@/domain/health-intelligence/p36-scientific-review-ledger";
import { buildDecisionDossier, verifyDecisionDossier, type DecisionDossier } from "@/domain/health-intelligence/p36-decision-dossier";
import { AuthorizationSummary, TermAuthorizationPanel } from "@/components/p36-final-authorization";
import { useP36Authorization } from "@/hooks/use-p36-authorization";
import { P36CompactReviewTable } from "@/components/p36-compact-review-table";
import { scientificDisplayStatus } from "@/domain/health-intelligence/p36-review-table";
import { P36DynamicReviewWorkspace } from "@/components/p36-dynamic-review-workspace";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

type Draft = {
  decision: ScientificReviewDecision;
  targetCatalogId: string;
  confirmedUnit: string;
  specimen: string;
  assayMethod: string;
  protocol: string;
  evidenceRefs: string;
  rationale: string;
  reviewerName: string;
  reviewerQualification: string;
  independenceConfirmed: boolean;
};

const emptyDraft = (): Draft => ({
  decision: "NEEDS_MORE_EVIDENCE", targetCatalogId: "", confirmedUnit: "", specimen: "", assayMethod: "", protocol: "",
  evidenceRefs: "", rationale: "", reviewerName: "", reviewerQualification: "", independenceConfirmed: false,
});

const UNIT_STATUS_LABEL = {
  EXACT_STRING_MATCH: "same unit text",
  STRING_DIFFERS_NO_CONVERSION: "different unit text — no conversion",
  NO_REFERENCE_UNIT: "no unit recorded",
} as const;

export function P36ScientificReviewWorkspace() {
  const build = useMemo(() => buildScientificReviewDossiers(), []);
  const [entries, setEntries] = useState<ScientificReviewEntry[]>([]);
  const [integrity, setIntegrity] = useState<{ ok: boolean; problems: string[] }>({ ok: true, problems: [] });
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [manifest, setManifest] = useState<ActivationManifest | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [identity, setIdentity] = useState<{ userId: string | null; roles: string[] }>({ userId: null, roles: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dossier, setDossier] = useState<DecisionDossier | null>(null);
  const [dossierMessage, setDossierMessage] = useState("");
  const auth = useP36Authorization();
  const authView = auth.view && auth.view.loaded ? auth.view : undefined;

  const reload = useCallback(async () => {
    setLoadState("loading");
    try {
      const state = await listScientificReviewEntries();
      setEntries(state.entries);
      setIntegrity(state.integrity);
      setManifest(await buildActivationManifest(state.entries));
      setLoadState("ready");
    } catch {
      setEntries([]);
      setManifest(await buildActivationManifest([]));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void buildDecisionDossier(loadState === "ready" ? entries : [], { generatedAt: null, authorization: authView }).then(setDossier);
  }, [entries, loadState, authView]);

  useEffect(() => {
    void reload();
    void loadMissionIdentity().then((id) => {
      if (!id.signedIn || id.error || !id.userId) return setIdentity({ userId: null, roles: [] });
      setIdentity({ userId: id.userId, roles: [...new Set(id.memberships.map((m) => m.role))] });
    });
  }, [reload]);

  const canRecord = Boolean(identity.userId) && (identity.roles.includes("ground_medical") || identity.roles.includes("researcher"));
  const latest = latestEntryByTerm(entries);
  const manifestTerm = (termId: string) => manifest?.terms.find((t) => t.termId === termId);
  const draftFor = (termId: string) => drafts[termId] ?? emptyDraft();

  const record = async (dossier: ScientificReviewDossier) => {
    if (busy) return;
    setBusy(true);
    try {
      const fresh = await loadMissionIdentity();
      if (!fresh.signedIn || fresh.error || !fresh.userId || fresh.userId !== identity.userId)
        return setMessage("Your sign-in could not be confirmed. Nothing was recorded.");
      const d = draftFor(dossier.termId);
      const result = await buildScientificReviewEntry(
        {
          termId: dossier.termId, decision: d.decision, targetCatalogId: d.targetCatalogId, confirmedUnit: d.confirmedUnit,
          specimen: d.specimen, assayMethod: d.assayMethod, protocol: d.protocol,
          evidenceRefs: d.evidenceRefs.split(/[\n,;]+/), rationale: d.rationale, reviewerName: d.reviewerName,
          reviewerQualification: d.reviewerQualification, independenceConfirmed: d.independenceConfirmed,
        },
        dossier,
        entries,
        { userId: fresh.userId, roles: fresh.memberships.map((m) => m.role), recordedAt: new Date().toISOString() },
      );
      if (!result.ok) return setMessage(result.reason);
      await appendScientificReviewEntry(result.entry);
      await reload();
      setDrafts((prev) => ({ ...prev, [dossier.termId]: emptyDraft() }));
      setMessage(`Worksheet entry #${result.entry.sequence} recorded on this device (encrypted, append-only). ${dossier.sourceLabel} stays ${scientificDisplayStatus(REQUIRED_SCIENTIFIC_GATE)}; nothing was activated or uploaded.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The entry could not be recorded.");
    } finally {
      setBusy(false);
    }
  };

  const exportManifest = async () => {
    const m = await buildActivationManifest(entries, { generatedAt: new Date().toISOString() });
    const blob = new Blob([JSON.stringify(m, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MITOCHONDRIA_p36_activation_manifest_${m.manifestVersion.replace(/[^A-Za-z0-9.+-]/g, "_")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setMessage(`Activation manifest ${m.manifestVersion} downloaded to this device. It applies nothing; every term remains ${scientificDisplayStatus(REQUIRED_SCIENTIFIC_GATE)}.`);
  };

  const exportDossierJson = async () => {
    const d = await buildDecisionDossier(entries, { generatedAt: new Date().toISOString(), authorization: authView });
    downloadBlob(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }), `MITOCHONDRIA_p36_scientific_decision_dossier_${d.integrity.contentDigest.slice(0, 12)}.json`);
    setDossierMessage(`Decision dossier JSON downloaded (digest ${d.integrity.contentDigest.slice(0, 16)}…). Nothing was uploaded or approved.`);
  };

  const exportDossierPdf = async () => {
    setBusy(true);
    try {
      const d = await buildDecisionDossier(entries, { generatedAt: new Date().toISOString(), authorization: authView });
      const { createDecisionDossierPdf } = await import("@/domain/health-intelligence/p36-decision-dossier-pdf");
      const { blob, pages } = await createDecisionDossierPdf(d);
      downloadBlob(blob, `MITOCHONDRIA_p36_scientific_decision_dossier_${d.integrity.contentDigest.slice(0, 12)}.pdf`);
      setDossierMessage(`Decision dossier PDF downloaded (${pages} pages, digest ${d.integrity.contentDigest.slice(0, 16)}…). Every term remains ${scientificDisplayStatus(REQUIRED_SCIENTIFIC_GATE)}.`);
    } catch (e) {
      setDossierMessage(`The PDF could not be created: ${e instanceof Error ? e.message : "unknown error"}. The JSON export is unaffected.`);
    } finally {
      setBusy(false);
    }
  };

  const d0 = (v: { approvals: number }) => `${v.approvals} approval(s) recorded in the file at export`;
  const verifyDossierFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setDossierMessage("The file is larger than 5 MB and was not read.");
    try {
      const v = await verifyDecisionDossier(JSON.parse(await file.text()));
      setDossierMessage(v.ok
        ? `Integrity verified: content digest matches; ${d0(v)}. This check never grants or proves authorization — only the live cloud ledger does. ${v.sourcesCurrent ? "Source artifacts match this version." : "Source artifacts have changed since this dossier was exported."}`
        : `Integrity check FAILED: ${v.problems.join(" ")}`);
    } catch {
      setDossierMessage("The file is not valid JSON.");
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 text-foreground sm:px-5">
      <div className="space-y-3">
        <p className="section-kicker">P36 · Scientific review &amp; governed activation preparation</p>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">Catalog Scientific Review</h1>
        <p className="max-w-3xl text-muted-foreground">
          The original {build.dossiers.length} documentary dossiers are preserved below. Additional terms are loaded only from an authorized scope;
          a local registration is not a server submission. Worksheet entries never authorize a mapping. Independent scientific decisions are separate
          from governed catalog activation, and neither rewrites held observations, converts units or changes report evidence.
        </p>
      </div>

      <section aria-label="Review status" className="grid gap-3 sm:grid-cols-4">
        {[
          ["Terms", build.dossiers.length],
          ["Observations held", build.dossiers.reduce((n, d) => n + d.observations, 0)],
          ["Terms with a reviewer entry", manifest?.counts.withDecision ?? 0],
          ["Ready for activation", manifest?.counts.readyForGovernedActivation ?? 0],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-lg border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <AuthorizationSummary auth={auth} />
      <P36DynamicReviewWorkspace auth={auth} />

      {!build.ok ? <p role="alert" className="text-sm text-destructive">Source integrity check failed; every term remains blocked: {build.problems.join("; ")}</p> : null}
      <p role="status" className="text-xs text-muted-foreground">
        {loadState === "loading" ? "Reading the encrypted local review history…"
          : loadState === "error" ? "The local review history could not be read. Nothing is shown from it and nothing can be recorded."
          : integrity.ok ? `${entries.length} worksheet entr${entries.length === 1 ? "y" : "ies"} on this device · history integrity verified (SHA-256 chain).`
          : `History integrity FAILED: ${integrity.problems.join("; ")}. Recording is disabled.`}
      </p>
      {!canRecord ? (
        <p className="text-sm text-muted-foreground">View only. Recording worksheet entries requires signing in with a Ground Medical or Researcher membership; the named independent scientific reviewer is recorded with each entry.</p>
      ) : null}

      <P36CompactReviewTable label="Original documentary dossiers" rows={build.dossiers.map((d) => ({
        id: d.termId, name: d.sourceLabel, unit: d.sourceUnit,
        domain: [...new Set(d.candidateCatalogIds.map((id) => catalogEntryFor(id)?.domain).filter(Boolean))].join(" / ") || "Unresolved",
        candidates: d.candidateCatalogIds,
        evidence: d.noValidatedCatalogUnit ? "Unit validation missing" : "Scientific evidence incomplete",
        decision: scientificDisplayStatus(auth.view?.terms.find((t) => t.termId === d.termId)?.scientificStatus ?? d.status),
        activation: "Activation blocked", origin: "Documentary · not a cloud submission",
      }))} renderDetail={(id) => {
          const d = build.dossiers.find((row) => row.termId === id);
          if (!d) return null;
          const draft = draftFor(d.termId);
          const set = (patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [d.termId]: { ...draft, ...patch } }));
          const last = latest.get(d.termId);
          const mt = manifestTerm(d.termId);
          const history = entries.filter((e) => e.termId === d.termId);
          const targeted = draft.decision === "ACCEPT_ALIAS_WITH_EVIDENCE" || draft.decision === "ACCEPT_RELATED_DISTINCT_MEASURE";
          return (
            <div id={d.termId} className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold break-words">{d.sourceLabel}</h2>
                <span className="text-muted-foreground">{d.sourceUnit}</span>
                <Badge variant="secondary">{scientificDisplayStatus(d.status)}</Badge>
                <Badge variant="outline">{d.handoff.candidateCatalogStatus}</Badge>
                {last ? <Badge variant="outline">Latest entry: {SCIENTIFIC_REVIEW_DECISION_LABELS[last.decision]}</Badge> : null}
              </div>
              <p className="break-words text-muted-foreground">
                {d.observations} held observation(s) · term {d.termId} · candidate IDs: {d.candidateCatalogIds.join(", ") || "none"}
                {d.handoff.candidateCatalogId ? "" : " (not proposed by the handoff; listed for the reviewer only)"}
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <h3 className="font-medium">Units (exact text comparison)</h3>
                  <ul className="space-y-0.5 text-xs">
                    {d.unitComparisons.map((u) => (
                      <li key={u.reference} className="break-words">
                        {u.reference}: {u.referenceUnits.join(" / ") || "—"} · <span className={u.status === "STRING_DIFFERS_NO_CONVERSION" ? "font-semibold" : ""}>{UNIT_STATUS_LABEL[u.status]}</span>
                      </li>
                    ))}
                  </ul>
                  {d.noValidatedCatalogUnit ? <p className="text-xs">No candidate catalog metric has a validated unit.</p> : null}
                </div>
                <div className="space-y-1">
                  <h3 className="font-medium">Specimen, assay and protocol</h3>
                  <p className="text-xs">Specimen in sources: {d.specimen.join("; ") || "not stated in repository sources"}</p>
                  {d.assayProtocolNotes.length ? <ul className="list-disc pl-4 text-xs">{d.assayProtocolNotes.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="text-xs">No assay or protocol details in repository sources.</p>}
                </div>
              </div>

              <div className="space-y-1">
                <h3 className="font-medium">Unresolved scientific questions</h3>
                <ol className="list-decimal space-y-0.5 pl-5 text-xs">{d.unresolvedQuestions.map((q) => <li key={q}>{q}</li>)}</ol>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer font-medium">Source evidence ({d.evidence.length})</summary>
                <ul className="mt-1 space-y-1">
                  {d.evidence.map((e) => (
                    <li key={e.ref} className="break-words border-b border-border py-1">
                      <code>{e.ref}</code> · {e.title}
                      <span className="block text-muted-foreground">{e.details.join(" · ")}</span>
                    </li>
                  ))}
                </ul>
              </details>

              {mt ? (
                <p className="break-words text-xs text-muted-foreground">
                  Activation blockers: {mt.blockers.map((b) => ACTIVATION_BLOCKER_LABELS[b]).join("; ")}.
                </p>
              ) : null}

              <TermAuthorizationPanel dossier={d} state={auth.view?.terms.find((t) => t.termId === d.termId)} auth={auth} />

              {history.length ? (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">Audit history ({history.length}, append-only)</summary>
                  <ol className="mt-1 space-y-1">
                    {history.map((e) => (
                      <li key={e.hash} className="break-words border-b border-border py-1">
                        #{e.sequence} · {e.recordedAt} · {SCIENTIFIC_REVIEW_DECISION_LABELS[e.decision]}{e.targetCatalogId ? ` → ${e.targetCatalogId}` : ""}
                        {e.confirmedUnit ? ` · unit ${e.confirmedUnit}` : ""} · reviewer {e.reviewerName} ({e.reviewerQualification}) · recorded by {e.recordedByRole} ·
                        evidence {e.evidenceRefs.join(", ")} · {e.rationale} · hash {e.hash.slice(0, 12)}… · {scientificDisplayStatus(e.scientificStatus)}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}

              {canRecord && integrity.ok && loadState === "ready" ? (
                <details className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer font-medium">Record documentary worksheet entry (local only, not a decision)</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select aria-label={`Decision for ${d.sourceLabel}`} className="rounded-md border border-border bg-background px-2 py-1.5" value={draft.decision} onChange={(e) => set({ decision: e.target.value as ScientificReviewDecision })}>
                      {Object.entries(SCIENTIFIC_REVIEW_DECISION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    {targeted ? (
                      <select aria-label={`Candidate catalog ID for ${d.sourceLabel}`} className="rounded-md border border-border bg-background px-2 py-1.5" value={draft.targetCatalogId} onChange={(e) => set({ targetCatalogId: e.target.value })}>
                        <option value="">Choose candidate catalog ID</option>
                        {d.candidateCatalogIds.map((id) => <option key={id} value={id}>{id}</option>)}
                      </select>
                    ) : <span />}
                    {draft.decision === "ACCEPT_ALIAS_WITH_EVIDENCE" ? (
                      <>
                        <Input aria-label="Confirmed exact unit" placeholder={`Exact unit (must be ${d.sourceUnit})`} value={draft.confirmedUnit} onChange={(e) => set({ confirmedUnit: e.target.value })} />
                        <Input aria-label="Specimen" placeholder="Specimen" value={draft.specimen} onChange={(e) => set({ specimen: e.target.value })} />
                        <Input aria-label="Assay or method" placeholder="Assay / measurement method" value={draft.assayMethod} onChange={(e) => set({ assayMethod: e.target.value })} />
                        <Input aria-label="Protocol" placeholder="Collection / test protocol" value={draft.protocol} onChange={(e) => set({ protocol: e.target.value })} />
                      </>
                    ) : null}
                    <Input aria-label="Reviewer name" placeholder="Independent reviewer name" value={draft.reviewerName} onChange={(e) => set({ reviewerName: e.target.value })} />
                    <Input aria-label="Reviewer qualification" placeholder="Scientific qualification" value={draft.reviewerQualification} onChange={(e) => set({ reviewerQualification: e.target.value })} />
                    <Input className="sm:col-span-2" aria-label="Evidence references" placeholder={`Evidence refs, comma-separated (e.g. ${d.evidence[0]?.ref ?? "doc:…"}, doi:…, pmid:…)`} value={draft.evidenceRefs} onChange={(e) => set({ evidenceRefs: e.target.value })} />
                    <Input className="sm:col-span-2" aria-label="Rationale" placeholder="Rationale (no thresholds, diagnoses or conversions)" value={draft.rationale} onChange={(e) => set({ rationale: e.target.value })} />
                    <label className="flex items-start gap-2 sm:col-span-2">
                      <input type="checkbox" checked={draft.independenceConfirmed} onChange={(e) => set({ independenceConfirmed: e.target.checked })} />
                      The named reviewer did not author this candidate mapping and has no conflict of interest.
                    </label>
                    <Button type="button" variant="outline" className="sm:col-span-2" disabled={busy} onClick={() => void record(d)}>Record entry (stays {scientificDisplayStatus(REQUIRED_SCIENTIFIC_GATE)})</Button>
                  </div>
                </details>
              ) : null}
            </div>
          );
        }} />

      <section aria-label="Activation manifest" className="space-y-2 rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="text-lg font-semibold">Versioned activation manifest (prepared, not applied)</h2>
        {manifest ? (
          <p className="break-words text-xs text-muted-foreground">
            {manifest.manifestVersion} · {manifest.counts.terms} terms · {manifest.counts.blocked} blocked · {manifest.counts.readyForGovernedActivation} ready ·
            history {manifest.reviewHistory.integrity} · digest {manifest.manifestDigest.slice(0, 16)}…
          </p>
        ) : null}
        <p>Activation prerequisites (all required, each in a separate governed patch):</p>
        <ol className="list-decimal space-y-0.5 pl-5 text-xs">{GLOBAL_ACTIVATION_PREREQUISITES.map((p) => <li key={p}>{p}</li>)}</ol>
        <Button type="button" variant="outline" disabled={!manifest} onClick={() => void exportManifest()}>Download activation manifest (JSON)</Button>
      </section>

      <section aria-label="Scientific decision dossier" className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
        <h2 className="text-lg font-semibold">Scientific decision dossier for Researcher review</h2>
        <p className="text-xs text-muted-foreground">
          One consolidated dossier for all {dossier?.counts.terms ?? 12} terms: exact source references, proposed identity, domain, specimen, method, protocol, units,
          uncertainties and required decisions. Each field states whether it is a verified source fact or an unresolved assumption; missing methods, units and validation are shown as missing.
        </p>
        {dossier ? (
          <>
            <p className="break-words text-xs text-muted-foreground">
              {dossier.counts.blocked} blocked · {dossier.counts.requiredDecisions} required decisions · {dossier.counts.conflicts} source conflict(s) · {dossier.counts.missingMethods} without a recorded method ·
              {" "}{dossier.scientificApprovals} approvals · digest {dossier.integrity.contentDigest.slice(0, 16)}… · sources {dossier.integrity.sourceIntegrity}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-xs" aria-label="Decision matrix">
                <thead>
                  <tr className="border-b border-border">
                    {["Term (unit)", "Identity", "Domain", "Specimen", "Method", "Protocol", "Unit", "Validation / other"].map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {dossier.decisionMatrix.map((r) => (
                    <tr key={r.termId} className="border-b border-border align-top">
                      <td className="px-2 py-1 font-medium">{r.sourceLabel} ({r.sourceUnit})</td>
                      <td className="px-2 py-1">{r.identity}</td>
                      <td className="px-2 py-1">{r.domain}</td>
                      <td className="px-2 py-1">{r.specimen}</td>
                      <td className="px-2 py-1">{r.method}</td>
                      <td className="px-2 py-1">{r.protocol}</td>
                      <td className="px-2 py-1">{r.unit}</td>
                      <td className="px-2 py-1">{r.validation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!dossier || busy} onClick={() => void exportDossierPdf()}>Download decision dossier (PDF)</Button>
          <Button type="button" variant="outline" disabled={!dossier} onClick={() => void exportDossierJson()}>Download decision dossier (JSON)</Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-2 text-sm">
            Verify a dossier JSON
            <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void verifyDossierFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        </div>
        {dossierMessage ? <p role="status" className="text-sm text-muted-foreground">{dossierMessage}</p> : null}
      </section>

      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </main>
  );
}
