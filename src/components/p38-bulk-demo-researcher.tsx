/**
 * P38 Researcher bulk SYNTHETIC DEMO decisions on Scientific Review. Preflight of
 * every submitted term of the mission (all pages), editable proposed names and
 * domains, Select All Eligible / Select Page / Deselect All, bulk preview with
 * exclusions, then bounded transactional server batches: (1) ACCEPT_FOR_REVIEW
 * triage for selected terms that still need it, (2) one acknowledgement and one
 * "Record Bulk SYNTHETIC DEMO Decisions" action. Decisions never activate
 * anything; Ground Medical activates separately.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, FlaskConical, ListChecks, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listGlobalReviewSubmissions, listGlobalTriage } from "@/lib/p36-global-review.functions";
import { latestTriageByTerm, type TriageEvent } from "@/lib/p36-global-triage-rules";
import { BulkResearcherSection } from "@/components/p38-bulk-researcher-section";
import { getSyntheticDemoLifecycle } from "@/lib/p37-synthetic-demo.functions";
import type { DemoLifecycleRow, DemoScopeTerm } from "@/lib/p37-synthetic-demo.server";
import { bulkDemoDecideFn, bulkTriageAcceptFn } from "@/lib/p38-bulk-demo.functions";
import type { GlobalReviewSubmission } from "@/lib/p36-global-review.server";
import {
  PREFLIGHT_CATEGORIES,
  PREFLIGHT_CATEGORY_LABEL,
  buildBulkDemoPreflight,
  awaitsSectionAcceptance,
  catalogExistingMatch,
  needsDomainChoice,
  preflightCounts,
  termKey,
  type PreflightCategory,
  type PreflightOverride,
  type PreflightRow,
} from "@/domain/health-intelligence/p38-bulk-demo-preflight";
import {
  runBulkBatches,
  summarizeBulk,
  type BulkItemResult,
  type BulkProgress,
} from "@/domain/health-intelligence/p38-bulk-demo-batches";
import {
  SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  SYNTHETIC_DEMO_LABEL,
} from "@/domain/health-intelligence/synthetic-demo-catalog";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import {
  evidenceRegistryDocuments,
  extractGridSourceEvidence,
  extractTextSourceEvidence,
  sectionCoverage,
  type SourceDocumentEvidence,
} from "@/domain/health-intelligence/source-section-classification";
import { csvCells } from "@/domain/health-intelligence/universal-intake-parser";
import {
  bulkResearcherVisibility,
  bulkSelectionCounts,
  isDecidable,
  retrySelection,
} from "@/domain/health-intelligence/p38-bulk-demo-selection";
import { xlsxCells } from "@/domain/health-intelligence/universal-intake-adapters";
import sourceSectionRegistry from "../../data/source-evidence/mito-demo-2026-source-sections.v1.json";

/** Committed, SHA-256-bound section evidence of owner-supplied source documents (fails closed). */
const REGISTRY_DOCS = evidenceRegistryDocuments(sourceSectionRegistry);
async function fileSha256(file: File): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
const DOMAIN_WORD: Record<HealthDomainId, string> = {
  bone: "Bone",
  immune: "Immune",
  cardiovascular: "Cardiovascular",
  behavioral: "Behavioral",
};

const PAGE = 25;
const DOMAINS: [HealthDomainId, string][] = [
  ["bone", "Bone"],
  ["immune", "Immune"],
  ["cardiovascular", "Cardiovascular"],
  ["behavioral", "Behavioral"],
];
type Loaded = {
  subs: GlobalReviewSubmission[];
  triage: Map<string, TriageEvent>;
  canTriage: boolean;
  canDecide: boolean;
  scope: Map<string, DemoScopeTerm>;
  events: DemoLifecycleRow[];
};
type Run = {
  kind: "triage" | "decide";
  progress: BulkProgress;
  results: BulkItemResult[];
  failure: string | null;
  retry: (() => Promise<void>) | null;
};

/** Ready for a decision request now (selection eligibility; shared pure rule). */
const decidable = (r: PreflightRow, scope: Map<string, DemoScopeTerm>) => isDecidable(r, scope);

const LOADING_NOTE = "Reading every submitted term of this mission…";

export function P38BulkDemoResearcher({ missionId }: { missionId: string }) {
  const listSubs = useServerFn(listGlobalReviewSubmissions);
  const listTriage = useServerFn(listGlobalTriage);
  const lifecycle = useServerFn(getSyntheticDemoLifecycle);
  const triageFn = useServerFn(bulkTriageAcceptFn);
  const decideFn = useServerFn(bulkDemoDecideFn);
  const [data, setData] = useState<Loaded | null>(null);
  const [note, setNote] = useState(LOADING_NOTE);
  const [overrides, setOverrides] = useState<Map<string, PreflightOverride>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<
    PreflightCategory | "all" | "needs_domain" | "awaiting_section"
  >("all");
  const [extraDocs, setExtraDocs] = useState<SourceDocumentEvidence[]>([]);
  const [acceptedSection, setAcceptedSection] = useState<Set<string>>(new Set());
  const [docNote, setDocNote] = useState("");
  const [domainFilter, setDomainFilter] = useState<HealthDomainId | "all" | "none">("all");
  const [page, setPage] = useState(0);
  const [bulkDomain, setBulkDomain] = useState<HealthDomainId>("bone");
  const [ack, setAck] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, t, l] = await Promise.all([
      listSubs({ data: { missionId, provenance: "synthetic" } }).catch(() => null),
      listTriage({ data: { missionId, provenance: "synthetic" } }).catch(() => null),
      lifecycle({ data: { missionId } }).catch(() => null),
    ]);
    if (!s?.ok || !t?.ok || !l?.ok) {
      setData(null);
      setNote(
        (!l?.ok && l?.message) ||
          (!s?.ok && s?.message) ||
          "Submitted terms are unavailable for this account. Nothing was changed.",
      );
      return;
    }
    setData({
      subs: s.submissions,
      triage: latestTriageByTerm(t.events),
      canTriage: t.canTriage,
      canDecide: l.canDecide,
      scope: new Map(l.terms.map((x) => [termKey(x.submissionId, x.termId), x])),
      events: l.events,
    });
  }, [missionId, listSubs, listTriage, lifecycle]);
  useEffect(() => {
    void load();
  }, [load]);

  const existingMatch = useMemo(() => catalogExistingMatch(missionId), [missionId]);
  const rows = useMemo(() => {
    if (!data) return [];
    const terms = data.subs.flatMap((s) =>
      s.terms.map((t) => ({
        submissionId: s.submissionId,
        termId: t.termId,
        receivedSeq: s.receivedSeq,
        originalLabels: t.originalLabels,
        exactUnit: t.exactUnit,
        classification: t.classification,
        candidateMetricIds: t.candidateMetricIds,
        sourceDocumentSha256: t.sourceDocumentSha256,
      })),
    );
    return buildBulkDemoPreflight(terms, {
      triage: new Map([...data.triage].map(([k, e]) => [k, e.action])),
      scope: new Set(data.scope.keys()),
      events: data.events,
      overrides,
      existingMatch,
      sourceDocuments: [...REGISTRY_DOCS, ...extraDocs],
      acceptedSectionProposals: acceptedSection,
    });
  }, [data, overrides, existingMatch, extraDocs, acceptedSection]);
  const counts = preflightCounts(rows);
  const domainChoice = rows.filter(needsDomainChoice).length;
  const awaiting = rows.filter(awaitsSectionAcceptance);
  const acceptedRows = rows.filter((r) => r.sectionAccepted);
  const proposalDomains = (list: PreflightRow[]) =>
    DOMAINS.map(([d, l]) => [l, list.filter((r) => r.domain === d).length] as const).filter(
      ([, n]) => n > 0,
    );
  const citedDocs = useMemo(
    () =>
      new Set(
        (data?.subs ?? []).flatMap((s) => s.terms.flatMap((t) => t.sourceDocumentSha256 ?? [])),
      ),
    [data],
  );
  const docs = [...REGISTRY_DOCS, ...extraDocs].filter((d) => citedDocs.has(d.sha256));
  const loadSourceDocument = async (file: File) => {
    setDocNote(`Reading ${file.name} on this device…`);
    try {
      const sha = await fileSha256(file);
      if (!citedDocs.has(sha)) {
        setDocNote(
          `No submitted term of this mission cites ${file.name} (SHA-256 ${sha.slice(0, 12)}…). Nothing was proposed.`,
        );
        return;
      }
      if ([...REGISTRY_DOCS, ...extraDocs].some((d) => d.sha256 === sha)) {
        setDocNote(`${file.name} is already loaded; its proposals are shown below.`);
        return;
      }
      let evidence: SourceDocumentEvidence;
      if (/\.csv$/i.test(file.name))
        evidence = extractGridSourceEvidence(csvCells(await file.text()), {
          sha256: sha,
          fileName: file.name,
          kind: "csv",
        });
      else if (/\.xlsx$/i.test(file.name))
        evidence = extractGridSourceEvidence(xlsxCells(new Uint8Array(await file.arrayBuffer())), {
          sha256: sha,
          fileName: file.name,
          kind: "xlsx",
        });
      else if (/\.pdf$/i.test(file.name)) {
        const { extractBoneDocument } = await import("@/domain/bone-health/document-extraction");
        const doc = await extractBoneDocument(file);
        evidence = extractTextSourceEvidence(
          doc.text,
          { sha256: sha, fileName: file.name, kind: "pdf", pages: doc.pages },
          doc.linePages,
        );
      } else
        evidence = extractTextSourceEvidence(await file.text(), {
          sha256: sha,
          fileName: file.name,
          kind: "text",
        });
      setExtraDocs((d) => [...d, evidence]);
      setDocNote(
        `${file.name}: ${evidence.rows.length} rows under ${evidence.headings.filter((h) => h.domain).length} recognized medical sections. Read on this device only; nothing was uploaded or recorded.`,
      );
    } catch (e) {
      setDocNote(
        `${file.name} could not be read (${e instanceof Error ? e.message : "unknown error"}). Nothing was proposed.`,
      );
    }
  };

  const filtered = rows.filter((r) => {
    if (
      category === "needs_domain"
        ? !needsDomainChoice(r)
        : category === "awaiting_section"
          ? !awaitsSectionAcceptance(r)
          : category !== "all" && r.category !== category
    )
      return false;
    if (
      domainFilter === "none"
        ? r.domain !== null
        : domainFilter !== "all" && r.domain !== domainFilter
    )
      return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      r.termId.includes(q) ||
      r.labels.some((l) => l.toLowerCase().includes(q)) ||
      r.displayName.toLowerCase().includes(q) ||
      r.unit.toLowerCase().includes(q)
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(() => setPage(0), [query, category, domainFilter]);

  const scope = data?.scope ?? new Map<string, DemoScopeTerm>();
  const selectedRows = rows.filter((r) => selected.has(r.key));
  const ready = selectedRows.filter((r) => decidable(r, scope));
  const needTriage = ready.filter((r) => r.triageAction !== "ACCEPT_FOR_REVIEW");
  const toDecide = ready.filter((r) => r.triageAction === "ACCEPT_FOR_REVIEW");
  const excludedSelected = selectedRows.filter((r) => !decidable(r, scope));
  const allEligible = rows.filter((r) => decidable(r, scope));

  const setOverride = (key: string, patch: PreflightOverride) =>
    setOverrides((m) => new Map(m).set(key, { ...m.get(key), ...patch }));
  const toggle = (key: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(key);
      else n.delete(key);
      return n;
    });

  const triageEventOf = (r: PreflightRow) => data?.triage.get(r.key)?.eventId ?? null;
  const startTriage = async (items: PreflightRow[]) => {
    setBusy(true);
    const send = (batch: PreflightRow[]) =>
      triageFn({
        data: {
          missionId,
          items: batch.map((r) => ({
            submissionId: r.submissionId,
            termId: r.termId,
            expectedPreviousEventId: triageEventOf(r),
          })),
        },
      });
    const res = await runBulkBatches(items, send, (progress) =>
      setRun({ kind: "triage", progress, results: [], failure: null, retry: null }),
    );
    setRun({
      kind: "triage",
      progress: res.progress,
      results: res.results,
      failure: res.failure,
      retry: res.remaining.length ? () => startTriage(res.remaining) : null,
    });
    await load();
    setBusy(false);
  };
  const startDecide = async (items: PreflightRow[]) => {
    setBusy(true);
    const send = (batch: PreflightRow[]) =>
      decideFn({
        data: {
          missionId,
          acknowledgement: SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
          items: batch.map((r) => ({
            submissionId: r.submissionId,
            termId: r.termId,
            displayName: r.displayName,
            domain: r.domain!,
          })),
        },
      });
    const res = await runBulkBatches(items, send, (progress) =>
      setRun({ kind: "decide", progress, results: [], failure: null, retry: null }),
    );
    setRun({
      kind: "decide",
      progress: res.progress,
      results: res.results,
      failure: res.failure,
      retry: res.remaining.length ? () => startDecide(res.remaining) : null,
    });
    setAck(false);
    await load();
    setBusy(false);
  };

  const summary = run ? summarizeBulk(run.results) : null;
  const workflow = bulkSelectionCounts(rows, scope);
  const retry = run ? retrySelection(run.results, rows, scope) : { keys: [], notRetryable: 0 };
  const visibility = bulkResearcherVisibility({
    authorizedMissions: 1,
    missionSelected: true,
    lifecycle: data
      ? { canDecide: data.canDecide, demoScopeTerms: data.scope.size }
      : note === LOADING_NOTE
        ? "loading"
        : "unavailable",
  });
  return (
    <BulkResearcherSection visibility={visibility}>
      {visibility === "unavailable" ? (
        <p className="text-xs text-muted-foreground">{note}</p>
      ) : null}
      {!data || visibility !== "visible" ? null : (
      <div
        aria-labelledby="p38-r-title"
        className="space-y-3 rounded-lg border-2 border-dashed border-border p-4"
        data-testid="p38-bulk-researcher"
      >
      <div className="space-y-1">
        <h4 id="p38-r-title" className="font-semibold">
          Preflight, selection and bulk decisions
        </h4>
        <p className="text-sm text-muted-foreground">
          {SYNTHETIC_DEMO_LABEL}. Names and domains are proposed only from existing catalog
          references; specimen, method, reference intervals and source validation are never
          proposed. Decisions do not activate anything: Ground Medical activates separately.
        </p>
      </div>
        <>
          <div data-testid="p38-preflight-counts" className="space-y-1">
            <p className="text-sm font-medium">
              Preflight of {counts.total} submitted terms (before any write)
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="default">Eligible {counts.eligible}</Badge>
              <Badge variant="secondary" data-testid="p54-awaiting-triage">
                Eligible · awaiting review acceptance (triage) {workflow.awaitingTriage}
              </Badge>
              <Badge variant="secondary">Eligible · ready for decision {workflow.readyForDecision}</Badge>
              <Badge variant="secondary">
                Domain proposed from source section · awaiting acceptance {awaiting.length}
              </Badge>
              <Badge variant="secondary">Eligible after a domain choice {domainChoice}</Badge>
              <Badge variant="secondary">Already active {counts.already_active}</Badge>
              <Badge variant="secondary">
                Decided · awaiting Ground Medical {counts.already_decided}
              </Badge>
              <Badge variant="outline">Duplicate {counts.duplicate}</Badge>
              <Badge variant="outline">
                Existing catalog match {counts.existing_catalog_match}
              </Badge>
              <Badge variant="outline">Ambiguous or missing unit {counts.ambiguous_unit}</Badge>
              <Badge variant="outline">Conflicting identity {counts.conflicting_identity}</Badge>
              <Badge variant="outline">
                Other blocked {counts.blocked - domainChoice - awaiting.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              In the owner-authorized demo scope: {[...scope.keys()].length} terms ·{" "}
              {data.canDecide
                ? "you may record synthetic demo decisions"
                : "no scientific approver grant"}{" "}
              · {data.canTriage ? "you may accept terms for review" : "no triage grant"}.
            </p>
          </div>

          <div
            className="space-y-2 rounded-md border border-border p-3"
            data-testid="p39-section-proposals"
          >
            <div className="flex flex-wrap items-center gap-2">
              <FileSearch className="h-4 w-4" aria-hidden />
              <p className="text-sm font-medium">Domain proposals from source-document sections</p>
            </div>
            <p className="text-xs text-muted-foreground">
              A domain is proposed only when the term&apos;s cited source document (matched by
              SHA-256) lists the exact label and exact unit under a recognized medical section, and
              no catalog reference disagrees. Section evidence is not scientific validation and
              records nothing: accepting proposals only fills the domain column for your review.
            </p>
            {docs.length ? (
              <ul className="space-y-1 text-xs">
                {docs.map((d) => (
                  <li key={d.sha256}>
                    <span className="font-medium">{d.fileName}</span> · SHA-256{" "}
                    <span className="font-mono">{d.sha256.slice(0, 12)}…</span>
                    {d.pages ? ` · ${d.pages} pages` : ""} ·{" "}
                    {sectionCoverage(d)
                      .filter((c) => c.domain)
                      .map(
                        (c) =>
                          `${c.heading} → ${DOMAIN_WORD[c.domain!]}${c.page ? ` (p. ${c.page})` : ""}: ${c.rows}${c.declaredCount !== null ? ` of ${c.declaredCount}` : ""} rows`,
                      )
                      .join(" · ")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No cited source document is loaded yet.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="p39-source-file" className="text-xs">
                  Load another cited source document (PDF, CSV, XLSX or text; read on this device)
                </Label>
                <Input
                  id="p39-source-file"
                  type="file"
                  accept=".pdf,.csv,.xlsx,.txt"
                  className="h-8 text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void loadSourceDocument(f);
                  }}
                />
              </div>
              <Button
                size="sm"
                disabled={!awaiting.length}
                onClick={() =>
                  setAcceptedSection((s) => new Set([...s, ...awaiting.map((r) => r.key)]))
                }
              >
                Accept {awaiting.length} proposed domains
                {awaiting.length
                  ? ` (${proposalDomains(awaiting)
                      .map(([l, n]) => `${l} ${n}`)
                      .join(", ")})`
                  : ""}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!acceptedRows.length}
                onClick={() => setAcceptedSection(new Set())}
              >
                Clear {acceptedRows.length} accepted
              </Button>
            </div>
            {docNote ? (
              <p role="status" className="text-xs text-muted-foreground">
                {docNote}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="p38-search" className="text-xs">
                Search label, display name, unit or term ID
              </Label>
              <Input
                id="p38-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p38-cat" className="text-xs">
                Status / eligibility
              </Label>
              <select
                id="p38-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as typeof category)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All</option>
                {PREFLIGHT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {PREFLIGHT_CATEGORY_LABEL[c]}
                  </option>
                ))}
                <option value="needs_domain">Needs a domain choice</option>
                <option value="awaiting_section">
                  Source-section proposal awaiting acceptance
                </option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p38-dom" className="text-xs">
                Domain
              </Label>
              <select
                id="p38-dom"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value as typeof domainFilter)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All</option>
                {DOMAINS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
                <option value="none">No domain yet</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelected(new Set(allEligible.map((r) => r.key)))}
            >
              <ListChecks className="mr-1 h-4 w-4" aria-hidden />
              Select All Eligible ({allEligible.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setSelected(
                  (s) =>
                    new Set([
                      ...s,
                      ...pageRows.filter((r) => decidable(r, scope)).map((r) => r.key),
                    ]),
                )
              }
            >
              Select Page
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
              Deselect All
            </Button>
            <div className="flex items-end gap-1">
              <div className="space-y-1">
                <Label htmlFor="p38-bulk-domain" className="text-xs">
                  Domain for selected / filtered without domain
                </Label>
                <select
                  id="p38-bulk-domain"
                  value={bulkDomain}
                  onChange={(e) => setBulkDomain(e.target.value as HealthDomainId)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {DOMAINS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const targets = selected.size
                    ? rows.filter((r) => selected.has(r.key))
                    : filtered.filter(
                        (r) => needsDomainChoice(r) || r.category === "conflicting_identity",
                      );
                  setOverrides((m) => {
                    const n = new Map(m);
                    for (const r of targets)
                      if (
                        r.category === "eligible" ||
                        needsDomainChoice(r) ||
                        r.category === "conflicting_identity"
                      )
                        n.set(r.key, { ...n.get(r.key), domain: bulkDomain });
                    return n;
                  });
                }}
              >
                Apply domain
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Submitted terms preflight">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="p-1">Select</th>
                  <th className="p-1">Submitted label · exact unit</th>
                  <th className="p-1">Status</th>
                  <th className="p-1">Demo display name</th>
                  <th className="p-1">Domain</th>
                  <th className="p-1">References · reasons</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => {
                  const editable =
                    r.category === "eligible" ||
                    needsDomainChoice(r) ||
                    awaitsSectionAcceptance(r) ||
                    r.category === "conflicting_identity";
                  const sp = r.sectionProposal;
                  const firstEvidence = sp?.evidence[0];
                  return (
                    <tr key={r.key} className="border-t border-border align-top">
                      <td className="p-1">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.labels[0] ?? r.termId}`}
                          disabled={!decidable(r, scope)}
                          checked={selected.has(r.key)}
                          onChange={(e) => toggle(r.key, e.target.checked)}
                        />
                      </td>
                      <td className="p-1">
                        <span className="font-medium">{r.labels.join(", ")}</span> · {r.unit || "—"}
                        <div className="font-mono text-muted-foreground">{r.termId}</div>
                      </td>
                      <td className="p-1">
                        <Badge variant={r.category === "eligible" ? "default" : "outline"}>
                          {needsDomainChoice(r)
                            ? "Needs a domain choice"
                            : awaitsSectionAcceptance(r)
                              ? "Domain proposed · accept to continue"
                              : PREFLIGHT_CATEGORY_LABEL[r.category]}
                        </Badge>
                        <div className="text-muted-foreground">
                          {r.triageAction === "ACCEPT_FOR_REVIEW"
                            ? "Accepted for review"
                            : "Not yet accepted for review"}
                          {r.inScope ? "" : " · outside owner demo scope"}
                        </div>
                      </td>
                      <td className="p-1">
                        {editable ? (
                          <Input
                            aria-label={`Demo display name for ${r.labels[0] ?? r.termId}`}
                            value={r.displayName}
                            maxLength={120}
                            onChange={(e) => setOverride(r.key, { displayName: e.target.value })}
                            className="h-7 text-xs"
                          />
                        ) : (
                          r.displayName
                        )}
                      </td>
                      <td className="p-1">
                        {editable ? (
                          <select
                            aria-label={`Demo domain for ${r.labels[0] ?? r.termId}`}
                            value={r.domain ?? ""}
                            onChange={(e) =>
                              setOverride(r.key, { domain: e.target.value as HealthDomainId })
                            }
                            className="h-7 rounded-md border border-border bg-background px-1 text-xs"
                          >
                            <option value="" disabled>
                              Choose
                            </option>
                            {DOMAINS.map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (r.domain ?? "—")
                        )}
                      </td>
                      <td className="p-1 text-muted-foreground">
                        {r.references.length
                          ? r.references.map((x) => `${x.id} (${x.source})`).join("; ")
                          : "No catalog reference"}
                        {sp && firstEvidence ? (
                          <div data-testid="p39-row-section">
                            Source section: {firstEvidence.path.join(" › ") || "none"}
                            {firstEvidence.page ? `, page ${firstEvidence.page}` : ""}, line{" "}
                            {firstEvidence.line} · {sp.confidence} confidence
                            {sp.domain ? ` → ${DOMAIN_WORD[sp.domain]}` : ""}
                            {r.sectionAccepted ? " · accepted" : ""}
                          </div>
                        ) : null}
                        {[...r.reasons, ...r.warnings].map((x) => (
                          <div key={x}>{x}</div>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>
              Page {page + 1} of {pages} · {filtered.length} shown of {rows.length}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>

          <div
            className="space-y-2 rounded-md border border-border p-3"
            data-testid="p38-bulk-preview"
          >
            <p className="text-sm font-medium">Bulk preview</p>
            <p className="text-xs">
              Selected {selectedRows.length}: {needTriage.length} need review acceptance first,{" "}
              {toDecide.length} ready for a synthetic demo decision, {excludedSelected.length}{" "}
              excluded.
            </p>
            {excludedSelected.length ? (
              <ul className="list-disc pl-5 text-xs text-muted-foreground">
                {excludedSelected.slice(0, 20).map((r) => (
                  <li key={r.key}>
                    {r.labels[0]} ({r.termId}):{" "}
                    {!r.inScope
                      ? "outside the owner-authorized demo scope"
                      : scope.get(r.key)?.submittedByCaller
                        ? "you submitted this term"
                        : (r.reasons[0] ?? PREFLIGHT_CATEGORY_LABEL[r.category])}
                  </li>
                ))}
              </ul>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !data.canTriage || !needTriage.length}
              onClick={() => void startTriage(needTriage)}
            >
              Accept {needTriage.length} selected for scientific review
            </Button>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I understand these are SYNTHETIC DEMO decisions, labelled NOT SCIENTIFICALLY
                VALIDATED. They are not scientific approvals, cite no source validation, assay
                method, specimen or protocol, activate nothing and never enter the production
                catalog.
              </span>
            </label>
            <Button
              size="sm"
              disabled={busy || !ack || !data.canDecide || !toDecide.length}
              onClick={() => void startDecide(toDecide)}
            >
              <FlaskConical className="mr-1 h-4 w-4" aria-hidden />
              Record Bulk SYNTHETIC DEMO Decisions ({toDecide.length})
            </Button>
          </div>

          {run ? (
            <div
              role="status"
              className="space-y-1 rounded-md border border-border p-3 text-xs"
              data-testid="p38-bulk-run"
            >
              <p className="font-medium">
                {run.kind === "triage" ? "Review acceptance" : "Synthetic demo decisions"}: batch{" "}
                {run.progress.batchesDone} of {run.progress.batchesTotal} · {run.progress.itemsDone}{" "}
                of {run.progress.itemsTotal} terms processed
              </p>
              {summary ? (
                <p>
                  Recorded {summary.recorded} · already recorded (retry) {summary.duplicate} ·
                  skipped {summary.skipped} · rejected {summary.rejected} · changed meanwhile{" "}
                  {summary.stale}
                </p>
              ) : null}
              {run.results
                .filter((r) => r.status === "rejected" || r.status === "stale")
                .slice(0, 20)
                .map((r) => (
                  <p key={r.ref} className="text-destructive">
                    {r.termId}: {r.detail ?? r.status}
                  </p>
                ))}
              {run.results.length ? (
                <details data-testid="p54-bulk-item-results">
                  <summary className="cursor-pointer">Per-item results ({run.results.length})</summary>
                  <ul className="mt-1 max-h-64 space-y-0.5 overflow-auto">
                    {run.results.map((r) => (
                      <li key={r.ref} className={r.status === "rejected" || r.status === "stale" ? "text-destructive" : ""}>
                        {r.termId}: {r.status === "recorded" ? "recorded" : r.status === "duplicate" ? "already recorded" : r.status === "stale" ? "changed meanwhile" : r.status}
                        {r.detail ? ` — ${r.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {retry.keys.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSelected(new Set(retry.keys))}
                >
                  <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
                  Select {retry.keys.length} failed item(s) again for retry
                </Button>
              ) : null}
              {retry.notRetryable ? (
                <p className="text-muted-foreground">
                  {retry.notRetryable} failed item(s) are no longer eligible and cannot be retried.
                </p>
              ) : null}
              {run.failure ? (
                <p role="alert" className="text-destructive">
                  {run.failure}
                </p>
              ) : null}
              {run.retry ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run.retry?.()}
                >
                  <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
                  Retry remaining batches
                </Button>
              ) : null}
            </div>
          ) : null}
      </div>
      )}
    </BulkResearcherSection>
  );
}
