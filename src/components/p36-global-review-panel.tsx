/**
 * Global Scientific Review workspace. Lists only missions the server
 * authorizes for this account (own Researcher missions, or missions whose
 * sharing policy permits an explicitly granted global reviewer). Shows
 * submitted metadata only, with crew pseudonyms. Triage (accept for review,
 * request more evidence, reject review request) is recorded only through the
 * caller-scoped triage RPC when the account holds a separate triage grant;
 * scientific approval and catalog activation are shown with their blockers and
 * nothing here approves or activates anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { appendGlobalTriage, listGlobalReviewMissions, listGlobalReviewSubmissions, listGlobalTriage } from "@/lib/p36-global-review.functions";
import { EVIDENCE_REQUIREMENTS, latestTriageByTerm, triageInputProblem, type EvidenceRequirement, type TriageAction, type TriageEvent } from "@/lib/p36-global-triage-rules";
import type { GlobalReviewMission, GlobalReviewSubmission } from "@/lib/p36-global-review.server";
import {
  ALL_CREWS, ALL_MISSIONS, REVIEW_STATE_LABEL, SCIENTIFIC_STATE_LABEL, canChooseAllMissions, crewOptions, dashboardCounts, filterTerms,
  flattenTerms, missionsForSelection, paginate, sortTerms, type ReviewState, type TermRow, type TermSort,
} from "@/lib/p36-global-review-view";

const BASIS_LABEL = { mission_researcher: "Mission Researcher", global_scientific_review: "Global scientific review" } as const;
const PAGE_SIZE = 25;
const NO_GRANT_REASON = "This account can read but not record triage: triage needs a separate owner-provisioned grant.";
const ACTION_LABEL: Record<TriageAction, string> = {
  ACCEPT_FOR_REVIEW: "Accept for scientific review",
  REQUEST_MORE_EVIDENCE: "Request more evidence",
  REJECT_REVIEW_REQUEST: "Reject review request",
};
const REQUIREMENT_LABEL: Record<EvidenceRequirement, string> = {
  identity: "Biomarker identity", unit: "Unit", method: "Measurement method", specimen: "Specimen",
  protocol: "Protocol", source_validation: "Source validation", other: "Other",
};

function TriageForm({ row, onRecorded }: { row: TermRow; onRecorded: () => Promise<void> }) {
  const append = useServerFn(appendGlobalTriage);
  const [action, setAction] = useState<TriageAction | null>(null);
  const [reason, setReason] = useState("");
  const [reqs, setReqs] = useState<EvidenceRequirement[]>([]);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const latest = row.triage;
  const allowed = (a: TriageAction) => latest?.action !== "REJECT_REVIEW_REQUEST" && !(a === "ACCEPT_FOR_REVIEW" && latest?.action === "ACCEPT_FOR_REVIEW");
  const open = (a: TriageAction) => { setAction(a); setReason(""); setReqs([]); setKey(crypto.randomUUID()); setMessage(null); };
  const problem = action ? triageInputProblem({ action, reason, evidenceRequirements: action === "REQUEST_MORE_EVIDENCE" ? reqs : [] }) : null;
  const submit = async () => {
    if (!action || problem) return;
    setBusy(true);
    const r = await append({ data: {
      missionId: row.submission.missionId, provenance: row.submission.provenance, submissionId: row.submission.submissionId, termId: row.term.termId,
      action, reason: reason.trim() || null, evidenceRequirements: action === "REQUEST_MORE_EVIDENCE" ? reqs : [],
      expectedPreviousEventId: latest?.eventId ?? null, idempotencyKey: key,
    } }).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) { setMessage({ ok: false, text: r?.message ?? "Nothing was recorded. Try again; the same request will not be duplicated." }); return; }
    setMessage({ ok: true, text: `${ACTION_LABEL[action]} recorded. This is triage, not scientific approval.` });
    setAction(null);
    await onRecorded();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ACTION_LABEL) as TriageAction[]).map((a) => (
          <Button key={a} variant={a === "ACCEPT_FOR_REVIEW" ? "default" : "outline"} disabled={busy || !allowed(a)} aria-pressed={action === a} onClick={() => open(a)}>{ACTION_LABEL[a]}</Button>
        ))}
      </div>
      {latest?.action === "REJECT_REVIEW_REQUEST" ? <p className="text-xs text-muted-foreground">This review request was rejected; a new submission is required for further triage.</p> : null}
      {action ? (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="font-medium">{ACTION_LABEL[action]}</p>
          {action === "REQUEST_MORE_EVIDENCE" ? (
            <fieldset className="grid grid-cols-2 gap-2">
              <legend className="mb-1 text-xs text-muted-foreground">Missing evidence (at least one)</legend>
              {EVIDENCE_REQUIREMENTS.map((q) => (
                <div key={q} className="flex items-center gap-2">
                  <Checkbox id={`req-${q}`} checked={reqs.includes(q)} onCheckedChange={(c) => setReqs((cur) => (c ? [...cur, q] : cur.filter((x) => x !== q)))} />
                  <Label htmlFor={`req-${q}`} className="text-xs font-normal">{REQUIREMENT_LABEL[q]}</Label>
                </div>
              ))}
            </fieldset>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="triage-reason">{action === "ACCEPT_FOR_REVIEW" ? "Note (optional)" : "Reason (required)"}</Label>
            <Textarea id="triage-reason" value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
          {problem ? <p className="text-xs text-muted-foreground">{problem}</p> : null}
          <div className="flex gap-2">
            <Button disabled={busy || !!problem} onClick={() => void submit()}>{busy ? "Recording…" : "Confirm and record"}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAction(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {message ? <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs" : "text-xs text-destructive"}>{message.text}</p> : null}
    </div>
  );
}

interface ComboOption { value: string; search: string; title: string; subtitle?: string; badge?: string }

function ComboBox({ label, placeholder, empty, options, value, onChange, triggerText }: {
  label: string; placeholder: string; empty: string; options: ComboOption[]; value: string; onChange: (v: string) => void; triggerText: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label={label} className="w-full justify-between sm:w-[24rem]">
          <span className="truncate">{triggerText}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem key={o.value} value={o.search} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === o.value ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{o.title}</span>
                    {o.subtitle ? <span className="text-xs text-muted-foreground">{o.subtitle}</span> : null}
                  </span>
                  {o.badge ? <Badge variant="secondary">{o.badge}</Badge> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function Stat({ label, value, note }: { label: string; value: number | string; note?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function HashList({ values }: { values: string[] }) {
  if (!values.length) return <span className="text-muted-foreground">None supplied</span>;
  return <ul className="space-y-1">{values.map((v) => <li key={v} className="break-all font-mono text-xs">{v}</li>)}</ul>;
}

function TermDetail({ row, onClose, canTriage, triageNote, history, onRecorded }: {
  row: TermRow | null; onClose: () => void; canTriage: boolean; triageNote: string; history: TriageEvent[]; onRecorded: () => Promise<void>;
}) {
  const t = row?.term; const s = row?.submission;
  return (
    <Sheet open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {t && s && row ? (
          <>
            <SheetHeader>
              <SheetTitle>{t.originalLabels.join(" · ") || t.termId}</SheetTitle>
              <SheetDescription>Submitted unknown biomarker metadata. Read-only; no measurement values or source documents are shown.</SheetDescription>
            </SheetHeader>
            <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted-foreground">Exact reported unit</dt><dd>{t.exactUnit}</dd>
              <dt className="text-muted-foreground">Candidate catalog identity</dt><dd className="font-mono text-xs">{t.candidateMetricIds.join(", ") || "No candidate proposed"}</dd>
              <dt className="text-muted-foreground">Proposed scientific domain</dt><dd className="text-muted-foreground">Not included in submitted metadata</dd>
              <dt className="text-muted-foreground">Classification status</dt><dd>{t.classification}</dd>
              <dt className="text-muted-foreground">Method / specimen</dt><dd>{t.method ?? "Not supplied"} / {t.specimen ?? "Not supplied"}</dd>
              <dt className="text-muted-foreground">Provenance</dt><dd><Badge variant="outline">{s.provenance}</Badge></dd>
              <dt className="text-muted-foreground">Mission</dt><dd>{s.missionName} ({s.missionCode})</dd>
              <dt className="text-muted-foreground">Crew</dt><dd className="font-mono text-xs">{s.crewPseudonym}</dd>
              <dt className="text-muted-foreground">Submission receipt</dt><dd>{s.requestId} · received {s.receivedAt.slice(0, 16).replace("T", " ")} UTC by {s.submittedRole.replace("_", " ")}</dd>
              <dt className="text-muted-foreground">Triage state</dt><dd><Badge variant="secondary">{REVIEW_STATE_LABEL[row.state]}</Badge></dd>
              <dt className="text-muted-foreground">Scientific decision</dt><dd>{SCIENTIFIC_STATE_LABEL[row.scientific]}</dd>
              <dt className="text-muted-foreground">Triage history</dt>
              <dd>
                {history.length ? (
                  <ol className="space-y-2">
                    {history.map((e) => (
                      <li key={e.eventId} className="rounded border border-border p-2 text-xs">
                        <span className="font-medium">{ACTION_LABEL[e.action]}</span> · {e.recordedAt.slice(0, 16).replace("T", " ")} UTC · {e.recordedByCaller ? "you" : "authorized reviewer"}
                        {e.evidenceRequirements.length ? <span className="block">Missing: {e.evidenceRequirements.map((q) => REQUIREMENT_LABEL[q]).join(", ")}</span> : null}
                        {e.reason ? <span className="block text-muted-foreground">{e.reason}</span> : null}
                      </li>
                    ))}
                  </ol>
                ) : "No triage recorded"}
              </dd>
              <dt className="text-muted-foreground">Document hashes</dt><dd><HashList values={t.sourceDocumentSha256} /></dd>
              <dt className="text-muted-foreground">Evidence references</dt><dd><HashList values={t.evidencePointers} /></dd>
            </dl>

            <section aria-labelledby="gsr-actions" className="mt-6 space-y-3">
              <h3 id="gsr-actions" className="font-semibold">Review actions</h3>
              {canTriage ? <TriageForm key={row.key} row={row} onRecorded={onRecorded} /> : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(ACTION_LABEL) as TriageAction[]).map((a) => <Button key={a} variant="outline" disabled aria-describedby="gsr-actions-reason">{ACTION_LABEL[a]}</Button>)}
                  </div>
                  <p id="gsr-actions-reason" className="text-xs text-muted-foreground">{triageNote || NO_GRANT_REASON}</p>
                </>
              )}
              <div className="space-y-2 rounded-md border border-border p-3">
                <p className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" aria-hidden /> Scientific approval: blocked</p>
                <p className="text-xs text-muted-foreground">Requires independent scientific authorization, verified source validation and reviewer qualification. Triage acceptance is not scientific approval.</p>
                <p className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4" aria-hidden /> Catalog activation: blocked</p>
                <p className="text-xs text-muted-foreground">Catalog promotion and metric activation follow a separate governed process; nothing here changes the catalog.</p>
              </div>
            </section>

            <details className="mt-6 rounded-md border border-border p-3 text-xs">
              <summary className="cursor-pointer font-medium">Technical identifiers</summary>
              <dl className="mt-2 grid grid-cols-[8rem_1fr] gap-1">
                <dt className="text-muted-foreground">Term ID</dt><dd className="break-all font-mono">{t.termId}</dd>
                <dt className="text-muted-foreground">Submission ID</dt><dd className="break-all font-mono">{s.submissionId}</dd>
                <dt className="text-muted-foreground">Mission ID</dt><dd className="break-all font-mono">{s.missionId}</dd>
                <dt className="text-muted-foreground">Receipt SHA-256</dt><dd className="break-all font-mono">{s.payloadSha256}</dd>
                <dt className="text-muted-foreground">Access basis</dt><dd>{BASIS_LABEL[s.accessBasis]}</dd>
              </dl>
            </details>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function P36GlobalReviewPanel() {
  const listMissions = useServerFn(listGlobalReviewMissions);
  const listSubmissions = useServerFn(listGlobalReviewSubmissions);
  const [missions, setMissions] = useState<GlobalReviewMission[]>([]);
  const [missionState, setMissionState] = useState<"loading" | "ready" | "error">("loading");
  const [missionMessage, setMissionMessage] = useState("");
  const [selection, setSelection] = useState("");
  const [submissions, setSubmissions] = useState<GlobalReviewSubmission[]>([]);
  const [subState, setSubState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [subMessage, setSubMessage] = useState("");
  const [crew, setCrew] = useState(ALL_CREWS);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<ReviewState | "all">("all");
  const [classification, setClassification] = useState("all");
  const [sort, setSort] = useState<TermSort>("label");
  const [page, setPage] = useState(1);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [triageEvents, setTriageEvents] = useState<TriageEvent[]>([]);
  const [canTriage, setCanTriage] = useState(false);
  const [triageNote, setTriageNote] = useState("");
  const listTriage = useServerFn(listGlobalTriage);
  const epoch = useRef(0);

  useEffect(() => {
    let live = true;
    listMissions({ data: { provenance: "synthetic" } })
      .then((r) => {
        if (!live) return;
        if (!r.ok) { setMissionState("error"); setMissionMessage(r.message); return; }
        setMissions(r.missions);
        setMissionState("ready");
        if (r.missions.length === 1 && r.missions[0]) setSelection(r.missions[0].missionId);
      })
      .catch(() => { if (live) { setMissionState("error"); setMissionMessage("Sign in with an authorized Researcher account to view submitted metadata."); } });
    return () => { live = false; };
  }, [listMissions]);

  const loadTriage = useCallback(async (targets: GlobalReviewMission[], mine: number) => {
    const events: TriageEvent[] = []; let can = targets.length > 0; let note = "";
    for (const m of targets) {
      const r = await listTriage({ data: { missionId: m.missionId, provenance: "synthetic" } }).catch(() => null);
      if (mine !== epoch.current) return;
      if (!r || !r.ok) { can = false; note = r?.message ?? "Triage history could not be read. Nothing was recorded."; continue; }
      events.push(...r.events); can = can && r.canTriage;
    }
    setTriageEvents(events); setCanTriage(can); setTriageNote(note);
  }, [listTriage]);

  const load = useCallback(async (value: string) => {
    const mine = ++epoch.current;
    setSubmissions([]); setCrew(ALL_CREWS); setPage(1); setDetailKey(null); setTriageEvents([]); setCanTriage(false); setTriageNote("");
    const targets = missionsForSelection(missions, value);
    if (!targets.length) { setSubState("idle"); return; }
    setSubState("loading");
    const all: GlobalReviewSubmission[] = [];
    for (const m of targets) {
      const r = await listSubmissions({ data: { missionId: m.missionId, provenance: "synthetic" } }).catch(() => null);
      if (mine !== epoch.current) return;
      if (!r || !r.ok) { setSubState("error"); setSubMessage(r?.message ?? "Submitted metadata could not be read. Nothing is shown."); return; }
      all.push(...r.submissions);
    }
    await loadTriage(targets, mine);
    if (mine !== epoch.current) return;
    setSubmissions(all);
    setSubState("ready");
  }, [missions, listSubmissions, loadTriage]);
  const refreshTriage = useCallback(async () => { await loadTriage(missionsForSelection(missions, selection), epoch.current); }, [loadTriage, missions, selection]);

  useEffect(() => { if (selection) void load(selection); }, [selection, load]);
  useEffect(() => { setPage(1); }, [crew, query, state, classification, sort]);

  const rows = useMemo(() => flattenTerms(submissions, latestTriageByTerm(triageEvents)), [submissions, triageEvents]);
  const detail = useMemo(() => rows.find((r) => r.key === detailKey) ?? null, [rows, detailKey]);
  const detailHistory = useMemo(() => (detail ? triageEvents.filter((e) => `${e.submissionId}:${e.termId}` === detail.key) : []), [detail, triageEvents]);
  const crews = useMemo(() => crewOptions(submissions), [submissions]);
  const classifications = useMemo(() => [...new Set(rows.map((r) => r.term.classification))].sort(), [rows]);
  const scoped = useMemo(() => filterTerms(rows, { query: "", crew, state: "all", classification: "all" }), [rows, crew]);
  const counts = useMemo(() => dashboardCounts(scoped), [scoped]);
  const visible = useMemo(() => sortTerms(filterTerms(rows, { query, crew, state, classification }), sort), [rows, query, crew, state, classification, sort]);
  const paged = paginate(visible, page, PAGE_SIZE);
  const receipts = useMemo(() => new Set(scoped.map((r) => r.submission.submissionId)).size, [scoped]);

  const allowAll = canChooseAllMissions(missions);
  const missionOptions: ComboOption[] = [
    ...(allowAll ? [{ value: ALL_MISSIONS, search: "all authorized missions", title: "All authorized missions", badge: `${missions.reduce((n, m) => n + m.pendingTermCount, 0)} pending` }] : []),
    ...missions.map((m) => ({ value: m.missionId, search: `${m.missionName} ${m.missionCode}`, title: m.missionName, subtitle: `${m.missionCode} · ${BASIS_LABEL[m.accessBasis]}`, badge: `${m.pendingTermCount} pending` })),
  ];
  const selectedMission = missions.find((m) => m.missionId === selection);
  const missionText = selection === ALL_MISSIONS ? "All authorized missions" : selectedMission ? `${selectedMission.missionName} (${selectedMission.missionCode})` : "Choose a mission";
  const crewOptionList: ComboOption[] = [
    { value: ALL_CREWS, search: "all permitted crew", title: "All permitted crew", badge: `${rows.length} terms` },
    ...crews.map((c) => ({ value: c.crewPseudonym, search: c.crewPseudonym, title: c.crewPseudonym, subtitle: "Mission-specific pseudonym", badge: `${c.termCount} terms` })),
  ];

  return (
    <section aria-labelledby="p36-global-review-heading" className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm">
      <div className="space-y-1">
        <h2 id="p36-global-review-heading" className="text-lg font-semibold">Global scientific review — cloud-submitted metadata</h2>
        <p className="text-muted-foreground">
          Read-only. Synthetic submissions only; crew appear as mission-specific pseudonyms. No measurements, documents or encrypted local evidence are shown.
          Device-local requests, documentary dossiers and governed decisions are listed separately on this page and are not part of these totals.
        </p>
      </div>

      {missionState === "loading" ? <p role="status" className="text-muted-foreground">Checking which missions this account may review…</p> : null}
      {missionState === "error" ? <p role="status" className="text-muted-foreground">{missionMessage}</p> : null}
      {missionState === "ready" && !missions.length ? (
        <p role="status" className="text-muted-foreground">This account has no mission available for scientific review. No access was broadened.</p>
      ) : null}
      {missionState === "ready" && missions.length ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <ComboBox label="Mission for scientific review" placeholder="Search mission name or code…" empty="No authorized mission matches."
            options={missionOptions} value={selection} onChange={setSelection} triggerText={missionText} />
          {subState === "ready" && crews.length ? (
            <ComboBox label="Crew scope" placeholder="Search crew pseudonym…" empty="No permitted crew matches."
              options={crewOptionList} value={crew} onChange={setCrew} triggerText={crew === ALL_CREWS ? "All permitted crew" : crew} />
          ) : null}
        </div>
      ) : null}

      {subState === "loading" ? <p role="status" className="text-muted-foreground">Reading submitted metadata…</p> : null}
      {subState === "error" ? <p role="alert" className="text-destructive">{subMessage}</p> : null}
      {subState === "ready" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5" aria-label="Cloud-submitted metadata summary">
            <Stat label="Submission receipts" value={receipts} />
            <Stat label="Submitted metadata terms" value={counts.submittedTerms} />
            <Stat label="Pending scientific decision" value={counts.pending} />
            <Stat label="Awaiting triage" value={counts.awaitingTriage} />
            <Stat label="Accepted for review" value={counts.accepted} note="Triage only — not approval" />
            <Stat label="More evidence requested" value={counts.moreEvidence} />
            <Stat label="Review requests rejected" value={counts.rejected} />
            <Stat label="Scientifically approved" value={counts.approved} note="Only through independent authorization" />
            <Stat label="Activation-blocked" value={counts.activationBlocked} note="Catalog activation is separately governed" />
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <Input aria-label="Search submitted terms" placeholder="Search label, unit, candidate, term or request…" value={query}
              onChange={(e) => setQuery(e.target.value)} className="md:w-80" />
            <Select value={state} onValueChange={(v) => setState(v as ReviewState | "all")}>
              <SelectTrigger aria-label="Review state" className="md:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All review states</SelectItem>
                {(Object.keys(REVIEW_STATE_LABEL) as ReviewState[]).map((k) => <SelectItem key={k} value={k}>{REVIEW_STATE_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger aria-label="Classification" className="md:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classifications</SelectItem>
                {classifications.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as TermSort)}>
              <SelectTrigger aria-label="Sort by" className="md:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="label">Sort: label</SelectItem>
                <SelectItem value="unit">Sort: unit</SelectItem>
                <SelectItem value="received">Sort: received</SelectItem>
                <SelectItem value="term">Sort: term ID</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p role="status" className="font-medium">{visible.length} of {scoped.length} terms shown</p>
          {!visible.length ? <p className="text-muted-foreground">No submitted terms match these filters.</p> : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[44rem] text-left text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2">Biomarker label</th><th className="p-2">Exact unit</th><th className="p-2">Classification</th>
                    <th className="p-2">Mission · crew</th><th className="p-2">Receipt</th><th className="p-2">Triage</th><th className="p-2"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((r) => (
                    <tr key={r.key} className="border-t border-border">
                      <td className="p-2">{r.term.originalLabels.join(" · ")}</td>
                      <td className="p-2">{r.term.exactUnit}</td>
                      <td className="p-2">{r.term.classification}</td>
                      <td className="p-2">{r.submission.missionCode}<span className="block font-mono text-muted-foreground">{r.submission.crewPseudonym}</span></td>
                      <td className="p-2 font-mono">{r.submission.requestId}</td>
                      <td className="p-2"><Badge variant="secondary">{REVIEW_STATE_LABEL[r.state]}</Badge></td>
                      <td className="p-2"><Button size="sm" variant="ghost" onClick={() => setDetailKey(r.key)}>Review</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {paged.pages > 1 ? (
            <nav aria-label="Submitted terms pages" className="flex items-center justify-between gap-2">
              <Button variant="outline" size="sm" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)}>Previous</Button>
              <span className="tabular-nums">Page {paged.page} of {paged.pages}</span>
              <Button variant="outline" size="sm" disabled={paged.page >= paged.pages} onClick={() => setPage(paged.page + 1)}>Next</Button>
            </nav>
          ) : null}
        </div>
      ) : null}
      <TermDetail row={detail} onClose={() => setDetailKey(null)} canTriage={canTriage} triageNote={triageNote} history={detailHistory} onRecorded={refreshTriage} />
    </section>
  );
}
