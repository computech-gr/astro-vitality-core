/**
 * Consolidated pending review requests: one read-only summary of every
 * locally stored and submitted request across the signed-in account's
 * authorized scopes, grouped by mission, crew member and provenance.
 * Duplicates are detected by governed identity rules and reported only —
 * original requests are never deleted, merged or rewritten.
 */
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { loadMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import { listUnknownBiomarkerReviewState } from "@/domain/health-intelligence/review-ledger";
import { listHandoffReceipts } from "@/domain/health-intelligence/p36-handoff-receipts";
import {
  buildPendingRequestsSummary,
  scopeKey,
  type PendingRequestsSummary,
  type ScopeInput,
} from "@/domain/health-intelligence/p36-pending-requests-summary";
import type { ReviewScope } from "@/domain/health-intelligence/unknown-biomarker-review";

const STATUS_LABEL: Record<string, string> = {
  LOCAL_ONLY: "Local only",
  SUBMITTED: "Submitted",
  CONFLICT: "Conflict held",
};

function scopesFor(memberships: readonly MissionMembershipContext[]): { scope: ReviewScope; missionLabel: string; crewLabel: string }[] {
  const out: { scope: ReviewScope; missionLabel: string; crewLabel: string }[] = [];
  const seen = new Set<string>();
  for (const m of memberships) {
    if (!m.crewMemberId) continue;
    for (const provenance of ["synthetic", "real"] as const) {
      const scope: ReviewScope = { missionId: m.missionId, crewMemberId: m.crewMemberId, provenance };
      const key = scopeKey(scope);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        scope,
        missionLabel: m.missionCode ?? m.missionName ?? m.missionId,
        crewLabel: m.crewDisplayName ?? m.crewMemberId,
      });
    }
  }
  return out;
}

export function P36PendingRequestsSummary({ userId }: { userId: string | null }) {
  const [summary, setSummary] = useState<PendingRequestsSummary | null>(null);
  const [labels, setLabels] = useState<Map<string, { mission: string; crew: string }>>(new Map());
  const [message, setMessage] = useState("");
  const epoch = useRef(0);

  useEffect(() => {
    const current = ++epoch.current;
    setSummary(null);
    setMessage("");
    if (!userId) return;
    void (async () => {
      try {
        const identity = await loadMissionIdentity();
        if (!identity.signedIn || identity.error || identity.userId !== userId) throw new Error("Sign-in could not be confirmed.");
        const scoped = scopesFor(identity.memberships);
        const inputs: ScopeInput[] = await Promise.all(
          scoped.map(async ({ scope }) => {
            const [state, receipts] = await Promise.all([
              listUnknownBiomarkerReviewState(scope),
              listHandoffReceipts(scope, userId),
            ]);
            return { scope, requests: state.requests, receipts };
          }),
        );
        if (current !== epoch.current) return;
        setLabels(new Map(scoped.map((s) => [scopeKey(s.scope), { mission: s.missionLabel, crew: s.crewLabel }])));
        setSummary(buildPendingRequestsSummary(inputs));
      } catch (e) {
        if (current === epoch.current) setMessage(e instanceof Error ? e.message : "The local summary could not be read.");
      }
    })();
    return () => {
      epoch.current = current + 1;
    };
  }, [userId]);

  if (!userId) return null;
  return (
    <section aria-label="Pending review requests summary" className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
      <h3 className="text-base font-semibold">Pending review requests on this device</h3>
      <p className="text-xs text-muted-foreground">
        One consolidated view of every request stored on this device and its submission receipts, grouped by mission, crew member and provenance.
        A receipt proves the server received metadata; it is never a scientific approval. Duplicates are reported, never merged or deleted.
      </p>
      {message ? <p role="status" className="text-xs">{message}</p> : null}
      {summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["Requests", summary.totalRequests],
                ["Unique terms", summary.totalUniqueTerms],
                ["Original 12-term batch", summary.legacyBatchTermCount],
                ["Additional submitted batch", summary.dynamicBatchTermCount],
                ["Local only", summary.byStatus.LOCAL_ONLY],
                ["Submitted / conflict", summary.byStatus.SUBMITTED + summary.byStatus.CONFLICT],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
          {summary.totalRequests === 0 ? (
            <p className="text-xs text-muted-foreground">No pending review requests are stored on this device for your authorized scopes.</p>
          ) : null}
          {summary.duplicates.length ? (
            <details className="text-xs">
              <summary className="cursor-pointer font-medium">
                Genuine duplicate terms across requests ({summary.duplicates.length}) — reported only, originals preserved
              </summary>
              <ul className="mt-1 space-y-1">
                {summary.duplicates.map((d) => (
                  <li key={d.termId} className="break-words border-b border-border py-1">
                    <code>{d.termId}</code> appears in {d.occurrences.map((o) => o.requestId).join(", ")}. Each original request is unchanged.
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
                      <ul className="mt-2 space-y-2">
                        {s.requests.map((r) => (
                          <li key={r.requestId} className="rounded border border-border p-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{STATUS_LABEL[r.status]}</Badge>
                              <span>
                                {r.termCount} term(s) · registered {r.createdAt} by {r.createdByRole === "ground_medical" ? "Ground Medical" : "Crew Self"}
                              </span>
                            </div>
                            {r.receipt ? (
                              <p className="mt-1 break-words text-muted-foreground">
                                Receipt {r.receipt.submissionId} at {r.receipt.receivedAt} · payload {r.receipt.payloadSha256.slice(0, 16)}…
                                {r.receipt.status === "CONFLICT" ? " · changed payload refused; server copy unchanged" : ""}
                              </p>
                            ) : (
                              <p className="mt-1 text-muted-foreground">No submission receipt on this device.</p>
                            )}
                            <details className="mt-1">
                              <summary className="cursor-pointer">Technical identifiers</summary>
                              <p className="break-all text-muted-foreground">
                                request {r.requestId} · mission {s.scope.missionId} · crew {s.scope.crewMemberId} · provenance {s.scope.provenance}
                              </p>
                            </details>
                          </li>
                        ))}
                      </ul>
                      {s.rejectedRequests.length ? (
                        <p className="mt-2 text-xs text-destructive">
                          {s.rejectedRequests.length} stored entr{s.rejectedRequests.length === 1 ? "y was" : "ies were"} rejected as invalid and are not shown as terms:{" "}
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
        <p role="status" className="text-xs text-muted-foreground">Reading the encrypted local review ledger…</p>
      ) : null}
    </section>
  );
}
