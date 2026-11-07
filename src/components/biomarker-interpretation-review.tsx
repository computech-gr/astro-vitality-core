import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  loadMissionIdentity,
  subscribeMissionIdentity,
  type MissionIdentitySnapshot,
} from "@/infrastructure/mission-identity";
import {
  EMPTY_CONTENT,
  EVIDENCE_LEVEL_LABELS,
  INTERPRETATION_DOMAINS,
  PENDING_INTERPRETATION_TEXT,
  SYNTHETIC_DEMO_INTERPRETATION_LABEL,
  approvalProblem,
  buildApprovalPackage,
  buildVerifiedSnapshot,
  canReviewInterpretations,
  citationLines,
  deriveInterpretationTasks,
  interpretationKey,
  LIFECYCLE_LABELS,
  planApproval,
  planAttestation,
  planDraft,
  planRejectDraft,
  planRevocation,
  planTaskOpened,
  requiredAcknowledgement,
  type ActorContext,
  type CatalogIdentitySource,
  type Citation,
  type CitationKind,
  type Claim,
  type EvidenceLevel,
  type InterpretationContent,
  type InterpretationDomain,
  type InterpretationDraft,
  type InterpretationEvent,
  type InterpretationIdentity,
  type InterpretationSnapshot,
  type ResolvedInterpretation,
} from "@/domain/health-intelligence/biomarker-interpretation";
import {
  appendInterpretationEvent,
  bundledInterpretationRegistry,
  listInterpretationEvents,
  registryInterpretationSnapshot,
} from "@/domain/health-intelligence/biomarker-interpretation-ledger";
import { getSyntheticDemoCatalogs, subscribeSyntheticDemoCatalogs } from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { getActiveCatalog, subscribeActiveCatalog } from "@/domain/health-intelligence/active-catalog-runtime";
import { downloadReportBlob } from "@/domain/health-intelligence/report-pdf";
import { notifyInterpretationChanged } from "@/hooks/use-interpretation-snapshot";
import { useServerFn } from "@tanstack/react-start";
import { attestInterpretationDecision } from "@/lib/interpretation-research.functions";
import { InterpretationBacklogPanel, InterpretationEvidencePanel, ResearchCandidatesPanel } from "@/components/interpretation-research-panels";
import { candidateIdFor, candidateKey, identityConcept } from "@/domain/health-intelligence/interpretation-research-candidates";

const DOMAIN_LABELS: Record<InterpretationDomain, string> = {
  bone: "Bone",
  cardiovascular: "Cardiovascular",
  immune: "Immune",
  behavioral: "Behavioral",
};
const ENV_LABELS: Record<InterpretationIdentity["environment"], string> = {
  governed_handbook: "Handbook catalog",
  domain_catalog: "Domain catalog",
  production_catalog: "Production catalog",
  synthetic_demo: "Synthetic demo catalog",
};
const STATUS_LABELS = { approved: "Approved", pending: "Pending scientific review", revoked: "Revoked" } as const;
const PAGE = 25;
type StatusFilter = "open" | "approved" | "revoked" | "awaiting_attestation" | "rejected" | "all";

type ClaimField = "function" | "increaseContext" | "decreaseContext" | "generalContext" | "spaceflightRelevance" | "associatedBiomarkers";
const CLAIM_FIELDS: { field: ClaimField; label: string; hint: string }[] = [
  { field: "function", label: "What the biomarker measures", hint: "Required for approval." },
  { field: "increaseContext", label: "Context documented for a higher value", hint: "Biological context only; not improvement, deterioration or diagnosis." },
  { field: "decreaseContext", label: "Context documented for a lower value", hint: "Biological context only; not improvement, deterioration or diagnosis." },
  { field: "generalContext", label: "General context", hint: "Optional." },
  { field: "spaceflightRelevance", label: "Astronaut / spaceflight relevance", hint: "Only where supported by a cited source." },
  { field: "associatedBiomarkers", label: "Associated biomarkers", hint: "Optional." },
];

/** Catalog identities currently activated on this device (demo snapshots + production catalog). */
function catalogSources(): CatalogIdentitySource[] {
  const out: CatalogIdentitySource[] = [];
  for (const cat of getSyntheticDemoCatalogs().values())
    for (const e of cat.active)
      if ((INTERPRETATION_DOMAINS as readonly string[]).includes(e.domain))
        out.push({
          origin: "synthetic_demo_activation",
          identity: { environment: "synthetic_demo", catalogId: e.demoId, domain: e.domain as InterpretationDomain, unit: e.unit, missionId: e.missionId, displayName: e.displayName },
        });
  for (const e of getActiveCatalog().active)
    if ((INTERPRETATION_DOMAINS as readonly string[]).includes(e.domain))
      out.push({
        origin: "production_catalog_activation",
        identity: { environment: "production_catalog", catalogId: e.canonicalId, domain: e.domain as InterpretationDomain, unit: e.unit, missionId: null, displayName: e.canonicalName },
      });
  return out;
}

function cloneDraft(d: InterpretationDraft): InterpretationDraft {
  return JSON.parse(JSON.stringify(d)) as InterpretationDraft;
}
function initialDraft(r: ResolvedInterpretation | null): InterpretationDraft {
  if (r?.latestDraft) return cloneDraft(r.latestDraft);
  if (r?.status === "approved" && r.content) return cloneDraft({ content: r.content, citations: r.citations, evidenceStrength: r.evidenceStrength });
  return { content: { ...EMPTY_CONTENT, comparabilityRequirements: [], limitations: [] }, citations: [], evidenceStrength: { level: "not_assessed", basis: "" } };
}

/**
 * P40 Researcher workflow: review, edit, cite, approve or revoke biomarker
 * interpretations one entry at a time, independently of catalog activation.
 */
export function BiomarkerInterpretationReview() {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [events, setEvents] = useState<InterpretationEvent[]>([]);
  const [snapshot, setSnapshot] = useState<InterpretationSnapshot>(() => registryInterpretationSnapshot());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [domain, setDomain] = useState<InterpretationDomain | "all">("all");
  const [env, setEnv] = useState<InterpretationIdentity["environment"] | "all">("synthetic_demo");
  const [status, setStatus] = useState<StatusFilter>("open");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = () => void loadMissionIdentity().then((v) => active && setIdentity(v)).catch(() => active && setIdentity(null));
    refresh();
    const unsub = subscribeMissionIdentity(refresh);
    const a = subscribeSyntheticDemoCatalogs(() => setCatalogVersion((v) => v + 1));
    const b = subscribeActiveCatalog(() => setCatalogVersion((v) => v + 1));
    return () => {
      active = false;
      unsub();
      a();
      b();
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const list = await listInterpretationEvents();
      setEvents(list);
      setSnapshot(await buildVerifiedSnapshot(bundledInterpretationRegistry(), list));
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const roles = useMemo(() => (identity?.signedIn && !identity.error ? identity.memberships.map((m) => m.role) : []), [identity]);
  const canReview = canReviewInterpretations(roles);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sources = useMemo(() => catalogSources(), [catalogVersion]);
  const tasks = useMemo(() => deriveInterpretationTasks(snapshot, sources), [snapshot, sources]);

  const freshActor = useCallback(async (): Promise<ActorContext> => {
    const fresh = await loadMissionIdentity();
    if (!fresh.signedIn || fresh.error || !fresh.userId || fresh.userId !== identity?.userId) throw new Error("Sign-in changed. Reload before recording.");
    return { userId: fresh.userId, name: fresh.email ?? null, roles: fresh.memberships.map((m) => m.role), now: new Date().toISOString() };
  }, [identity?.userId]);

  // Automatically open a persistent review task for newly activated identities that have no record yet.
  const opening = useRef(false);
  useEffect(() => {
    if (!canReview || loadState !== "ready" || opening.current || !snapshot.ledger.verified) return;
    const known = new Set(snapshot.records.map((r) => r.key));
    const fresh = sources.filter((s) => !known.has(interpretationKey(s.identity)));
    if (!fresh.length) return;
    opening.current = true;
    void (async () => {
      try {
        const ctx = await freshActor();
        let list = await listInterpretationEvents();
        for (const s of fresh) {
          const plan = planTaskOpened(list, s.identity, s.origin, ctx);
          if (!plan.ok) continue;
          list = [...list, await appendInterpretationEvent(plan.body)];
        }
        await reload();
        setMessage(`Opened ${fresh.length} interpretation review task(s) for newly activated catalog entries. Nothing was approved.`);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Could not open review tasks.");
      } finally {
        opening.current = false;
      }
    })();
  }, [canReview, loadState, snapshot, sources, freshActor, reload]);

  const rows = useMemo(() => {
    const byKey = new Map(snapshot.records.map((r) => [r.key, r]));
    const taskKeys = new Set(tasks.map((t) => t.key));
    const all = [...new Set([...snapshot.records.map((r) => r.key), ...tasks.map((t) => t.key)])].map((key) => {
      const r = byKey.get(key) ?? null;
      const t = tasks.find((x) => x.key === key) ?? null;
      return { key, identity: (r?.identity ?? t?.identity)!, record: r, task: t, status: r?.status ?? "pending", open: taskKeys.has(key) };
    });
    const q = query.trim().toLowerCase();
    return all.filter(
      (x) =>
        (domain === "all" || x.identity.domain === domain) &&
        (env === "all" || x.identity.environment === env) &&
        (status === "all" || (status === "open" ? x.open : status === "awaiting_attestation" || status === "rejected" ? x.record?.lifecycle === status : x.status === status)) &&
        (!q ||
          x.identity.displayName.toLowerCase().includes(q) ||
          x.identity.catalogId.toLowerCase().includes(q) ||
          (x.identity.unit ?? "").toLowerCase() === q ||
          (x.record?.aliases ?? []).some((a) => a.toLowerCase().includes(q))),
    );
  }, [snapshot, tasks, domain, env, status, query]);
  useEffect(() => setPage(0), [domain, env, status, query]);

  const counts = useMemo(() => {
    const demo = snapshot.records.filter((r) => r.identity.environment === "synthetic_demo");
    return {
      open: tasks.length,
      approved: snapshot.records.filter((r) => r.status === "approved").length,
      revoked: snapshot.records.filter((r) => r.status === "revoked").length,
      demo: demo.length,
      demoApproved: demo.filter((r) => r.status === "approved").length,
    };
  }, [snapshot, tasks]);

  const selected = rows.find((r) => r.key === selectedKey) ?? (selectedKey ? { key: selectedKey, identity: snapshot.records.find((r) => r.key === selectedKey)?.identity, record: snapshot.records.find((r) => r.key === selectedKey) ?? null } : null);

  const exportPackage = () => {
    const pkg = buildApprovalPackage(events, new Date().toISOString());
    downloadReportBlob(new Blob([JSON.stringify(pkg, null, 1)], { type: "application/json" }), `MITOCHONDRIA_interpretation_approvals_${pkg.ledgerHead.slice(0, 12)}.json`);
    setMessage(`Approval package downloaded (${pkg.events.length} event(s)). It enters the shared registry only through an owner-reviewed merge.`);
  };

  return (
    <section aria-label="Biomarker interpretation review" className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-12">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">Biomarker interpretation review</h2>
        <p className="text-sm text-muted-foreground">
          Every catalog biomarker needs a cited interpretation record before reports explain it biologically. Approval is
          per entry, separate from catalog activation, and never automatic. Until approved, reports show “{PENDING_INTERPRETATION_TEXT}”.
        </p>
        <p className="text-xs text-muted-foreground">
          Registry v{snapshot.registryVersion} · {snapshot.ledger.events} device review event(s){snapshot.digest ? ` · snapshot ${snapshot.digest.slice(0, 16)}…` : ""}
          {snapshot.ledger.note ? ` · ${snapshot.ledger.note}` : ""}
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-5" role="status">
        {[
          ["Open review tasks", counts.open],
          ["Approved", counts.approved],
          ["Revoked", counts.revoked],
          ["Synthetic demo identities", counts.demo],
          ["Synthetic demo approved", counts.demoApproved],
        ].map(([label, n]) => (
          <div key={label} className="rounded-md border border-border p-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tabular-nums">{n}</p>
          </div>
        ))}
      </div>

      {!identity?.signedIn ? (
        <p className="text-sm text-muted-foreground">Sign in to review interpretations. Reading is available offline once signed in.</p>
      ) : !canReview ? (
        <p className="text-sm text-muted-foreground">View only: editing, approval and revocation require the Researcher role.</p>
      ) : null}
      {loadState === "error" && <p className="text-sm text-muted-foreground">The device review history could not be read; only the shared registry is shown.</p>}

      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Domain</span>
          <select className="rounded border bg-background p-2" value={domain} onChange={(e) => setDomain(e.target.value as InterpretationDomain | "all")}>
            <option value="all">All domains</option>
            {INTERPRETATION_DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Catalog</span>
          <select className="rounded border bg-background p-2" value={env} onChange={(e) => setEnv(e.target.value as InterpretationIdentity["environment"] | "all")}>
            <option value="all">All catalogs</option>
            {(Object.keys(ENV_LABELS) as InterpretationIdentity["environment"][]).map((k) => <option key={k} value={k}>{ENV_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Status</span>
          <select className="rounded border bg-background p-2" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="open">Open review tasks</option>
            <option value="approved">Approved</option>
            <option value="revoked">Revoked</option>
            <option value="awaiting_attestation">Awaiting server attestation</option>
            <option value="rejected">Draft rejected</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="min-w-48 flex-1 space-y-1">
          <span className="block text-xs text-muted-foreground">Search name, alias, catalog ID or exact unit</span>
          <input className="w-full rounded border bg-background p-2" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <Button type="button" variant="outline" disabled={!events.length} onClick={exportPackage}>
          Download approval package
        </Button>
      </div>
      {message && <p className="text-sm" role="status" aria-live="polite">{message}</p>}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2">Biomarker</th>
              <th className="p-2">Catalog ID</th>
              <th className="p-2">Unit</th>
              <th className="p-2">Domain</th>
              <th className="p-2">Catalog</th>
              <th className="p-2">Status</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(page * PAGE, page * PAGE + PAGE).map((x) => (
              <tr key={x.key} className={`border-t align-top ${x.key === selectedKey ? "bg-muted/40" : ""}`}>
                <td className="p-2 font-medium">{x.identity.displayName}</td>
                <td className="p-2 font-mono">{x.identity.catalogId}</td>
                <td className="p-2">{x.identity.unit ?? <span className="text-muted-foreground">not unit-bound{x.record?.sourceUnitText ? ` (source: ${x.record.sourceUnitText})` : ""}</span>}</td>
                <td className="p-2">{DOMAIN_LABELS[x.identity.domain]}</td>
                <td className="p-2">{ENV_LABELS[x.identity.environment]}</td>
                <td className="p-2">
                  {x.record ? LIFECYCLE_LABELS[x.record.lifecycle] : STATUS_LABELS[x.status]}
                  {x.record?.latestDraft && x.record.lifecycle !== "draft" ? " · draft saved" : ""}
                  {x.record?.pendingContent ? " · handbook text" : ""}
                  {x.record?.proposedLinks.length ? ` · proposed link ${x.record.proposedLinks.map((p) => p.catalogId).join(", ")}` : ""}
                </td>
                <td className="p-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSelectedKey(x.key)}>
                    Open
                  </Button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="p-3 text-muted-foreground">No interpretation records match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > PAGE && (
        <div className="flex items-center gap-2 text-xs">
          <Button type="button" size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {page + 1} of {Math.ceil(rows.length / PAGE)} · {rows.length} record(s)</span>
          <Button type="button" size="sm" variant="outline" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {selected?.identity && (
        <InterpretationEditor
          key={selected.key + ":" + snapshot.ledger.head}
          identity={selected.identity}
          record={selected.record ?? null}
          snapshot={snapshot}
          canReview={canReview}
          userId={identity?.userId ?? null}
          freshActor={freshActor}
          onRecorded={async (text) => {
            await reload();
            notifyInterpretationChanged();
            setMessage(text);
          }}
          onClose={() => setSelectedKey(null)}
        />
      )}

      <InterpretationBacklogPanel snapshot={snapshot} canReview={canReview} userId={identity?.userId ?? null} />
      <ResearchCandidatesPanel snapshot={snapshot} canReview={canReview} userId={identity?.userId ?? null} onOpenKey={(k) => setSelectedKey(k)} />
    </section>
  );
}

function InterpretationEditor(props: {
  identity: InterpretationIdentity;
  record: ResolvedInterpretation | null;
  snapshot: InterpretationSnapshot;
  canReview: boolean;
  userId: string | null;
  freshActor: () => Promise<ActorContext>;
  onRecorded: (message: string) => Promise<void>;
  onClose: () => void;
}) {
  const { record, snapshot } = props;
  const [unit, setUnit] = useState(props.identity.unit ?? "");
  const [draft, setDraft] = useState<InterpretationDraft>(() => initialDraft(record));
  const [ack, setAck] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [newCite, setNewCite] = useState<{ kind: CitationKind; title: string; locator: string; url: string }>({ kind: "peer_reviewed", title: "", locator: "", url: "" });

  const target: InterpretationIdentity = { ...props.identity, unit: props.identity.unit ?? (unit.trim() || null) };
  const targetRecord = snapshot.records.find((r) => r.key === interpretationKey(target)) ?? record;
  const problem = approvalProblem(target, draft);
  const ackText = requiredAcknowledgement(target);
  const handbookSource = useMemo(() => {
    if (record?.pendingContent) return record;
    for (const link of record?.proposedLinks ?? []) {
      const linked = snapshot.records.find((r) => r.identity.catalogId === link.catalogId && r.identity.unit === null && r.pendingContent);
      if (linked) return linked;
    }
    return null;
  }, [record, snapshot]);

  const setClaim = (field: ClaimField, patch: Partial<Claim> | null) =>
    setDraft((d) => {
      const cur = d.content[field] ?? { text: "", citationIds: [] };
      const next = patch === null ? null : { ...cur, ...patch };
      return { ...d, content: { ...d.content, [field]: next && !next.text && !next.citationIds.length ? null : next } };
    });
  const toggleCite = (field: ClaimField, id: string) => {
    const cur = draft.content[field]?.citationIds ?? [];
    setClaim(field, { citationIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };
  const comparabilityText = draft.content.comparabilityRequirements.map((c) => c.text).join("\n");
  const comparabilityCites = draft.content.comparabilityRequirements[0]?.citationIds ?? [];
  const setComparability = (text: string, cites = comparabilityCites) =>
    setDraft((d) => ({
      ...d,
      content: {
        ...d.content,
        comparabilityRequirements: text.split("\n").map((t) => t.trim()).filter(Boolean).map((t) => ({ text: t, citationIds: [...cites] })),
      },
    }));

  const addCitation = () => {
    if (newCite.title.trim().length < 3 || newCite.locator.trim().length < 3) {
      setNote("A citation needs a title and a locator (page, section, DOI or item ID).");
      return;
    }
    const id = `c${draft.citations.length + 1}-${Date.now().toString(36)}`;
    setDraft((d) => ({ ...d, citations: [...d.citations, { id, kind: newCite.kind, title: newCite.title.trim(), locator: newCite.locator.trim(), url: newCite.url.trim() || null }] }));
    setNewCite({ kind: "peer_reviewed", title: "", locator: "", url: "" });
    setNote("");
  };
  const removeCitation = (id: string) =>
    setDraft((d) => {
      const strip = (c: Claim | null) => (c ? { ...c, citationIds: c.citationIds.filter((x) => x !== id) } : null);
      const content: InterpretationContent = {
        ...d.content,
        function: strip(d.content.function),
        increaseContext: strip(d.content.increaseContext),
        decreaseContext: strip(d.content.decreaseContext),
        generalContext: strip(d.content.generalContext),
        spaceflightRelevance: strip(d.content.spaceflightRelevance),
        associatedBiomarkers: strip(d.content.associatedBiomarkers),
        comparabilityRequirements: d.content.comparabilityRequirements.map((c) => ({ ...c, citationIds: c.citationIds.filter((x) => x !== id) })),
      };
      return { ...d, citations: d.citations.filter((c) => c.id !== id), content };
    });

  const attestFn = useServerFn(attestInterpretationDecision);
  /** Ask the server to re-check and sign one APPROVE/REVOKE event; store the attestation only after local signature verification. */
  const attest = async (eventHash: string): Promise<string | null> => {
    const ctx = await props.freshActor();
    const list = await listInterpretationEvents();
    const event = list.find((e) => e.hash === eventHash);
    if (!event) return "The decision is not in this device's review history.";
    const r = await attestFn({ data: { event: event as unknown as Record<string, unknown> } }).catch(() => null);
    if (!r) return "The attestation service could not be reached.";
    if (!r.ok) return r.message;
    const plan = await planAttestation(list, r.attestation, ctx);
    if (!plan.ok) return plan.reason;
    await appendInterpretationEvent(plan.body);
    return null;
  };

  const run = async (kind: "draft" | "approve" | "revoke" | "reject" | "attest") => {
    if (busy) return;
    setBusy(true);
    setNote("");
    try {
      if (kind === "attest") {
        const hash = targetRecord?.awaitingAttestation?.eventHash;
        const problem = hash ? await attest(hash) : "No decision is awaiting attestation.";
        if (problem) setNote(`Not applied: ${problem}`);
        else await props.onRecorded(`Server attestation stored for ${target.displayName}; the decision now applies on this device.`);
        return;
      }
      if (!target.unit && kind !== "revoke" && kind !== "reject") throw new Error("Set the exact unit this interpretation applies to.");
      const ctx = await props.freshActor();
      const list = await listInterpretationEvents();
      const plan =
        kind === "draft"
          ? planDraft(list, target, draft, ctx)
          : kind === "approve"
            ? await planApproval(list, target, draft, ack ? ackText : "", ctx)
            : kind === "reject"
              ? planRejectDraft(list, target, rejectReason, ctx)
              : planRevocation(list, targetRecord, reason, ctx);
      if (!plan.ok) {
        setNote(plan.reason);
        return;
      }
      const sealed = await appendInterpretationEvent(plan.body);
      let attestProblem: string | null = null;
      if (kind === "approve" || kind === "revoke") attestProblem = await attest(sealed.hash);
      const label = target.environment === "synthetic_demo" ? "SYNTHETIC DEMO interpretation" : "Interpretation";
      await props.onRecorded(
        kind === "draft"
          ? `Draft saved for ${target.displayName} (${target.unit}). Not approved.`
          : kind === "reject"
            ? `Draft rejected for ${target.displayName}. Nothing was approved; the rejection is kept in the history.`
            : attestProblem
              ? `${kind === "approve" ? "Approval" : "Revocation"} recorded on this device but NOT applied: ${attestProblem} Reports keep the previous status. Retry with “Request server attestation”.`
              : kind === "approve"
                ? `${label} approved and server-attested for ${target.displayName} (${target.unit}). Stored on this device; download the approval package to add it to the shared registry.`
                : `Interpretation revoked (server-attested) for ${target.displayName}. Reports now show it as pending scientific review.`,
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Nothing was recorded.");
    } finally {
      setBusy(false);
    }
  };
  const [rejectReason, setRejectReason] = useState("");

  const disabled = !props.canReview || busy;
  return (
    <article aria-label={`Interpretation editor for ${props.identity.displayName}`} className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{props.identity.displayName}</h3>
          <p className="text-xs text-muted-foreground">
            {props.identity.catalogId} · {DOMAIN_LABELS[props.identity.domain]} · {ENV_LABELS[props.identity.environment]}
            {props.identity.missionId ? ` · mission ${props.identity.missionId}` : ""}
            {record?.activation ? ` · activated ${record.activation.activatedAt} (activation history unchanged)` : ""}
          </p>
          {props.identity.environment === "synthetic_demo" && <p className="text-xs font-semibold">{SYNTHETIC_DEMO_INTERPRETATION_LABEL}</p>}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={props.onClose}>Close</Button>
      </div>

      <p className="text-sm">
        Status: <strong>{targetRecord ? LIFECYCLE_LABELS[targetRecord.lifecycle] : STATUS_LABELS.pending}</strong>
        {targetRecord?.reviewer ? ` · ${targetRecord.reviewer.name ?? targetRecord.reviewer.userId} · ${targetRecord.decidedAt}` : ""}
        {targetRecord?.basis === "device_local" ? " · device-local (not yet in the shared registry)" : targetRecord?.basis === "registry" ? " · shared registry" : ""}
      </p>

      <label className="block space-y-1 text-sm">
        <span>Exact unit this interpretation applies to</span>
        <input
          className="w-full rounded border bg-background p-2"
          value={props.identity.unit ?? unit}
          disabled={props.identity.unit !== null || disabled}
          onChange={(e) => setUnit(e.target.value)}
          placeholder={record?.sourceUnitText ? `Source text: ${record.sourceUnitText}` : "e.g. ng/mL"}
        />
        <span className="block text-xs text-muted-foreground">Exact text, never converted. Other units keep their own records.</span>
      </label>

      {handbookSource && (
        <div className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
          <p className="font-medium">
            Handbook text available ({handbookSource.identity.catalogId}, pending hypothesis{handbookSource.key !== record?.key ? ", via proposed link — identity equivalence not reviewed" : ""})
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => handbookSource.pendingContent && setDraft({ content: cloneDraft({ content: handbookSource.pendingContent, citations: [], evidenceStrength: handbookSource.evidenceStrength }).content, citations: [...handbookSource.citations], evidenceStrength: { ...handbookSource.evidenceStrength } })}
          >
            Start draft from handbook text
          </Button>
        </div>
      )}

      <fieldset className="space-y-2 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Citations</legend>
        {draft.citations.length ? (
          <ul className="space-y-1 text-xs">
            {citationLines(draft.citations).map((line, i) => (
              <li key={draft.citations[i]!.id} className="flex items-start justify-between gap-2">
                <span className="break-words">{line}</span>
                <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => removeCitation(draft.citations[i]!.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted-foreground">No citations yet. Every claim needs at least one.</p>}
        <div className="grid gap-2 sm:grid-cols-4">
          <select className="rounded border bg-background p-2 text-sm" value={newCite.kind} disabled={disabled} onChange={(e) => setNewCite((c) => ({ ...c, kind: e.target.value as CitationKind }))}>
            <option value="peer_reviewed">Peer-reviewed</option>
            <option value="agency_document">Agency document</option>
            <option value="governed_handbook">Governed handbook</option>
            <option value="other">Other</option>
          </select>
          <input className="rounded border bg-background p-2 text-sm" placeholder="Title" value={newCite.title} disabled={disabled} onChange={(e) => setNewCite((c) => ({ ...c, title: e.target.value }))} />
          <input className="rounded border bg-background p-2 text-sm" placeholder="Locator (page, section, DOI)" value={newCite.locator} disabled={disabled} onChange={(e) => setNewCite((c) => ({ ...c, locator: e.target.value }))} />
          <input className="rounded border bg-background p-2 text-sm" placeholder="URL (optional)" value={newCite.url} disabled={disabled} onChange={(e) => setNewCite((c) => ({ ...c, url: e.target.value }))} />
        </div>
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={addCitation}>Add citation</Button>
      </fieldset>

      {CLAIM_FIELDS.map(({ field, label, hint }) => (
        <ClaimEditor
          key={field}
          label={label}
          hint={hint}
          claim={draft.content[field]}
          citations={draft.citations}
          disabled={disabled}
          onText={(text) => setClaim(field, { text })}
          onToggle={(id) => toggleCite(field, id)}
        />
      ))}
      <ClaimEditor
        label="Measurement comparability requirements (one per line)"
        hint="e.g. same assay, specimen, timing and laboratory."
        claim={comparabilityText ? { text: comparabilityText, citationIds: comparabilityCites } : null}
        citations={draft.citations}
        disabled={disabled}
        multiline
        onText={(text) => setComparability(text)}
        onToggle={(id) => setComparability(comparabilityText, comparabilityCites.includes(id) ? comparabilityCites.filter((x) => x !== id) : [...comparabilityCites, id])}
      />
      <label className="block space-y-1 text-sm">
        <span>Limitations of this interpretation (one per line)</span>
        <textarea
          className="w-full rounded border bg-background p-2 text-sm"
          rows={2}
          disabled={disabled}
          value={draft.content.limitations.join("\n")}
          onChange={(e) => setDraft((d) => ({ ...d, content: { ...d.content, limitations: e.target.value.split("\n").filter((l) => l.trim()) } }))}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <label className="space-y-1 text-sm">
          <span className="block">Evidence strength</span>
          <select className="w-full rounded border bg-background p-2" disabled={disabled} value={draft.evidenceStrength.level} onChange={(e) => setDraft((d) => ({ ...d, evidenceStrength: { ...d.evidenceStrength, level: e.target.value as EvidenceLevel } }))}>
            {(Object.keys(EVIDENCE_LEVEL_LABELS) as EvidenceLevel[]).map((l) => <option key={l} value={l}>{EVIDENCE_LEVEL_LABELS[l]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="block">Basis for the evidence strength</span>
          <input className="w-full rounded border bg-background p-2" disabled={disabled} value={draft.evidenceStrength.basis} onChange={(e) => setDraft((d) => ({ ...d, evidenceStrength: { ...d.evidenceStrength, basis: e.target.value } }))} />
        </label>
      </div>

      <p className="text-xs text-muted-foreground" role="status">{problem ? `Not ready for approval: ${problem}` : "Ready for approval."}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={() => void run("draft")}>Save draft</Button>
      </div>
      {targetRecord?.latestDraft && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-1 text-sm">
            <span className="block">Reject the saved draft — reason (at least 10 characters)</span>
            <input className="w-full rounded border bg-background p-2" disabled={disabled} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          </label>
          <Button type="button" variant="outline" disabled={disabled || rejectReason.trim().length < 10} onClick={() => void run("reject")}>Reject draft</Button>
        </div>
      )}
      {targetRecord?.rejection && <p className="text-xs text-muted-foreground">Draft rejected {targetRecord.rejection.at}: {targetRecord.rejection.reason}</p>}
      {targetRecord?.awaitingAttestation && (
        <div className="space-y-1 rounded-md border border-border p-2 text-sm" role="status">
          <p>
            A decision recorded {targetRecord.awaitingAttestation.recordedAt} is awaiting server attestation and is <strong>not applied</strong>. The server re-checks your active Researcher role and the exact content before signing.
          </p>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => void run("attest")}>Request server attestation</Button>
        </div>
      )}
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={ack} disabled={disabled} onChange={(e) => setAck(e.target.checked)} />
        <span>{ackText}</span>
      </label>
      <Button type="button" disabled={disabled || !ack || Boolean(problem)} onClick={() => void run("approve")}>
        Approve this interpretation
      </Button>

      {targetRecord?.status === "approved" && (
        <div className="space-y-1 border-t border-border pt-3">
          <label className="block space-y-1 text-sm">
            <span>Revocation reason (at least 10 characters)</span>
            <input className="w-full rounded border bg-background p-2" disabled={disabled} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button type="button" variant="outline" disabled={disabled || reason.trim().length < 10} onClick={() => void run("revoke")}>Revoke interpretation</Button>
        </div>
      )}
      {note && <p className="text-sm" role="alert">{note}</p>}

      <InterpretationEvidencePanel
        researchKey={interpretationKey(target)}
        relatedKeys={target.unit ? [candidateKey(candidateIdFor(target.displayName, target.unit)), ...(record?.aliases ?? []).map((a) => candidateKey(candidateIdFor(a, target.unit!)))] : []}
        concept={identityConcept(target, record?.aliases ?? [])}
        canReview={props.canReview}
        userId={props.userId}
        onUseDraft={(d) => {
          setDraft(d);
          setAck(false);
          setNote("Excerpt-verified claims loaded into the editor (unsaved). Check every statement against its source, set the evidence strength, then save or approve. Unresolved claims were not loaded.");
        }}
      />

      {(targetRecord?.approvalHistory.length ?? 0) > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer">Approval history (append-only)</summary>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {targetRecord!.approvalHistory.map((h) => (
              <li key={h.eventId} className="break-words">
                {h.decidedAt} · {h.action === "APPROVE" ? "Approved" : "Revoked"} by {h.reviewer.name ?? h.reviewer.userId} · {h.basis === "registry" ? "shared registry" : "device-local"}
                {h.reason ? ` · ${h.reason}` : ""} · content {h.contentSha256?.slice(0, 12) ?? "n/a"}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}

function ClaimEditor(props: {
  label: string;
  hint: string;
  claim: Claim | null;
  citations: readonly Citation[];
  disabled: boolean;
  multiline?: boolean;
  onText: (text: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="block space-y-1 text-sm">
        <span>{props.label}</span>
        <textarea className="w-full rounded border bg-background p-2 text-sm" rows={props.multiline ? 3 : 2} disabled={props.disabled} value={props.claim?.text ?? ""} onChange={(e) => props.onText(e.target.value)} />
        <span className="block text-xs text-muted-foreground">{props.hint}</span>
      </label>
      {props.citations.length > 0 && (props.claim?.text ?? "") !== "" && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-muted-foreground">Cited by:</span>
          {props.citations.map((c, i) => (
            <label key={c.id} className="inline-flex items-center gap-1">
              <input type="checkbox" disabled={props.disabled} checked={props.claim?.citationIds.includes(c.id) ?? false} onChange={() => props.onToggle(c.id)} />[{i + 1}]
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
