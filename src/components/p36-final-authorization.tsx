/**
 * P36 final scientific authorization UI: mission-scoped cloud ledger status,
 * Researcher-only final decisions and Ground Medical / Researcher
 * recommendations. All authority is enforced by the server function and the
 * database; this UI only hides controls the caller cannot use. Nothing here
 * activates a catalog extension.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import { catalogEntryFor, type ScientificReviewDossier } from "@/domain/health-intelligence/p36-scientific-review";
import {
  ACTIVATION_GATE_LABELS,
  FINAL_ACTION_LABELS,
  SCIENTIFIC_STATUS_LABELS,
  type FinalAction,
  type ScientificStatus,
  type TermAuthorizationState,
} from "@/domain/health-intelligence/p36-scientific-authorization";
import { submitScientificAuthorization } from "@/lib/p36-scientific-authorization.functions";
import type { useP36Authorization } from "@/hooks/use-p36-authorization";

const STATUS_ORDER: ScientificStatus[] = ["PENDING_NIKOLAS_REVIEW", "MORE_EVIDENCE_REQUIRED", "SCIENTIFICALLY_REJECTED", "SCIENTIFICALLY_APPROVED"];

export function AuthorizationSummary({ auth }: { auth: ReturnType<typeof useP36Authorization> }) {
  const { missions, missionId, setMissionId, view, load, error } = auth;
  const groups = (status: ScientificStatus) => view?.terms.filter((t) => t.scientificStatus === status) ?? [];
  return (
    <section aria-label="Final scientific authorization" className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
      <h2 className="text-lg font-semibold">Final scientific authorization</h2>
      <p className="text-xs text-muted-foreground">
        Only an authorized Researcher of the selected mission can approve, reject or request more evidence. Ground Medical can submit recommendations
        (evidence) but never a final decision. An approval must reference another account's recommendation, so nobody approves a mapping they authored.
        Decisions are append-only in the cloud ledger and re-verified on every read. Reviewer qualifications and conflict declarations are recorded as
        declared; the application cannot verify credentials. Approval never activates a metric.
      </p>
      {missions.length > 1 ? (
        <select aria-label="Authority mission" className="rounded-md border border-border bg-background px-2 py-1.5" value={missionId ?? ""} onChange={(e) => setMissionId(e.target.value || null)}>
          <option value="">Choose a mission</option>
          {missions.map((m) => (
            <option key={m.missionId} value={m.missionId}>
              {m.label} ({m.roles.join(" + ")})
            </option>
          ))}
        </select>
      ) : null}
      <p role="status" className="text-xs text-muted-foreground">
        {load === "signed_out"
          ? "Sign in with a Researcher or Ground Medical membership to see final decisions. Every term is shown as pending and activation-blocked."
          : load === "no_role"
            ? "Your account has no Researcher or Ground Medical membership. Every term is shown as pending and activation-blocked."
            : load === "loading"
              ? "Reading the cloud authorization ledger…"
              : load === "migration_required" || load === "error"
                ? `${error} Every term is shown as pending and activation-blocked.`
                : !missionId
                  ? "Choose a mission to read its authorization ledger."
                  : `Cloud ledger read for ${auth.mission?.label ?? missionId} · your role: ${auth.mission?.roles.join(" + ") ?? "none"}.`}
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[...STATUS_ORDER.map((s) => [SCIENTIFIC_STATUS_LABELS[s], view?.counts[s] ?? 0] as const), ["Activation blocked", view?.counts.ACTIVATION_BLOCKED ?? 12] as const, ["Active", view?.counts.ACTIVE ?? 0] as const].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        {STATUS_ORDER.map((s) => (
          <div key={s}>
            <p className="font-medium">{SCIENTIFIC_STATUS_LABELS[s]}</p>
            <p className="break-words text-muted-foreground">{groups(s).map((t) => t.sourceLabel).join(", ") || "None"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

type Draft = {
  canonicalCatalogId: string;
  domain: string;
  specimen: string;
  method: string;
  protocol: string;
  protocolVersion: string;
  unit: string;
  sourceRefs: string;
  validationRefs: string;
  rationale: string;
  reviewerName: string;
  reviewerQualification: string;
  coi: string;
  independent: boolean;
  recommendationEventId: string;
};
const emptyDraft = (): Draft => ({
  canonicalCatalogId: "", domain: "", specimen: "", method: "", protocol: "", protocolVersion: "", unit: "", sourceRefs: "", validationRefs: "",
  rationale: "", reviewerName: "", reviewerQualification: "", coi: "", independent: false, recommendationEventId: "",
});
const splitRefs = (s: string) => s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);

export function TermAuthorizationPanel({ dossier, state, auth }: { dossier: ScientificReviewDossier; state: TermAuthorizationState | undefined; auth: ReturnType<typeof useP36Authorization> }) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const roles = auth.mission?.roles ?? [];
  const ready = auth.load === "ready" && Boolean(auth.missionId) && state?.integrity === "VERIFIED";
  const canDecide = ready && roles.includes("researcher");
  const canRecommend = ready && roles.length > 0;
  const decision = state?.latestDecision?.payload;
  const independentRecs = (state?.recommendations ?? []).filter((r) => r.payload.actorUserId !== auth.userId);

  const submit = async (kind: "recommendation" | "decision", action: "RECOMMEND" | FinalAction) => {
    if (busy || !auth.missionId) return;
    setBusy(true);
    setMessage("");
    try {
      const fresh = await loadMissionIdentity();
      if (!fresh.signedIn || !fresh.userId || fresh.userId !== auth.userId) return setMessage("Your sign-in could not be confirmed. Nothing was recorded.");
      const rec = independentRecs.find((r) => r.row.event_id === draft.recommendationEventId);
      const mapping = kind === "recommendation" || action === "APPROVE";
      const res = await submitScientificAuthorization({
        data: {
          termId: dossier.termId,
          kind,
          action,
          actorRole: kind === "decision" ? "researcher" : roles.includes("ground_medical") ? "ground_medical" : "researcher",
          authorityMissionId: auth.missionId,
          submissionId: crypto.randomUUID(),
          canonicalCatalogId: mapping ? (action === "APPROVE" ? rec?.payload.canonicalCatalogId ?? null : draft.canonicalCatalogId || null) : null,
          domain: mapping ? (action === "APPROVE" ? rec?.payload.domain ?? null : draft.domain || null) : null,
          specimenOrAcquisitionContext: draft.specimen || null,
          methodOrInstrument: draft.method || null,
          protocol: draft.protocol || null,
          protocolVersion: draft.protocolVersion || null,
          validatedUnit: mapping ? draft.unit || null : null,
          sourceRefs: splitRefs(draft.sourceRefs),
          validationEvidenceRefs: splitRefs(draft.validationRefs),
          rationale: draft.rationale,
          reviewerName: draft.reviewerName,
          reviewerQualification: draft.reviewerQualification,
          conflictOfInterestDeclaration: draft.coi,
          independenceConfirmed: kind === "decision" ? draft.independent : false,
          recommendationEventId: action === "APPROVE" ? draft.recommendationEventId || null : null,
          supersedesEventId: kind === "decision" ? state?.latestDecision?.row.event_id ?? null : null,
        },
      });
      if (!res.ok) return setMessage(res.message);
      if (res.status === "inserted" || res.status === "duplicate") {
        setMessage(`${kind === "decision" ? FINAL_ACTION_LABELS[action as FinalAction] : "Recommendation"} recorded in the append-only cloud ledger${res.status === "duplicate" ? " (already recorded)" : ""}. No metric was activated.`);
        setDraft(emptyDraft());
        await auth.reload();
      } else setMessage(`Not recorded (${res.status}): ${res.detail ?? "refused by the server"}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "The submission failed. Nothing was recorded.");
    } finally {
      setBusy(false);
    }
  };

  const candidateDomain = (id: string) => catalogEntryFor(id)?.domain ?? "";
  return (
    <div className="space-y-2 rounded-md border border-border p-3 text-xs" aria-label={`Final authorization for ${dossier.sourceLabel}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Final scientific authorization</h3>
        <Badge variant="secondary">{state ? SCIENTIFIC_STATUS_LABELS[state.scientificStatus] : "Pending Nikolas review"}</Badge>
        <Badge variant="outline">{state?.activationStatus === "ACTIVE" ? "Active" : "Activation blocked"}</Badge>
        {state?.stale ? <Badge variant="destructive">Stale decision — re-review required</Badge> : null}
        {state?.integrity === "FAILED" ? <Badge variant="destructive">Ledger integrity failed</Badge> : null}
      </div>
      {decision && state?.latestDecision ? (
        <p className="break-words">
          Latest decision: <strong>{FINAL_ACTION_LABELS[decision.action as FinalAction]}</strong> by {decision.reviewerName} ({decision.reviewerQualification}, declared) at {decision.decidedAt}
          {decision.canonicalCatalogId ? ` · ${decision.canonicalCatalogId} · ${decision.domain} · unit "${decision.validatedUnit}"` : ""} · evidence {[...decision.sourceRefs, ...decision.validationEvidenceRefs].join(", ")}
        </p>
      ) : (
        <p className="text-muted-foreground">No final decision recorded.</p>
      )}
      {state?.blockers.length ? (
        <details>
          <summary className="cursor-pointer">Activation blockers ({state.blockers.length})</summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{state.gates.filter((g) => !g.passed).map((g) => <li key={g.gate} className="break-words">{ACTIVATION_GATE_LABELS[g.gate]} — {g.detail}</li>)}</ul>
        </details>
      ) : null}
      {state?.history.length ? (
        <details>
          <summary className="cursor-pointer">Authorization audit history ({state.history.length}, append-only)</summary>
          <ol className="mt-1 space-y-1">
            {state.history.map((e) => (
              <li key={e.row.event_id} className="break-words border-b border-border py-1">
                #{e.row.received_seq} · {e.row.received_at} · {e.payload.kind === "decision" ? FINAL_ACTION_LABELS[e.payload.action as FinalAction] : "Recommendation"} · {e.row.actor_role} ·{" "}
                {e.payload.reviewerName} · {e.payload.canonicalCatalogId ?? "—"} {e.payload.validatedUnit ? `"${e.payload.validatedUnit}"` : ""} · {e.payload.rationale} · hash {e.row.event_hash.slice(0, 12)}…
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {canRecommend || canDecide ? (
        <details className="rounded-md border border-border p-2">
          <summary className="cursor-pointer font-medium">{canDecide ? "Record a recommendation or final decision" : "Submit a recommendation (evidence only)"}</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <select aria-label="Canonical catalog ID" className="rounded-md border border-border bg-background px-2 py-1.5" value={draft.canonicalCatalogId} onChange={(e) => set({ canonicalCatalogId: e.target.value, domain: candidateDomain(e.target.value) })}>
              <option value="">Canonical catalog ID (recommendation)</option>
              {dossier.candidateCatalogIds.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            <Input aria-label="Domain" placeholder="Domain (must match the catalog entry)" value={draft.domain} onChange={(e) => set({ domain: e.target.value })} />
            <Input aria-label="Validated unit" placeholder={`Exact unit (must be ${dossier.sourceUnit})`} value={draft.unit} onChange={(e) => set({ unit: e.target.value })} />
            <Input aria-label="Specimen or acquisition context" placeholder="Specimen or acquisition context" value={draft.specimen} onChange={(e) => set({ specimen: e.target.value })} />
            <Input aria-label="Method or instrument" placeholder="Laboratory method or measurement instrument" value={draft.method} onChange={(e) => set({ method: e.target.value })} />
            <Input aria-label="Protocol" placeholder="Collection or test protocol" value={draft.protocol} onChange={(e) => set({ protocol: e.target.value })} />
            <Input aria-label="Protocol version" placeholder="Protocol version" value={draft.protocolVersion} onChange={(e) => set({ protocolVersion: e.target.value })} />
            <Input aria-label="Source evidence references" placeholder={`Source refs (e.g. handoff:${dossier.termId}, doi:…)`} value={draft.sourceRefs} onChange={(e) => set({ sourceRefs: e.target.value })} />
            <Input aria-label="Validation evidence references" placeholder="Validation evidence refs (doi:, pmid:, doc:)" value={draft.validationRefs} onChange={(e) => set({ validationRefs: e.target.value })} />
            <Input aria-label="Reviewer name" placeholder="Your name" value={draft.reviewerName} onChange={(e) => set({ reviewerName: e.target.value })} />
            <Input aria-label="Reviewer qualification" placeholder="Scientific qualification" value={draft.reviewerQualification} onChange={(e) => set({ reviewerQualification: e.target.value })} />
            <Input className="sm:col-span-2" aria-label="Rationale" placeholder="Rationale (no thresholds, diagnoses or conversions)" value={draft.rationale} onChange={(e) => set({ rationale: e.target.value })} />
            <Button type="button" variant="outline" className="sm:col-span-2" disabled={busy || !canRecommend} onClick={() => void submit("recommendation", "RECOMMEND")}>
              Submit recommendation (not an approval)
            </Button>
            {canDecide ? (
              <>
                <select aria-label="Recommendation to approve" className="rounded-md border border-border bg-background px-2 py-1.5 sm:col-span-2" value={draft.recommendationEventId} onChange={(e) => set({ recommendationEventId: e.target.value })}>
                  <option value="">Recommendation to approve (another account's)</option>
                  {independentRecs.map((r) => (
                    <option key={r.row.event_id} value={r.row.event_id}>
                      #{r.row.received_seq} {r.payload.canonicalCatalogId} "{r.payload.validatedUnit}" by {r.payload.reviewerName}
                    </option>
                  ))}
                </select>
                <Input className="sm:col-span-2" aria-label="Conflict-of-interest declaration" placeholder="Conflict-of-interest declaration" value={draft.coi} onChange={(e) => set({ coi: e.target.value })} />
                <label className="flex items-start gap-2 sm:col-span-2">
                  <input type="checkbox" checked={draft.independent} onChange={(e) => set({ independent: e.target.checked })} />
                  I am independent of this mapping: I did not author the recommendation and have no undeclared conflict of interest.
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button type="button" disabled={busy} onClick={() => void submit("decision", "APPROVE")}>Approve mapping</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void submit("decision", "REJECT")}>Reject mapping</Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void submit("decision", "REQUEST_MORE_EVIDENCE")}>Request more evidence</Button>
                </div>
              </>
            ) : (
              <p className="sm:col-span-2 text-muted-foreground">Final decisions require a Researcher membership for this mission.</p>
            )}
          </div>
        </details>
      ) : null}
      {message ? <p role="status" className="break-words">{message}</p> : null}
    </div>
  );
}
