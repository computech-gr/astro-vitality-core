/**
 * Consolidated pending review requests: one read-only summary of every
 * request stored on this device plus the authorized cloud inventory, grouped
 * by mission, crew member and provenance. Only scopes where the account may
 * hold or submit requests (Crew Self / Ground Medical) are read; Researchers
 * never see device-local registrations here. Duplicates are detected by
 * governed identity rules and reported only — originals are never deleted,
 * merged or rewritten.
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { loadMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import { loadMissionCrewRoster } from "@/infrastructure/mission-crew-roster";
import { listUnknownBiomarkerReviewState } from "@/domain/health-intelligence/review-ledger";
import { listHandoffReceipts } from "@/domain/health-intelligence/p36-handoff-receipts";
import {
  buildPendingRequestsSummary,
  scopeKey,
  type CloudInventory,
  type PendingRequestsSummary,
  type RequestSummaryStatus,
  type ScopeInput,
  type ScopeTermInventory,
} from "@/domain/health-intelligence/p36-pending-requests-summary";
import type { ReviewScope } from "@/domain/health-intelligence/unknown-biomarker-review";
import { listDynamicHandoff } from "@/lib/p36-dynamic-handoff.functions";

const STATUS_LABEL: Record<RequestSummaryStatus, string> = {
  LOCAL_ONLY: "Local only",
  SUBMITTED: "Submitted (unverified)",
  SYNCHRONIZED: "Synchronized",
  FAILED: "Failed — not in cloud",
  CONFLICT: "Conflict held",
};

/** Maximum scopes whose cloud inventory is read per refresh (bounded request volume). */
const MAX_CLOUD_SCOPES = 24;

interface ScopeLabel {
  scope: ReviewScope;
  missionLabel: string;
  crewLabel: string;
}

async function submitterScopes(memberships: readonly MissionMembershipContext[]): Promise<{ scopes: ScopeLabel[]; problems: string[] }> {
  const out: ScopeLabel[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  const push = (missionId: string, missionLabel: string, crewMemberId: string, crewLabel: string) => {
    for (const provenance of ["synthetic", "real"] as const) {
      const scope: ReviewScope = { missionId, crewMemberId, provenance };
      const key = scopeKey(scope);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ scope, missionLabel, crewLabel });
    }
  };
  for (const m of memberships) {
    if (m.role !== "crew_self" && m.role !== "ground_medical") continue;
    const missionLabel = m.missionCode ?? m.missionName ?? m.missionId;
    if (m.crewMemberId) push(m.missionId, missionLabel, m.crewMemberId, m.crewDisplayName ?? m.crewMemberId);
    else if (m.role === "ground_medical") {
      const roster = await loadMissionCrewRoster(m.missionId);
      if (roster.ok) for (const c of roster.crew) push(m.missionId, missionLabel, c.crewMemberId, c.displayName);
      else problems.push(`${missionLabel}: ${roster.message}`);
    }
  }
  return { scopes: out, problems };
}

function TermList({ terms }: { terms: ScopeTermInventory[] }) {
  if (!terms.length) return <p className="text-xs text-muted-foreground">No terms in this batch for this scope.</p>;
  return (
    <ul className="max-h-64 space-y-1 overflow-auto">
      {terms.map((t) => (
        <li key={t.termId} className="break-words border-b border-border py-1">
          {t.label || "(no label)"} · <span className="font-mono">{t.exactUnit || "unit missing"}</span> ·{" "}
          {t.statuses.map((s) => STATUS_LABEL[s]).join(", ")} · {t.requestIds.length} request(s)
          <span className="block text-muted-foreground">{t.termId}</span>
        </li>
      ))}
    </ul>
  );
}

export function P36PendingRequestsSummary({
  userId,
  refreshKey = 0,
  focusScope = null,
}: {
  userId: string | null;
  refreshKey?: number;
  focusScope?: ReviewScope | null;
}) {
  const [summary, setSummary] = useState<PendingRequestsSummary | null>(null);
  const [labels, setLabels] = useState<Map<string, { mission: string; crew: string }>>(new Map());
  const [message, setMessage] = useState("");
  const [tick, setTick] = useState(0);
  const epoch = useRef(0);
  const listCloud = useServerFn(listDynamicHandoff);
  const focusKey = focusScope ? scopeKey(focusScope) : "";

  useEffect(() => {
    const onFocus = () => setTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const current = ++epoch.current;
    setSummary(null);
    setMessage("");
    if (!userId) return;
    void (async () => {
      try {
        const identity = await loadMissionIdentity();
        if (!identity.signedIn || identity.error || identity.userId !== userId) throw new Error("Sign-in could not be confirmed.");
        const inventory = await submitterScopes(identity.memberships);
        const scoped = inventory.scopes;
        if (current !== epoch.current) return;
        const local = await Promise.all(
          scoped.map(async ({ scope }) => {
            const [state, receipts] = await Promise.all([listUnknownBiomarkerReviewState(scope), listHandoffReceipts(scope, userId)]);
            return { scope, requests: state.requests, receipts };
          }),
        );
        if (current !== epoch.current) return;
        // Cloud inventory: scopes with local requests/receipts, plus the selected scope.
        const wanted = [...local].sort((a, b) => Number(scopeKey(b.scope) === focusKey) - Number(scopeKey(a.scope) === focusKey)).slice(0, MAX_CLOUD_SCOPES);
        const cloud = new Map<string, CloudInventory>();
        await Promise.all(
          wanted.map(async ({ scope }) => {
            try {
              const res = await listCloud({ data: scope });
              cloud.set(scopeKey(scope), res.ok ? { ok: true, submissions: res.submissions } : { ok: false, message: res.message });
            } catch {
              cloud.set(scopeKey(scope), { ok: false, message: "Cloud inventory unavailable." });
            }
          }),
        );
        if (current !== epoch.current) return;
        const inputs: ScopeInput[] = local.map((x) => ({ ...x, cloud: cloud.get(scopeKey(x.scope)) }));
        setLabels(new Map(scoped.map((s) => [scopeKey(s.scope), { mission: s.missionLabel, crew: s.crewLabel }])));
        setMessage([...inventory.problems, ...[...cloud.values()].filter((c) => !c.ok).map((c) => !c.ok ? c.message : ""), ...(local.length > MAX_CLOUD_SCOPES ? ["Some authorized scopes were not read because the inventory limit was reached."] : [])].filter(Boolean).join(" "));
        setSummary(buildPendingRequestsSummary(inputs));
      } catch (e) {
        if (current === epoch.current) setMessage(e instanceof Error ? e.message : "The summary could not be read.");
      }
    })();
    return () => {
      epoch.current = current + 1;
    };
  }, [userId, refreshKey, focusKey, tick, listCloud]);

  if (!userId) return null;
  return (
    <section aria-label="Pending review requests summary" className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
      <h3 className="text-base font-semibold">Pending review requests</h3>
      <p className="text-xs text-muted-foreground">
        One consolidated view of requests stored on this device and authorized cloud submissions, grouped by mission, crew member and provenance.
        A receipt or cloud copy proves the server received metadata; it is never a scientific approval. Duplicates are reported, never merged or deleted.
      </p>
      {message ? <p role="status" className="text-xs">{message}</p> : null}
      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {(
              [
                ["Requests", summary.totalRequests],
                ["Unique terms", summary.totalUniqueTerms],
                [`Original batch (of ${summary.legacyDocumentaryTotal})`, summary.legacyBatchTermCount],
                ["Additional terms", summary.dynamicBatchTermCount],
                ["Additional submitted", summary.dynamicSubmittedTermCount],
                ["Local only", summary.byStatus.LOCAL_ONLY],
                ["Submitted / synchronized", summary.byStatus.SUBMITTED + summary.byStatus.SYNCHRONIZED],
                ["Failed / conflict", summary.byStatus.FAILED + summary.byStatus.CONFLICT],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {summary.totalRequests === 0 ? (
            <p className="text-xs text-muted-foreground">No requests were found in the scopes successfully read. Unavailable or unread scopes do not establish that cloud requests are absent.</p>
          ) : null}
          {summary.duplicates.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium">
                Genuine duplicate terms across requests ({summary.duplicates.length}) — reported only, originals preserved
              </summary>
              <ul className="mt-1 space-y-1">
                {summary.duplicates.map((d) => (
                  <li key={d.termId} className="break-words border-b border-border py-1">
                    <code>{d.termId}</code> appears in{" "}
                    {d.occurrences
                      .map((o) => {
                        const l = labels.get(scopeKey(o.scope));
                        return `${o.requestId} (${l?.mission ?? o.scope.missionId} · ${l?.crew ?? o.scope.crewMemberId} · ${o.scope.provenance})`;
                      })
                      .join(", ")}
                    . Each original request is unchanged.
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <ul className="space-y-2">
            {summary.scopes
              .filter((s) => s.requests.length || s.rejectedRequests.length)
              .map((s) => {
                const label = labels.get(scopeKey(s.scope));
                return (
                  <li key={scopeKey(s.scope)} className="rounded-md border border-border p-3">
                    <details>
                      <summary className="cursor-pointer">
                        <strong>{label?.mission ?? s.scope.missionId}</strong> · {label?.crew ?? s.scope.crewMemberId} · {s.scope.provenance} —{" "}
                        {s.requests.length} request(s), {s.uniqueTermIds.length} unique term(s)
                      </summary>
                      <p className="mt-1 text-xs text-muted-foreground">{s.cloudMessage}</p>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer font-medium">Original batch terms ({s.legacyTerms.length})</summary>
                        <TermList terms={s.legacyTerms} />
                      </details>
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer font-medium">Additional terms ({s.additionalTerms.length})</summary>
                        <TermList terms={s.additionalTerms} />
                      </details>
                      <ul className="mt-2 space-y-2">
                        {s.requests.map((r) => (
                          <li key={`${r.origin}:${r.requestId}:${r.cloud?.submissionId ?? ""}`} className="rounded border border-border p-2 text-xs">
                            <details>
                              <summary className="cursor-pointer">
                                <Badge variant="outline">{STATUS_LABEL[r.status]}</Badge>{" "}
                                {r.termCount} term(s) ·{" "}
                                {r.origin === "local"
                                  ? `registered ${r.createdAt} by ${r.createdByRole === "ground_medical" ? "Ground Medical" : "Crew Self"}`
                                  : `received ${r.createdAt} from another device or account`}
                              </summary>
                              <p className="mt-1 text-muted-foreground">{r.statusDetail}</p>
                              {r.receipt ? (
                                <p className="mt-1 break-words text-muted-foreground">
                                  Receipt {r.receipt.submissionId} at {r.receipt.receivedAt} · payload {r.receipt.payloadSha256.slice(0, 16)}…
                                </p>
                              ) : r.origin === "local" ? (
                                <p className="mt-1 text-muted-foreground">No submission receipt on this device.</p>
                              ) : null}
                              <ul className="mt-1 max-h-48 overflow-auto">
                                {r.terms.map((t) => (
                                  <li key={t.termId} className="break-words">
                                    {t.label || "(no label)"} · <span className="font-mono">{t.exactUnit || "unit missing"}</span>
                                  </li>
                                ))}
                              </ul>
                              <details className="mt-1">
                                <summary className="cursor-pointer">Technical identifiers</summary>
                                <p className="break-all text-muted-foreground">
                                  request {r.requestId} · mission {s.scope.missionId} · crew {s.scope.crewMemberId} · provenance {s.scope.provenance}
                                  {r.cloud ? ` · cloud submission ${r.cloud.submissionId} · digest ${r.cloud.payloadSha256}` : ""}
                                </p>
                              </details>
                            </details>
                          </li>
                        ))}
                      </ul>
                      {s.rejectedRequests.length ? (
                        <p className="mt-2 text-xs text-destructive">
                          {s.rejectedRequests.length} entr{s.rejectedRequests.length === 1 ? "y was" : "ies were"} rejected as invalid and are not shown as terms:{" "}
                          {s.rejectedRequests.map((x) => `${x.requestId} (${x.reason})`).join("; ")}
                        </p>
                      ) : null}
                    </details>
                  </li>
                );
              })}
          </ul>
        </>
      ) : !message ? (
        <p role="status" className="text-xs text-muted-foreground">Reading the encrypted local review ledger and authorized cloud inventory…</p>
      ) : null}
    </section>
  );
}
