/**
 * P61.4 — Researcher workflow for the held P61.3 mapping proposals on /mission/scientific-review.
 * Reads the existing caller-scoped lifecycle (global review submissions, triage chain, synthetic demo
 * decisions/activations) and this device's verified signed demo catalog; records decisions only through
 * the existing triage and synthetic demo decision server functions. Activation stays on the Ground
 * Medical console. Nothing here saves observations or approves anything for real data.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { appendGlobalTriage, listGlobalReviewMissions, listGlobalReviewSubmissions, listGlobalTriage } from "@/lib/p36-global-review.functions";
import { getSyntheticDemoLifecycle, recordSyntheticDemoDecisionFn } from "@/lib/p37-synthetic-demo.functions";
import type { GlobalReviewMission } from "@/lib/p36-global-review.server";
import { getSyntheticDemoCatalogs, subscribeSyntheticDemoCatalogs } from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { MAPPING_CATEGORY_LABELS } from "@/domain/health-intelligence/p613-mapping-decision-register";
import {
  DECISION_LABELS,
  EVIDENCE_BASIS_LABELS,
  MAPPING_SAFEGUARDS,
  NEXT_ROLE_LABELS,
  P614_SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  REQUIREMENT_LABELS,
  mappingGovernanceStatus,
  preflightMappingDecision,
  provisionalRuleViews,
  registerEntryFor,
  type DecisionDraft,
  type EvidenceBasis,
  type GovernanceInputs,
  type MappingGovernanceStatus,
  type MappingSafeguard,
  type RequirementId,
  type ResearcherDecision,
} from "@/domain/health-intelligence/p614-mapping-governance";
import type { HealthDomainId } from "@/domain/health-domains/registry";

export const MAPPING_GOVERNANCE_ANCHOR = "p614-mapping-governance";
export const MAPPING_GOVERNANCE_HEADING = "Held biomarker mapping decisions (P61.4)";
const DOMAINS: [HealthDomainId, string][] = [["cardiovascular", "Cardiovascular"], ["bone", "Bone"], ["immune", "Immune"], ["behavioral", "Behavioral"]];
const select = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";

export function MappingApprovalDistinction() {
  return (
    <p className="rounded-md border border-border bg-muted/40 p-3 text-xs" data-testid="p614-distinction">
      <span className="font-medium">Three separate steps.</span> A Researcher&apos;s <span className="font-medium">mapping approval</span> decides
      how a reported name and unit are recognized in later imports. <span className="font-medium">Ground Medical activation</span> makes an
      approved mapping active for the mission. <span className="font-medium">Ground Medical attestation</span> (Medical Report) confirms one
      saved observation. None of them implies another, and none is a clinical or production scientific approval.
    </p>
  );
}

function who(byCaller: boolean | null, role: string) {
  return byCaller === true ? `${role} (you)` : byCaller === false ? `${role} (another authorized account)` : role;
}

function History({ status }: { status: MappingGovernanceStatus }) {
  if (!status.history.length) return <p className="text-xs text-muted-foreground">No decisions recorded yet.</p>;
  return (
    <ol className="space-y-1 text-xs" data-testid="p614-history">
      {status.history.map((h, i) => (
        <li key={`${h.at}-${i}`} className="border-l-2 border-border pl-2">
          <span className="font-medium">v{i + 1} · {h.action}</span> · {who(h.byCaller, h.role)} · <span className="tabular-nums">{h.at}</span>
          {h.detail ? <span className="block break-words text-muted-foreground">{h.detail}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function DecisionForm(props: { sg: MappingSafeguard; status: MappingGovernanceStatus; missionId: string; canDecide: boolean; onDone: () => Promise<void> }) {
  const { sg, status } = props;
  const triage = useServerFn(appendGlobalTriage);
  const decide = useServerFn(recordSyntheticDemoDecisionFn);
  const [decision, setDecision] = useState<ResearcherDecision>("DEFER");
  const [definitionId, setDefinitionId] = useState<string>("");
  const [domain, setDomain] = useState<HealthDomainId>(sg.defaultDomain);
  const [evidence, setEvidence] = useState<DecisionDraft["evidence"]>({});
  const [requests, setRequests] = useState<RequirementId[]>([]);
  const [rationale, setRationale] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [keys] = useState(() => ({ triage: crypto.randomUUID(), decide: crypto.randomUUID() }));
  const def = sg.definitions.find((d) => d.id === definitionId) ?? null;
  const allReqs = [...new Set(sg.definitions.flatMap((d) => d.requires))];
  const draft: DecisionDraft = { decision, definitionId: definitionId || null, domain, evidence, rationale, evidenceRequests: requests, acknowledged: ack, provenance: "synthetic" };
  const pre = preflightMappingDecision(sg, status, draft, { canDecide: props.canDecide });
  const id = (s: string) => `p614-${sg.registerId}-${s}`;

  const submit = async () => {
    if (!pre.ok || !pre.steps.length) return;
    setBusy(true);
    setMsg(null);
    try {
      for (const step of pre.steps) {
        const r =
          step.kind === "triage"
            ? await triage({ data: { missionId: props.missionId, provenance: "synthetic", submissionId: step.submissionId, termId: step.termId, action: step.action, reason: step.reason, evidenceRequirements: step.evidenceRequirements, expectedPreviousEventId: step.expectedPreviousEventId, idempotencyKey: keys.triage } })
            : await decide({ data: { missionId: props.missionId, submissionId: step.submissionId, termId: step.termId, displayName: step.displayName, domain: step.domain, acknowledgement: P614_SYNTHETIC_DEMO_ACKNOWLEDGEMENT, idempotencyKey: keys.decide } });
        if (!r.ok) {
          setMsg({ ok: false, text: r.message });
          await props.onDone();
          return;
        }
      }
      setMsg({ ok: true, text: `${pre.summary} Recorded.` });
      await props.onDone();
    } catch {
      setMsg({ ok: false, text: "Nothing further was recorded. Reload and try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <fieldset className="space-y-3 rounded-md border border-dashed border-border p-3" data-testid="p614-decision-form">
      <legend className="px-1 text-sm font-semibold">Researcher decision</legend>
      {!props.canDecide ? (
        <p role="status" className="text-xs text-muted-foreground">
          Only an authorized Researcher (scientific approver grant with review access to this mission) can record a decision. You can read the proposal and history.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3 text-sm" role="radiogroup" aria-label="Decision">
        {(Object.keys(DECISION_LABELS) as ResearcherDecision[]).map((d) => (
          <label key={d} className="flex items-center gap-1.5">
            <input type="radio" name={id("decision")} checked={decision === d} onChange={() => setDecision(d)} disabled={busy} />
            {DECISION_LABELS[d]}
          </label>
        ))}
      </div>
      {decision === "APPROVE" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={id("def")}>Measurement definition (closed list)</Label>
            <select id={id("def")} className={select} value={definitionId} onChange={(e) => setDefinitionId(e.target.value)} disabled={busy}>
              <option value="">Choose…</option>
              {sg.definitions.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            {def ? <p className="text-xs text-muted-foreground">Recorded name: “{def.displayName}” · unit {sg.reportedUnit} (as reported, never converted)</p> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("domain")}>Scientific domain</Label>
            <select id={id("domain")} className={select} value={domain} onChange={(e) => setDomain(e.target.value as HealthDomainId)} disabled={busy}>
              {DOMAINS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          {def?.requires.map((r) => (
            <div key={r} className="space-y-1 sm:col-span-2">
              <Label htmlFor={id(`ev-${r}`)}>{REQUIREMENT_LABELS[r]} — evidence</Label>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                <select
                  id={id(`ev-${r}`)}
                  className={select}
                  value={evidence[r]?.basis ?? "NOT_PROVIDED"}
                  onChange={(e) => setEvidence({ ...evidence, [r]: { basis: e.target.value as EvidenceBasis, citation: evidence[r]?.citation ?? "" } })}
                  disabled={busy}
                >
                  {(Object.keys(EVIDENCE_BASIS_LABELS) as EvidenceBasis[]).map((b) => (
                    <option key={b} value={b}>{EVIDENCE_BASIS_LABELS[b]}</option>
                  ))}
                </select>
                <Input
                  aria-label={`${REQUIREMENT_LABELS[r]} citation`}
                  placeholder="Citation (document page/line, or receipt reference)"
                  value={evidence[r]?.citation ?? ""}
                  maxLength={300}
                  onChange={(e) => setEvidence({ ...evidence, [r]: { basis: evidence[r]?.basis ?? "NOT_PROVIDED", citation: e.target.value } })}
                  disabled={busy}
                />
              </div>
            </div>
          ))}
          <label className="flex items-start gap-2 text-xs sm:col-span-2">
            <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={busy} />
            <span>I acknowledge: {P614_SYNTHETIC_DEMO_ACKNOWLEDGEMENT}. This applies to synthetic data of this mission only and recognizes nothing until Ground Medical activates it.</span>
          </label>
        </div>
      ) : null}
      {decision === "REQUEST_EVIDENCE" ? (
        <div className="flex flex-wrap gap-3 text-sm">
          {allReqs.map((r) => (
            <label key={r} className="flex items-center gap-1.5">
              <input type="checkbox" checked={requests.includes(r)} onChange={(e) => setRequests(e.target.checked ? [...requests, r] : requests.filter((x) => x !== r))} disabled={busy} />
              {REQUIREMENT_LABELS[r]}
            </label>
          ))}
        </div>
      ) : null}
      {decision !== "DEFER" ? (
        <div className="space-y-1">
          <Label htmlFor={id("rationale")}>Rationale (recorded with the decision)</Label>
          <Textarea id={id("rationale")} value={rationale} maxLength={1200} onChange={(e) => setRationale(e.target.value)} disabled={busy} rows={3} />
        </div>
      ) : null}
      {pre.ok ? (
        <p className="text-xs text-muted-foreground" data-testid="p614-preflight-ok">{pre.summary}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-destructive" data-testid="p614-preflight-problems">
          {pre.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <Button type="button" size="sm" disabled={busy || !pre.ok || !pre.steps.length} onClick={() => void submit()}>
        {decision === "DEFER" ? "Deferred — nothing to record" : "Record decision"}
      </Button>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs" : "text-xs text-destructive"}>{msg.text}</p>
      ) : null}
    </fieldset>
  );
}

function ProposalCard(props: { sg: MappingSafeguard; status: MappingGovernanceStatus; missionId: string; canDecide: boolean; onDone: () => Promise<void> }) {
  const { sg, status } = props;
  const reg = registerEntryFor(sg);
  return (
    <li id={`p614-${sg.registerId}`} className="scroll-mt-24 space-y-3 rounded-md border border-border p-3 text-sm" data-testid="p614-proposal">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{sg.label} <span className="font-normal text-muted-foreground">· {sg.reportedUnit}</span></span>
        <Badge variant={status.eligible ? "secondary" : "outline"} className={status.eligible ? "" : "border-destructive text-destructive"}>
          {status.eligible ? "Approved and activated" : "Held — not saved"}
        </Badge>
        <Badge variant="outline" data-testid="p614-stage">{status.label}</Badge>
      </div>
      <p className="text-xs"><span className="font-medium">Next:</span> {NEXT_ROLE_LABELS[status.nextRole]} — {status.nextStep}</p>
      <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
        <dt className="font-medium">Reported</dt>
        <dd>{sg.label} · {sg.reportedUnit} (original name and unit, kept verbatim)</dd>
        <dt className="font-medium">Proposed identity</dt>
        <dd className="break-words">{reg ? `${reg.proposal.catalogName}${reg.proposal.catalogId ? ` (${reg.proposal.catalogId})` : " — new definition"} · domain ${reg.proposal.domain ?? "to be decided"}` : "—"}</dd>
        <dt className="font-medium">Existing catalog candidates</dt>
        <dd className="break-words">{sg.existingCandidates.length ? sg.existingCandidates.map((c) => `${c.name} (${c.id}, ${c.unit}): ${c.relation}`).join(" ") : "None — no catalog entry or reviewed alias exists."}</dd>
        <dt className="font-medium">Why held</dt>
        <dd className="break-words">{reg ? reg.categories.map((c) => MAPPING_CATEGORY_LABELS[c]).join(" · ") : "—"}</dd>
        <dt className="font-medium">Scientific safeguard</dt>
        <dd className="break-words">{sg.rule} {sg.neverEquate.join(" ")}</dd>
        <dt className="font-medium">Specimen / method</dt>
        <dd className="break-words">{reg ? `${reg.verification.specimen} ${reg.verification.method}` : "—"}</dd>
        <dt className="font-medium">Supporting evidence</dt>
        <dd className="break-words">{reg?.evidence.join(" ") ?? "—"} Source notes in the file are unverified provenance and never establish identity.</dd>
        <dt className="font-medium">Uncertainty / missing</dt>
        <dd className="break-words">{reg?.uncertainty.join(" ") || "None recorded."}</dd>
        <dt className="font-medium">Definitions offered</dt>
        <dd className="break-words">{sg.definitions.map((d) => `${d.label} (needs: ${d.requires.map((r) => REQUIREMENT_LABELS[r].toLowerCase()).join(", ")})`).join(" · ")}</dd>
      </dl>
      <div className="space-y-1">
        <h4 className="text-xs font-semibold">Versioned decision history</h4>
        <History status={status} />
        <p className="text-[11px] text-muted-foreground">Account identities are not exposed by the review ledgers; entries show the role and whether it was you.</p>
      </div>
      {status.stage === "APPROVED_AWAITING_ACTIVATION" ? (
        <p className="text-xs">
          Activation is done by a Ground Medical member of this mission (never the approver) on the{" "}
          <Link to="/mission/ground" className="font-medium text-primary underline underline-offset-4">Ground Medical console</Link>.
        </p>
      ) : null}
      <DecisionForm {...props} />
    </li>
  );
}

export function P614MappingGovernancePanel() {
  const listMissions = useServerFn(listGlobalReviewMissions);
  const listSubs = useServerFn(listGlobalReviewSubmissions);
  const listTriage = useServerFn(listGlobalTriage);
  const lifecycle = useServerFn(getSyntheticDemoLifecycle);
  const catalogs = useSyncExternalStore(subscribeSyntheticDemoCatalogs, getSyntheticDemoCatalogs, getSyntheticDemoCatalogs);
  const [missions, setMissions] = useState<GlobalReviewMission[]>([]);
  const [missionId, setMissionId] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [note, setNote] = useState("");
  const [inputs, setInputs] = useState<Omit<GovernanceInputs, "catalogs"> | null>(null);
  const [canDecide, setCanDecide] = useState(false);

  useEffect(() => {
    void listMissions({ data: { provenance: "synthetic" } })
      .then((r) => {
        if (r.ok) {
          setMissions(r.missions);
          if (r.missions.length === 1) setMissionId(r.missions[0]!.missionId);
        }
      })
      .catch(() => undefined);
  }, [listMissions]);

  const load = useCallback(async () => {
    if (!missionId) return;
    setState("loading");
    const [l, s, t] = await Promise.all([
      lifecycle({ data: { missionId } }).catch(() => null),
      listSubs({ data: { missionId, provenance: "synthetic" } }).catch(() => null),
      listTriage({ data: { missionId, provenance: "synthetic" } }).catch(() => null),
    ]);
    if (!l || !l.ok) {
      setState("error");
      setNote(l && !l.ok ? l.message : "The governance status could not be read. Nothing was changed.");
      setInputs(null);
      return;
    }
    setCanDecide(l.canDecide);
    setInputs({
      missionId,
      scopeTerms: l.terms,
      demoEvents: l.events,
      submittedTerms: s && s.ok ? s.submissions.flatMap((x) => x.terms.map((term) => ({ submissionId: x.submissionId, termId: term.termId, originalLabels: term.originalLabels, exactUnit: term.exactUnit }))) : null,
      triage: t && t.ok ? t.events : [],
    });
    setState("ready");
  }, [missionId, lifecycle, listSubs, listTriage]);
  useEffect(() => {
    void load();
  }, [load]);

  const statuses = useMemo(
    () => (inputs ? (MAPPING_SAFEGUARDS ?? []).map((sg) => ({ sg, status: mappingGovernanceStatus(sg, { ...inputs, catalogs }) })) : []),
    [inputs, catalogs],
  );
  const rules = provisionalRuleViews();

  return (
    <section id={MAPPING_GOVERNANCE_ANCHOR} aria-labelledby={`${MAPPING_GOVERNANCE_ANCHOR}-title`} className="mx-auto max-w-6xl scroll-mt-24 space-y-4 px-4 py-8 sm:px-5" data-testid="p614-mapping-governance">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${MAPPING_GOVERNANCE_ANCHOR}-title`} className="text-2xl font-semibold">{MAPPING_GOVERNANCE_HEADING}</h2>
          <Badge variant="outline">SYNTHETIC DEMO</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          The seven measurement names held at import. Decisions go only through the existing triage ledger and synthetic demonstration
          decision; activation stays with Ground Medical. Held rows become eligible only after approval and activation, on re-import,
          with explicit confirmation. Units are never converted and nothing applies to real data.
        </p>
      </div>
      <MappingApprovalDistinction />
      {!MAPPING_SAFEGUARDS ? <p role="alert" className="text-sm text-destructive">The mapping safeguards failed validation; nothing is shown.</p> : null}
      {missions.length ? (
        <div className="space-y-1">
          <Label htmlFor="p614-mission">Mission (synthetic)</Label>
          <select id="p614-mission" className={`${select} max-w-md`} value={missionId} onChange={(e) => setMissionId(e.target.value)}>
            <option value="">Choose a mission</option>
            {missions.map((m) => (
              <option key={m.missionId} value={m.missionId}>{m.missionName} ({m.missionCode})</option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sign in with a scientific review account to see the live governance status and record decisions.</p>
      )}
      {state === "loading" ? <p role="status" className="text-sm text-muted-foreground">Reading governance status…</p> : null}
      {state === "error" ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
      {state === "ready" ? (
        <>
          <Badge variant={canDecide ? "secondary" : "outline"}>{canDecide ? "You may record Researcher decisions for this mission" : "Read-only: no Researcher decision grant for this mission"}</Badge>
          <ul className="space-y-3">
            {statuses.map(({ sg, status }) => (
              <ProposalCard key={sg.registerId} sg={sg} status={status} missionId={missionId} canDecide={canDecide} onDone={load} />
            ))}
          </ul>
        </>
      ) : null}
      <div className="space-y-2" data-testid="p614-provisional-rules">
        <h3 className="text-lg font-semibold">Provisional synthetic-only rules awaiting Researcher review</h3>
        <p className="text-xs text-muted-foreground">
          Applied to synthetic demonstration data only and never to real data. They are file-governed: the app never writes or
          promotes them; approval for real-data use needs a separate governed catalog extension.
        </p>
        <ul className="space-y-1 text-sm">
          {rules.map((r) => (
            <li key={r.registerId} className="rounded-md border border-border p-2" data-testid="p614-provisional-rule">
              <span className="font-medium">{r.label}</span> · {r.reportedUnit} → {r.target}{" "}
              <Badge variant="outline" className="ml-1">{r.kind === "UNIT_NOTATION_RULE" ? "Unit notation rule (UN-1)" : "Synthetic alias (P61.2)"}</Badge>{" "}
              <Badge variant="outline">{r.status === "PENDING_RESEARCHER_CONFIRMATION" ? "Pending Researcher confirmation" : "Pending Researcher review"}</Badge>
              <span className="mt-0.5 block text-xs text-muted-foreground">Next: {NEXT_ROLE_LABELS[r.nextRole]} — {r.path}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
