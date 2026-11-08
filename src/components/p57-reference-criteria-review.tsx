import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import {
  CRITERION_KIND_LABELS,
  bandRangeText,
  bundledCriteriaRegistry,
  registryOverview,
  sourceOf,
  type ReferenceCriterion,
} from "@/domain/health-intelligence/p57-reference-criteria";
import {
  CRITERIA_APPROVAL_ACKNOWLEDGEMENT,
  CRITERION_STATUS_LABELS,
  planCriteriaAttestations,
  planCriteriaDecisions,
  type CriteriaDecision,
} from "@/domain/health-intelligence/p57-criteria-review";
import { RESEARCHER_DOMAIN_LABELS, type ResearcherDomain } from "@/domain/health-intelligence/researcher-interpretation";
import { notifyCriteriaChanged, useCriteriaResolution } from "@/hooks/use-approved-criteria";
import { attestReferenceCriteriaDecisions } from "@/lib/reference-criteria.functions";

export const CRITERIA_REVIEW_ANCHOR = "reference-criteria-review";
export const CRITERIA_REVIEW_HEADING = "Reference Criteria Review (P57)";

function CriterionDetails({ c }: { c: ReferenceCriterion }) {
  const s = sourceOf(c);
  return (
    <div className="mt-2 space-y-2 text-xs">
      <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
        <dt className="font-medium">Identity</dt>
        <dd className="break-words">{c.identity.catalogId ?? "No exact catalog identity"} · {c.identity.catalogName} · exact unit {c.identity.unit}</dd>
        <dt className="font-medium">Population</dt>
        <dd className="break-words">{c.population}{c.demographicConditions.length ? ` (${c.demographicConditions.join("; ")})` : ""}</dd>
        <dt className="font-medium">Specimen / method</dt>
        <dd className="break-words">{c.specimen ?? "not specified"} · {c.method ?? "not specified"}</dd>
        <dt className="font-medium">Bands</dt>
        <dd>
          <ul className="list-disc pl-4">
            {c.bands.map((b) => (
              <li key={b.id} className="break-words">
                <span className="font-medium">{b.label}</span>: {bandRangeText(b, c.identity.unit)} — {b.meaning}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">Uncovered values: {c.uncoveredMeaning}</p>
        </dd>
        <dt className="font-medium">Mission-level requirements</dt>
        <dd className="break-words">{c.applicability.missionLevel.map((x) => x.text).join("; ") || "None"}</dd>
        <dt className="font-medium">Per-observation requirements</dt>
        <dd className="break-words">{c.applicability.perObservation.map((x) => x.text).join("; ") || "None"}</dd>
        <dt className="font-medium">Confirmation</dt>
        <dd className="break-words">{c.confirmation}</dd>
        <dt className="font-medium">Limitations</dt>
        <dd><ul className="list-disc pl-4">{c.limitations.map((l) => <li key={l} className="break-words">{l}</li>)}</ul></dd>
        <dt className="font-medium">Astronaut applicability</dt>
        <dd className="break-words">{c.astronautNote}</dd>
        <dt className="font-medium">Source</dt>
        <dd className="break-words">
          {s ? (
            <>
              {s.organization} — {s.title} ({s.publicationDate}), {c.source.locator}.{" "}
              <a href={s.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">Open source</a>
              {s.doi ? ` · DOI ${s.doi}` : ""}
            </>
          ) : (
            c.source.sourceId
          )}
          <blockquote className="mt-1 border-l-2 border-border pl-2 italic text-muted-foreground">“{c.source.quote}”</blockquote>
          <span className="text-muted-foreground">Evidence quality: {c.evidenceQuality}. Wording retrieved {c.sourceVerification.retrievedAt} ({c.sourceVerification.method}); this is not a Researcher approval.</span>
        </dd>
      </dl>
    </div>
  );
}

/**
 * P57 Researcher review of candidate reference criteria. Decisions are recorded
 * in the encrypted device ledger and apply to reports only after the server
 * attests them for missions where the caller is an active Researcher.
 */
export function ReferenceCriteriaReview() {
  const registry = bundledCriteriaRegistry();
  const overview = registryOverview(registry);
  const { resolution, state, reload } = useCriteriaResolution();
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<CriteriaDecision>("APPROVE");
  const [missionId, setMissionId] = useState("");
  const [conditions, setConditions] = useState<Set<string>>(new Set());
  const [ack, setAck] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const attestFn = useServerFn(attestReferenceCriteriaDecisions);

  useEffect(() => {
    let live = true;
    const refresh = () => void loadMissionIdentity().then((v) => live && setIdentity(v)).catch(() => live && setIdentity(null));
    refresh();
    const unsub = subscribeMissionIdentity(refresh);
    return () => {
      live = false;
      unsub();
    };
  }, []);

  const researcherMissions = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of identity?.memberships ?? []) if (x.role === "researcher") m.set(x.missionId, x.missionName ?? x.missionCode ?? x.missionId);
    return [...m];
  }, [identity]);
  useEffect(() => {
    if (!missionId && researcherMissions.length) setMissionId(researcherMissions[0]![0]);
  }, [researcherMissions, missionId]);

  const isResearcher = researcherMissions.length > 0;
  const stateOf = (id: string) => resolution.states.find((s) => s.criterionId === id);
  const selectedCriteria = registry.criteria.filter((c) => selected.has(c.id));
  const neededConditions = [...new Map(selectedCriteria.flatMap((c) => c.applicability.missionLevel).map((x) => [x.id, x.text])).entries()];
  const domains = [...new Set(registry.criteria.map((c) => c.domain))];
  const eligible = (c: ReferenceCriterion) => {
    const s = stateOf(c.id);
    if (!s) return false;
    if (action === "APPROVE") return !s.blocker && s.status !== "APPROVED" && s.status !== "APPROVED_AWAITING_ATTESTATION";
    if (action === "REVOKE") return s.status === "APPROVED" || s.status === "APPROVED_AWAITING_ATTESTATION";
    return s.status !== "REJECTED";
  };
  const toggle = (id: string) => setSelected((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const record = async () => {
    if (busy) return;
    setBusy(true);
    setStatus("Checking your Researcher membership…");
    try {
      const fresh = await loadMissionIdentity();
      if (!fresh.signedIn || !fresh.userId) throw new Error("Sign in again before recording a decision.");
      const missions = [...new Set(fresh.memberships.filter((m) => m.role === "researcher").map((m) => m.missionId))];
      const { listCriteriaEvents, appendCriteriaEvents } = await import("@/domain/health-intelligence/p57-criteria-ledger");
      const existing = await listCriteriaEvents();
      const plan = await planCriteriaDecisions(registry, existing, resolution, { userId: fresh.userId, researcherMissions: missions, now: new Date().toISOString() }, {
        action,
        criterionIds: [...selected],
        missions: action === "APPROVE" ? [{ missionId, conditions: [...conditions] }] : [],
        acknowledgement: ack ? CRITERIA_APPROVAL_ACKNOWLEDGEMENT : "",
        note,
        batchId: `p57-${Date.now().toString(36)}`,
      });
      if (!plan.ok) throw new Error(plan.reason);
      if (!plan.events.length) throw new Error(`Nothing to record: ${plan.skipped.map((s) => `${s.criterionId} (${s.reason})`).join("; ")}.`);
      await appendCriteriaEvents(plan.events);
      setStatus("Decision recorded on this device. Requesting server attestation…");
      const res = await attestFn({ data: { events: plan.events as unknown as Record<string, unknown>[] } });
      let attestedNote = "";
      if (!res.ok) attestedNote = ` Not attested: ${res.message}`;
      else {
        const after = await listCriteriaEvents();
        const att = await planCriteriaAttestations(after, res.attestations, { userId: fresh.userId, now: new Date().toISOString() });
        if (att.events.length) await appendCriteriaEvents(att.events);
        attestedNote = ` Server-attested: ${att.events.length}.${res.failures.length ? ` Refused: ${res.failures.map((f) => f.reason).join("; ")}.` : ""}${att.rejected.length ? ` Not trusted: ${att.rejected.map((r) => r.reason).join("; ")}.` : ""}`;
      }
      notifyCriteriaChanged();
      reload();
      setSelected(new Set());
      setAck(false);
      setNote("");
      setStatus(`${action} recorded for ${plan.events.length} criterion/criteria${plan.skipped.length ? `; skipped ${plan.skipped.map((s) => `${s.criterionId} (${s.reason})`).join("; ")}` : ""}.${attestedNote}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "The decision could not be recorded. Nothing was changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id={CRITERIA_REVIEW_ANCHOR} aria-label={CRITERIA_REVIEW_HEADING} className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-5" data-testid="p57-criteria-review">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold">{CRITERIA_REVIEW_HEADING}</h2>
        <p className="text-sm text-muted-foreground">
          Candidate reference intervals, diagnostic thresholds, risk categories and action thresholds retrieved from published guidance for exact catalog IDs and units.
          None is applied to any report until an active Researcher approves its exact version for a mission, attests the mission-level requirements, and the server attests the decision.
          Criterion kinds are never interchangeable and longitudinal review rules never set clinical colour.
        </p>
        <p className="text-xs text-muted-foreground">
          Registry v{overview.version}: {overview.criteria} candidate criteria from {overview.sources} sources ({overview.withCatalogIdentity} with exact catalog identity, {overview.withoutCatalogIdentity} without) ·
          approved and applied: {resolution.approved.length} · {state === "loading" ? "loading device decisions…" : state === "error" ? "device decisions could not be read; nothing is applied" : "device decisions verified"}
          {!resolution.chainOk ? ` · integrity check failed (${resolution.problem}); nothing is applied` : ""}
        </p>
      </header>

      {domains.map((d) => {
        const items = registry.criteria.filter((c) => c.domain === d);
        return (
          <div key={d} className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{RESEARCHER_DOMAIN_LABELS[d as ResearcherDomain] ?? d}</h3>
              {isResearcher ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setSelected((cur) => new Set([...cur, ...items.filter(eligible).map((c) => c.id)]))}>
                  Select all eligible in this domain
                </Button>
              ) : null}
            </div>
            <ul className="space-y-2">
              {items.map((c) => {
                const s = stateOf(c.id);
                return (
                  <li key={c.id} className="rounded-md border border-border p-2" data-testid="p57-criterion" data-status={s?.status ?? "unknown"}>
                    <div className="flex flex-wrap items-start gap-2">
                      {isResearcher ? (
                        <Checkbox
                          checked={selected.has(c.id)}
                          disabled={!eligible(c)}
                          onCheckedChange={() => toggle(c.id)}
                          aria-label={`Select ${c.title}`}
                          className="mt-0.5"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium">{c.title}</p>
                        <p className="break-words text-xs text-muted-foreground">
                          {CRITERION_KIND_LABELS[c.kind]} · {c.identity.catalogId ?? "no catalog identity"} · {c.identity.unit} · {sourceOf(c)?.organization ?? c.source.sourceId} ·{" "}
                          <span className="font-semibold text-foreground">{s ? CRITERION_STATUS_LABELS[s.status] : "Unknown"}</span>
                          {s?.blocker ? ` — ${s.blocker}` : ""}
                          {s?.missions.length ? ` · missions: ${s.missions.map((m) => m.missionId).join(", ")}` : ""}
                        </p>
                        <details className="text-xs">
                          <summary className="cursor-pointer text-primary">Source, bands and applicability</summary>
                          <CriterionDetails c={c} />
                        </details>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {isResearcher ? (
        <div className="space-y-3 rounded-lg border border-border p-4" aria-label="Record criteria decision">
          <h3 className="font-semibold">Record decision ({selected.size} selected)</h3>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Decision">
            {(["APPROVE", "REJECT", "REVOKE"] as const).map((a) => (
              <Button key={a} type="button" size="sm" variant={action === a ? "default" : "outline"} aria-pressed={action === a} onClick={() => { setAction(a); setSelected(new Set()); }}>
                {a === "APPROVE" ? "Approve" : a === "REJECT" ? "Reject" : "Revoke approval"}
              </Button>
            ))}
          </div>
          {action === "APPROVE" ? (
            <div className="space-y-2 text-sm">
              <label className="block" htmlFor="p57-mission">Mission this approval applies to</label>
              <select id="p57-mission" className="w-full rounded border border-border bg-background p-2" value={missionId} onChange={(e) => setMissionId(e.target.value)}>
                {researcherMissions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              {neededConditions.length ? (
                <fieldset className="space-y-1">
                  <legend className="font-medium">Mission-level requirements you attest for this mission</legend>
                  {neededConditions.map(([id, text]) => (
                    <label key={id} className="flex items-start gap-2 text-xs">
                      <Checkbox checked={conditions.has(id)} onCheckedChange={() => setConditions((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; })} className="mt-0.5" />
                      <span className="break-words">{text}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <label className="flex items-start gap-2 text-xs">
                <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
                <span className="break-words">{CRITERIA_APPROVAL_ACKNOWLEDGEMENT}.</span>
              </label>
            </div>
          ) : null}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (required): what you compared and any exceptions." aria-label="Review note" />
          <Button type="button" onClick={() => void record()} disabled={busy || !selected.size}>
            {busy ? "Recording…" : `Record ${action === "APPROVE" ? "approval" : action === "REJECT" ? "rejection" : "revocation"}`}
          </Button>
          {status ? <p className="break-words text-sm" role="status">{status}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Only an active Researcher can record reference-criteria decisions. Candidate criteria are shown for transparency and are not applied.</p>
      )}
    </section>
  );
}
