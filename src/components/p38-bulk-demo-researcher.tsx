/**
 * P38 Researcher bulk SYNTHETIC DEMO decisions on Scientific Review. Preflight of
 * every submitted term of the mission (all pages), editable proposed names and
 * domains, Select All Eligible / Select Page / Deselect All, bulk preview with
 * exclusions, then bounded transactional server batches: (1) ACCEPT_FOR_REVIEW
 * triage for selected terms that still need it, (2) one acknowledgement and one
 * "Record Bulk SYNTHETIC DEMO Decisions" action. Decisions never activate
 * anything; Ground Medical activates separately.
 * P61.5: accepted synthetic terms outside the scope can be authorized for the
 * synthetic demo scope here (individually or in bulk), and possible existing
 * demo biomarkers are surfaced for identity review (alias decision or session
 * confirmation of a distinct measurement) before any independent decision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { listGlobalReviewSubmissions, listGlobalTriage } from "@/lib/p36-global-review.functions";
import {
  EVIDENCE_REQUIREMENTS,
  latestTriageByTerm,
  triageInputProblem,
  type EvidenceRequirement,
  type TriageEvent,
} from "@/lib/p36-global-triage-rules";
import { BulkResearcherSection } from "@/components/p38-bulk-researcher-section";
import { getSyntheticDemoLifecycle } from "@/lib/p37-synthetic-demo.functions";
import type { DemoLifecycleRow, DemoScopeTerm } from "@/lib/p37-synthetic-demo.server";
import { bulkDemoDecideFn } from "@/lib/p38-bulk-demo.functions";
import { bulkGlobalTriageFn } from "@/lib/p55-bulk-triage.functions";
import {
  authorizeDemoScopeFn,
  decideDemoAliasFn,
  getDemoGovernanceFn,
} from "@/lib/p615-demo-scope.functions";
import type { AliasLifecycleRow, ScopeGrant } from "@/lib/p615-demo-scope.server";
import {
  aliasDecisionFit,
  identityReviewBlock,
  possibleExistingMatches,
  scopeAuthorizationFit,
  type DemoIdentity,
  type PossibleMatch,
} from "@/domain/health-intelligence/p615-scope-authorization";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BulkActionTable,
  BulkOutcomePanel,
  BulkPreflightDialog,
  BulkSelectionToolbar,
} from "@/components/p55-bulk-controls";
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
import type { BulkProgress } from "@/domain/health-intelligence/p38-bulk-demo-batches";
import {
  buildBulkPreflight,
  deselectAll,
  executeBulk,
  pruneSelection,
  selectAllFiltered,
  selectIds,
  selectionScope,
  toggleId,
  type BulkPreflight,
  type RecordOutcome,
} from "@/domain/health-intelligence/p55-bulk-selection-engine";
import {
  RESEARCHER_ACTION_LABEL,
  acceptReviewFit,
  acknowledgeMatchFit,
  demoDecideFit,
  requestClarificationFit,
  suggestedRequirements,
  type ResearcherBulkAction,
} from "@/domain/health-intelligence/p55-bulk-actions";
import {
  SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT,
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
  /** P61.5 Researcher authorization state; null while the pending change is not installed. */
  gov: { canAuthorize: boolean; grants: ScopeGrant[]; aliases: AliasLifecycleRow[] } | null;
  govNote: string;
};
type Run = {
  action: ResearcherBulkAction;
  progress: BulkProgress | null;
  outcomes: RecordOutcome[];
  failure: string | null;
};
type TriageFilter = "all" | "awaiting_triage" | "accepted" | "more_evidence" | "rejected";
const TRIAGE_FILTER_LABEL: Record<TriageFilter, string> = {
  all: "All review states",
  awaiting_triage: "Awaiting triage",
  accepted: "Accepted for scientific review",
  more_evidence: "More evidence requested",
  rejected: "Review request rejected",
};
const triageStateOf = (a: string | null): Exclude<TriageFilter, "all"> =>
  a === "ACCEPT_FOR_REVIEW"
    ? "accepted"
    : a === "REQUEST_MORE_EVIDENCE"
      ? "more_evidence"
      : a === "REJECT_REVIEW_REQUEST"
        ? "rejected"
        : "awaiting_triage";
const REQUIREMENT_LABEL: Record<EvidenceRequirement, string> = {
  identity: "Biomarker identity",
  unit: "Unit",
  method: "Measurement method",
  specimen: "Specimen",
  protocol: "Protocol",
  source_validation: "Source validation",
  other: "Other",
};
const ACTION_ORDER: ResearcherBulkAction[] = [
  "accept_review",
  "authorize_scope",
  "demo_decide",
  "request_clarification",
  "acknowledge_match",
];
const ACTION_DESCRIPTION: Record<ResearcherBulkAction, string> = {
  accept_review: "Triage only: not scientific approval and never activation.",
  authorize_scope:
    "Adds accepted synthetic terms with an exact unit to this mission's synthetic demo scope; not a decision, approval or activation.",
  demo_decide:
    "SYNTHETIC DEMO decisions for accepted, eligible terms; Ground Medical activates separately.",
  request_clarification: "Records a REQUEST_MORE_EVIDENCE triage event with the evidence you name.",
  acknowledge_match:
    "Shows the existing catalog identity; creates no entry and is not saved (this session only).",
};

/** Ready for a decision request now (selection eligibility; shared pure rule). */
const decidable = (r: PreflightRow, scope: Map<string, DemoScopeTerm>) => isDecidable(r, scope);

const LOADING_NOTE = "Reading every submitted term of this mission…";

export function P38BulkDemoResearcher({
  missionId,
  missionLabel,
}: {
  missionId: string;
  missionLabel?: string;
}) {
  const listSubs = useServerFn(listGlobalReviewSubmissions);
  const listTriage = useServerFn(listGlobalTriage);
  const lifecycle = useServerFn(getSyntheticDemoLifecycle);
  const triageFn = useServerFn(bulkGlobalTriageFn);
  const decideFn = useServerFn(bulkDemoDecideFn);
  const governance = useServerFn(getDemoGovernanceFn);
  const authorizeFn = useServerFn(authorizeDemoScopeFn);
  const aliasFn = useServerFn(decideDemoAliasFn);
  /** Session-only confirmations that a possible match is a distinct measurement (never saved). */
  const [distinct, setDistinct] = useState<Set<string>>(new Set());
  const [identity, setIdentity] = useState<{
    key: string;
    target: string | null;
    rationale: string;
    ack: boolean;
    note: string;
  } | null>(null);
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
  const [triageFilter, setTriageFilter] = useState<TriageFilter>("all");
  const [crewFilter, setCrewFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [identityFilter, setIdentityFilter] = useState<"all" | "with_reference" | "no_reference">(
    "all",
  );
  const [pending, setPending] = useState<{
    action: ResearcherBulkAction;
    preflight: BulkPreflight<PreflightRow>;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [reqs, setReqs] = useState<EvidenceRequirement[]>([]);
  /** Session-only acknowledgements of existing catalog matches (never saved, no catalog entry). */
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [s, t, l, g] = await Promise.all([
      listSubs({ data: { missionId, provenance: "synthetic" } }).catch(() => null),
      listTriage({ data: { missionId, provenance: "synthetic" } }).catch(() => null),
      lifecycle({ data: { missionId } }).catch(() => null),
      governance({ data: { missionId } }).catch(() => null),
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
      gov: g?.ok ? { canAuthorize: g.canAuthorize, grants: g.grants, aliases: g.aliases } : null,
      govNote: g && !g.ok ? g.message : g ? "" : "Researcher authorization state is unavailable.",
    });
  }, [missionId, listSubs, listTriage, lifecycle, governance]);
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
  const activeIdentities = useMemo<DemoIdentity[]>(
    () =>
      (data?.events ?? [])
        .filter((e) => e.activationEventId && !e.revocationEventId)
        .map((e) => ({
          demoId: e.demoId,
          termId: e.termId,
          displayName: e.entry.displayName,
          aliases: e.entry.aliases,
          unit: e.entry.unit,
        })),
    [data],
  );
  const matchesOf = useMemo(
    () =>
      new Map<string, PossibleMatch[]>(
        rows.map((r) => [
          r.key,
          possibleExistingMatches({ termId: r.termId, labels: r.labels, unit: r.unit }, activeIdentities),
        ]),
      ),
    [rows, activeIdentities],
  );
  const aliasOf = useMemo(
    () =>
      new Map((data?.gov?.aliases ?? []).map((a) => [termKey(a.submissionId, a.termId), a])),
    [data],
  );
  const identityBlock = (r: PreflightRow) =>
    identityReviewBlock({
      matches: matchesOf.get(r.key) ?? [],
      aliasDecided: aliasOf.has(r.key),
      confirmedDistinct: distinct.has(r.key),
    });
  const crewOf = useMemo(
    () => new Map((data?.subs ?? []).map((s) => [s.submissionId, s.crewPseudonym])),
    [data],
  );
  const crews = [...new Set(crewOf.values())].sort();
  const units = useMemo(() => [...new Set(rows.map((r) => r.unit))].sort(), [rows]);
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
    if (triageFilter !== "all" && triageStateOf(r.triageAction) !== triageFilter) return false;
    if (crewFilter !== "all" && crewOf.get(r.submissionId) !== crewFilter) return false;
    if (unitFilter !== "all" && r.unit !== unitFilter) return false;
    if (identityFilter === "with_reference" && !r.references.length) return false;
    if (identityFilter === "no_reference" && r.references.length) return false;
    const q = query.trim().toLowerCase();
    return (
      !q ||
      r.termId.includes(q) ||
      r.labels.some((l) => l.toLowerCase().includes(q)) ||
      r.displayName.toLowerCase().includes(q) ||
      r.unit.toLowerCase().includes(q) ||
      r.references.some((x) => x.id.toLowerCase().includes(q) || x.name.toLowerCase().includes(q))
    );
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  useEffect(
    () => setPage(0),
    [query, category, domainFilter, triageFilter, crewFilter, unitFilter, identityFilter],
  );

  const scope = data?.scope ?? new Map<string, DemoScopeTerm>();
  const allEligible = rows.filter((r) => decidable(r, scope) && !identityBlock(r));
  const filteredIds = filtered.map((r) => r.key);
  const selScope = selectionScope(selected, filteredIds);
  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);
  const labelOf = (key: string) => {
    const r = rowByKey.get(key);
    return r ? `${r.labels[0] ?? r.termId} · ${r.unit || "no unit"} (${r.termId})` : key;
  };
  const rowLabel = (r: PreflightRow) => labelOf(r.key);
  // Drop selections that no longer exist after a reload; never adds any.
  useEffect(() => {
    if (data)
      setSelected((s) =>
        pruneSelection(
          s,
          rows.map((r) => r.key),
        ),
      );
  }, [data, rows]);

  const setOverride = (key: string, patch: PreflightOverride) =>
    setOverrides((m) => new Map(m).set(key, { ...m.get(key), ...patch }));
  const toggle = (key: string, on: boolean) => setSelected((s) => toggleId(s, key, on));

  const fitFor = (action: ResearcherBulkAction) => (r: PreflightRow) => {
    if (action === "accept_review") return acceptReviewFit(r, !!data?.canTriage);
    if (action === "request_clarification") return requestClarificationFit(r, !!data?.canTriage);
    if (action === "acknowledge_match") return acknowledgeMatchFit(r, acknowledged.has(r.key));
    if (action === "authorize_scope")
      return scopeAuthorizationFit(r, {
        canAuthorize: !!data?.gov?.canAuthorize,
        submittedByCaller: !!scope.get(r.key)?.submittedByCaller,
        installed: !!data?.gov,
      });
    const fit = demoDecideFit(r, {
      submittedByCaller: !!scope.get(r.key)?.submittedByCaller,
      canDecide: !!data?.canDecide,
    });
    const gate = fit.kind === "actionable" ? identityBlock(r) : null;
    return gate ? { kind: "blocked" as const, reason: gate } : fit;
  };
  const preflightFor = (action: ResearcherBulkAction, sel: ReadonlySet<string> = selected) =>
    buildBulkPreflight({
      records: rows,
      idOf: (r) => r.key,
      selected: sel,
      filteredIds,
      fit: fitFor(action),
      missionLabel: missionLabel ?? missionId,
      roleLabel: "Researcher",
      actionLabel: RESEARCHER_ACTION_LABEL[action],
    });
  const openPreflight = (action: ResearcherBulkAction, sel: ReadonlySet<string> = selected) => {
    const preflight = preflightFor(action, sel);
    if (action === "request_clarification") {
      setReqs(suggestedRequirements(preflight.actionable.map((r) => r.category)));
      setReason("");
    }
    if (action === "demo_decide") setAck(false);
    setPending({ action, preflight });
  };
  const triageEventOf = (r: PreflightRow) => data?.triage.get(r.key)?.eventId ?? null;
  const triageItems = (batch: PreflightRow[]) =>
    batch.map((r) => ({
      submissionId: r.submissionId,
      termId: r.termId,
      expectedPreviousEventId: triageEventOf(r),
    }));
  const clarificationProblem = triageInputProblem({
    action: "REQUEST_MORE_EVIDENCE",
    reason,
    evidenceRequirements: reqs,
  });
  const confirmPending = async () => {
    if (!pending) return;
    const { action, preflight } = pending;
    setPending(null);
    if (action === "acknowledge_match") {
      setAcknowledged((s) =>
        selectIds(
          s,
          preflight.actionable.map((r) => r.key),
        ),
      );
      setRun({
        action,
        progress: null,
        failure: null,
        outcomes: [
          ...preflight.actionable.map((r) => ({
            id: r.key,
            label: rowLabel(r),
            outcome: "success" as const,
            detail: `${r.reasons[0] ?? "Existing catalog match"} Acknowledged in this session only; nothing was saved and no catalog entry was created.`,
            retryAvailable: false,
          })),
          ...preflight.already.map((x) => ({
            id: x.record.key,
            label: rowLabel(x.record),
            outcome: "already_completed" as const,
            detail: x.reason,
            retryAvailable: false,
          })),
          ...preflight.blocked.map((x) => ({
            id: x.record.key,
            label: rowLabel(x.record),
            outcome: "blocked" as const,
            detail: x.reason,
            retryAvailable: false,
          })),
        ],
      });
      return;
    }
    setBusy(true);
    setRun({ action, progress: null, outcomes: [], failure: null });
    const send =
      action === "authorize_scope"
        ? (batch: PreflightRow[]) =>
            authorizeFn({
              data: {
                missionId,
                items: batch.map((r) => ({
                  submissionId: r.submissionId,
                  termId: r.termId,
                  exactUnit: r.unit,
                })),
              },
            })
        : action === "demo_decide"
        ? (batch: PreflightRow[]) =>
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
            })
        : (batch: PreflightRow[]) =>
            triageFn({
              data: {
                missionId,
                action: action === "accept_review" ? "ACCEPT_FOR_REVIEW" : "REQUEST_MORE_EVIDENCE",
                reason: action === "accept_review" ? null : reason.trim(),
                evidenceRequirements: action === "accept_review" ? [] : reqs,
                items: triageItems(batch),
              },
            });
    const res = await executeBulk({
      preflight,
      idOf: (r) => r.key,
      labelOf,
      send,
      onProgress: (progress) => setRun({ action, progress, outcomes: [], failure: null }),
    });
    setRun({ action, ...res });
    setAck(false);
    await load();
    setBusy(false);
  };
  const workflow = bulkSelectionCounts(rows, scope);
  const actionOptions = ACTION_ORDER.map((id) => {
    const p = preflightFor(id);
    return {
      id,
      label: RESEARCHER_ACTION_LABEL[id],
      description: ACTION_DESCRIPTION[id],
      actionable: p.actionable.length,
      already: p.already.length,
      blocked: p.blocked.length,
      unavailable:
        (id === "accept_review" || id === "request_clarification") && data && !data.canTriage
          ? "This account has no triage grant; triage actions are unavailable."
          : id === "demo_decide" && data && !data.canDecide
            ? "This account has no scientific approver grant."
            : id === "authorize_scope" && data && !data.gov
              ? data.govNote || "Researcher authorization is unavailable."
              : id === "authorize_scope" && data?.gov && !data.gov.canAuthorize
                ? "This account has no Researcher (scientific approver) grant."
                : null,
    };
  });
  const visibility = bulkResearcherVisibility({
    authorizedMissions: 1,
    missionSelected: true,
    lifecycle: data
      ? {
          canDecide: data.canDecide,
          // P61.5: a Researcher may also start the scope of a mission from accepted terms.
          demoScopeTerms:
            data.scope.size ||
            (data.gov?.canAuthorize
              ? rows.filter((r) => r.triageAction === "ACCEPT_FOR_REVIEW").length
              : 0),
        }
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
          <div data-testid="p38-preflight-counts" className="space-y-1">
            <p className="text-sm font-medium">
              Preflight of {counts.total} submitted terms (before any write)
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="default">Eligible {counts.eligible}</Badge>
              <Badge variant="secondary" data-testid="p54-awaiting-triage">
                Eligible · awaiting review acceptance (triage) {workflow.awaitingTriage}
              </Badge>
              <Badge variant="secondary">
                Eligible · ready for decision {workflow.readyForDecision}
              </Badge>
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
            <p className="text-xs text-muted-foreground" data-testid="p615-scope-summary">
              In the synthetic demo scope: {[...scope.keys()].length} terms
              {data.gov ? ` (${data.gov.grants.length} added by Researcher authorization)` : ""} ·
              accepted for review but outside the scope:{" "}
              {rows.filter((r) => !r.inScope && r.triageAction === "ACCEPT_FOR_REVIEW").length} ·{" "}
              {data.gov
                ? data.gov.canAuthorize
                  ? "you may authorize eligible terms for the synthetic demo"
                  : "no Researcher authorization grant"
                : data.govNote || "Researcher authorization unavailable"}{" "}
              ·{" "}
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

          <div className="grid gap-2 sm:grid-cols-4" data-testid="p55-researcher-filters">
            <div className="space-y-1">
              <Label htmlFor="p55-r-triage" className="text-xs">
                Review (triage) state
              </Label>
              <select
                id="p55-r-triage"
                value={triageFilter}
                onChange={(e) => setTriageFilter(e.target.value as TriageFilter)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                {(Object.keys(TRIAGE_FILTER_LABEL) as TriageFilter[]).map((k) => (
                  <option key={k} value={k}>
                    {TRIAGE_FILTER_LABEL[k]}
                    {k === "all"
                      ? ""
                      : ` (${rows.filter((r) => triageStateOf(r.triageAction) === k).length})`}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p55-r-unit" className="text-xs">
                Exact unit
              </Label>
              <select
                id="p55-r-unit"
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All units</option>
                {units.map((u) => (
                  <option key={u || "none"} value={u}>
                    {u || "(no unit)"}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p55-r-identity" className="text-xs">
                Catalog identity
              </Label>
              <select
                id="p55-r-identity"
                value={identityFilter}
                onChange={(e) => setIdentityFilter(e.target.value as typeof identityFilter)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All</option>
                <option value="with_reference">Has an existing catalog reference</option>
                <option value="no_reference">No catalog reference</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="p55-r-crew" className="text-xs">
                Crew (pseudonym)
              </Label>
              <select
                id="p55-r-crew"
                value={crewFilter}
                onChange={(e) => setCrewFilter(e.target.value)}
                className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
              >
                <option value="all">All permitted crew</option>
                {crews.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <BulkSelectionToolbar
            idPrefix="p55-researcher"
            scope={selScope}
            pageCount={pageRows.length}
            onSelectAllFiltered={() => setSelected((s) => selectAllFiltered(s, filteredIds))}
            onSelectPage={() =>
              setSelected((s) =>
                selectIds(
                  s,
                  pageRows.map((r) => r.key),
                ),
              )
            }
            onDeselectAll={() => setSelected(deselectAll())}
            onKeepOnlyFiltered={() => setSelected((s) => pruneSelection(s, filteredIds))}
            extra={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelected(new Set(allEligible.map((r) => r.key)))}
              >
                <ListChecks className="mr-1 h-4 w-4" aria-hidden />
                Select All Eligible for a demo decision ({allEligible.length})
              </Button>
            }
          />
          <div className="flex flex-wrap items-end gap-2">
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
                          {crewOf.get(r.submissionId) ? ` · ${crewOf.get(r.submissionId)}` : ""}
                        </div>
                        {acknowledged.has(r.key) ? (
                          <Badge variant="secondary">Match acknowledged (this session)</Badge>
                        ) : null}
                        {!r.inScope && r.triageAction === "ACCEPT_FOR_REVIEW" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1 h-6 px-2 text-xs"
                            disabled={busy}
                            onClick={() => openPreflight("authorize_scope", new Set([r.key]))}
                          >
                            Authorize for Synthetic Demo
                          </Button>
                        ) : null}
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
                        {(matchesOf.get(r.key) ?? []).length ? (
                          <div data-testid="p615-possible-match" className="text-foreground">
                            Possible existing demo biomarker (review required, never merged
                            automatically):{" "}
                            {(matchesOf.get(r.key) ?? [])
                              .map(
                                (m) =>
                                  `${m.displayName} · ${m.unit}${m.sameUnit ? " (same exact unit)" : " (different unit: no alias possible)"}`,
                              )
                              .join("; ")}
                          </div>
                        ) : null}
                        {aliasOf.get(r.key) ? (
                          <div>
                            Alias decision → {aliasOf.get(r.key)!.entry.targetDisplayName} ·{" "}
                            {aliasOf.get(r.key)!.revocationEventId
                              ? "revoked"
                              : aliasOf.get(r.key)!.activationEventId
                                ? "active"
                                : "awaiting Ground Medical activation"}
                          </div>
                        ) : distinct.has(r.key) ? (
                          <div>Confirmed distinct measurement (this session only)</div>
                        ) : null}
                        {(matchesOf.get(r.key) ?? []).some((m) => m.sameUnit) &&
                        !aliasOf.has(r.key) &&
                        r.category !== "already_active" &&
                        r.category !== "already_decided" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-1 h-6 px-2 text-xs"
                            onClick={() =>
                              setIdentity({
                                key: r.key,
                                target:
                                  (matchesOf.get(r.key) ?? []).filter((m) => m.sameUnit).length === 1
                                    ? (matchesOf.get(r.key) ?? []).find((m) => m.sameUnit)!.demoId
                                    : null,
                                rationale: "",
                                ack: false,
                                note: "",
                              })
                            }
                          >
                            Review identity
                          </Button>
                        ) : null}
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

          <BulkActionTable
            idPrefix="p55-researcher"
            actions={actionOptions}
            selected={selected.size}
            busy={busy}
            onReview={(id) => openPreflight(id as ResearcherBulkAction)}
            onClear={() => setSelected(deselectAll())}
          />
          <BulkPreflightDialog
            preflight={pending?.preflight ?? null}
            labelOf={rowLabel}
            confirmLabel={
              pending ? `Confirm: ${RESEARCHER_ACTION_LABEL[pending.action]}` : "Confirm"
            }
            confirmDisabled={
              busy ||
              (pending?.action === "demo_decide" && !ack) ||
              (pending?.action === "request_clarification" && !!clarificationProblem)
            }
            safeguard={
              pending?.action === "authorize_scope"
                ? "Adds only the listed eligible synthetic terms to this mission's synthetic demo scope. This is not a scientific approval or a demo decision and activates nothing; the server re-checks every term."
                : pending?.action === "accept_review"
                ? "Accepting for scientific review is triage only. It is not scientific approval and never activates anything."
                : pending?.action === "demo_decide"
                  ? `${SYNTHETIC_DEMO_LABEL}. Decisions are not scientific approvals and activate nothing; Ground Medical activates separately.`
                  : pending?.action === "request_clarification"
                    ? "Records a REQUEST_MORE_EVIDENCE triage event for each actionable term. Units are never chosen or converted."
                    : "Only shows the existing catalog identity. Nothing is saved and no catalog entry is created."
            }
            onCancel={() => setPending(null)}
            onConfirm={() => void confirmPending()}
          >
            {pending?.action === "authorize_scope" && pending.preflight.actionable.length ? (
              <div className="max-h-64 overflow-y-auto" data-testid="p615-authorize-list">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="p-1">Term</th>
                      <th className="p-1">Exact unit</th>
                      <th className="p-1">Mission</th>
                      <th className="p-1">Proposed domain</th>
                      <th className="p-1">Possible existing match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.preflight.actionable.map((r) => (
                      <tr key={r.key} className="border-t border-border align-top">
                        <td className="p-1">
                          {r.labels.join(", ") || r.termId}
                          <div className="font-mono text-muted-foreground">{r.termId}</div>
                        </td>
                        <td className="p-1">{r.unit}</td>
                        <td className="p-1">{missionLabel ?? missionId}</td>
                        <td className="p-1">
                          {r.domain ? DOMAIN_WORD[r.domain] : "Chosen at the demo decision"}
                        </td>
                        <td className="p-1">
                          {(matchesOf.get(r.key) ?? [])
                            .map((m) => `${m.displayName} · ${m.unit}${m.sameUnit ? " (same unit)" : ""}`)
                            .join("; ") || "None found"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {pending?.action === "demo_decide" ? (
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
            ) : null}
            {pending?.action === "request_clarification" ? (
              <div className="space-y-2">
                <fieldset className="grid grid-cols-2 gap-2">
                  <legend className="mb-1 text-xs text-muted-foreground">
                    Missing evidence (at least one; suggested from the blocking reasons)
                  </legend>
                  {EVIDENCE_REQUIREMENTS.map((q) => (
                    <div key={q} className="flex items-center gap-2">
                      <Checkbox
                        id={`p55-req-${q}`}
                        checked={reqs.includes(q)}
                        onCheckedChange={(c) =>
                          setReqs((cur) =>
                            c ? [...new Set([...cur, q])] : cur.filter((x) => x !== q),
                          )
                        }
                      />
                      <Label htmlFor={`p55-req-${q}`} className="text-xs font-normal">
                        {REQUIREMENT_LABEL[q]}
                      </Label>
                    </div>
                  ))}
                </fieldset>
                <div className="space-y-1">
                  <Label htmlFor="p55-req-reason" className="text-xs">
                    Reason (required, 8–2000 characters; recorded for every actionable term)
                  </Label>
                  <Textarea
                    id="p55-req-reason"
                    value={reason}
                    maxLength={2000}
                    rows={3}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
                {clarificationProblem ? (
                  <p className="text-xs text-muted-foreground">{clarificationProblem}</p>
                ) : null}
              </div>
            ) : null}
          </BulkPreflightDialog>
          {run ? (
            <BulkOutcomePanel
              idPrefix="p55-researcher"
              title={RESEARCHER_ACTION_LABEL[run.action]}
              progress={run.progress}
              outcomes={run.outcomes}
              failure={run.failure}
              busy={busy}
              onRetryFailed={(ids) => {
                const sel = new Set(ids);
                setSelected(sel);
                openPreflight(run.action, sel);
              }}
            />
          ) : null}
          {identity
            ? (() => {
                const r = rowByKey.get(identity.key);
                if (!r) return null;
                const ms = matchesOf.get(r.key) ?? [];
                const target = ms.find((m) => m.demoId === identity.target) ?? null;
                const fit = aliasDecisionFit(r, {
                  target,
                  canAuthorize: !!data.gov?.canAuthorize,
                  submittedByCaller: !!scope.get(r.key)?.submittedByCaller,
                  aliasDecided: aliasOf.has(r.key),
                  installed: !!data.gov,
                });
                const canRecord =
                  fit.kind === "actionable" && identity.rationale.trim().length >= 8 && identity.ack;
                return (
                  <Dialog open onOpenChange={(o) => (!o ? setIdentity(null) : undefined)}>
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Identity review: {r.labels.join(", ") || r.termId}</DialogTitle>
                        <DialogDescription>
                          {r.unit} · {missionLabel ?? missionId} · {r.termId}. Names are never
                          equated by text and units are never converted. Record an alias only when
                          it is the same measurement with the identical exact unit.
                        </DialogDescription>
                      </DialogHeader>
                      <fieldset className="space-y-1 text-sm">
                        <legend className="mb-1 text-xs text-muted-foreground">
                          Possible existing active demo biomarkers
                        </legend>
                        {ms.map((m) => (
                          <label key={m.demoId} className="flex items-start gap-2">
                            <input
                              type="radio"
                              name="p615-target"
                              disabled={!m.sameUnit}
                              checked={identity.target === m.demoId}
                              onChange={() => setIdentity({ ...identity, target: m.demoId })}
                              className="mt-1"
                            />
                            <span>
                              {m.displayName} · {m.unit}{" "}
                              <span className="font-mono text-xs text-muted-foreground">{m.demoId}</span>
                              {m.sameUnit ? "" : " — different unit, no alias possible"}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <div className="space-y-1">
                        <Label htmlFor="p615-rationale" className="text-xs">
                          Identity rationale (required for an alias, 8–2000 characters)
                        </Label>
                        <Textarea
                          id="p615-rationale"
                          rows={3}
                          maxLength={2000}
                          value={identity.rationale}
                          onChange={(e) => setIdentity({ ...identity, rationale: e.target.value })}
                        />
                      </div>
                      <label className="flex items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={identity.ack}
                          onChange={(e) => setIdentity({ ...identity, ack: e.target.checked })}
                          className="mt-0.5"
                        />
                        <span>
                          I confirm this is the same measurement with the identical exact unit. This
                          SYNTHETIC DEMO alias is not a scientific approval; Ground Medical activates
                          it separately and no observation is rewritten.
                        </span>
                      </label>
                      {fit.kind !== "actionable" ? (
                        <p className="text-xs text-muted-foreground">{fit.reason}</p>
                      ) : null}
                      {identity.note ? (
                        <p role="status" className="text-xs">
                          {identity.note}
                        </p>
                      ) : null}
                      <DialogFooter className="flex-wrap gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setDistinct((s) => new Set([...s, r.key]));
                            setIdentity(null);
                          }}
                        >
                          Different measurement — keep separate (this session)
                        </Button>
                        <Button
                          disabled={!canRecord || busy}
                          onClick={async () => {
                            setBusy(true);
                            const res = await aliasFn({
                              data: {
                                missionId,
                                submissionId: r.submissionId,
                                termId: r.termId,
                                targetDemoId: target!.demoId,
                                rationale: identity.rationale,
                                acknowledgement: SYNTHETIC_DEMO_ALIAS_ACKNOWLEDGEMENT,
                              },
                            }).catch(() => null);
                            setBusy(false);
                            if (res?.ok) {
                              setIdentity(null);
                              await load();
                            } else
                              setIdentity({
                                ...identity,
                                note: res?.message ?? "The alias decision was not recorded.",
                              });
                          }}
                        >
                          Record alias decision
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                );
              })()
            : null}
        </div>
      )}
    </BulkResearcherSection>
  );
}
