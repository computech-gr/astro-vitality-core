import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import { prepareCloudHandoff, type CloudHandoff, type HandoffSyncState } from "@/domain/health-intelligence/p36-cloud-handoff";
import { appendHandoffReceipt, listHandoffReceipts } from "@/domain/health-intelligence/p36-handoff-receipts";
import { sha256Hex } from "@/domain/health-intelligence/p36-scientific-authorization";
import { canonicalJson } from "@/domain/health-intelligence/observation-envelope";
import type { PendingReviewRequest } from "@/domain/health-intelligence/review-ledger";
import { submitDynamicHandoff } from "@/lib/p36-dynamic-handoff.functions";

export function P36HandoffSubmission({ request, userId, onSubmitted }: { request: PendingReviewRequest; userId: string; onSubmitted?: () => void }) {
  const [state, setState] = useState<HandoffSyncState>("LOCAL_ONLY");
  const [preview, setPreview] = useState<CloudHandoff | null>(null);
  const [consent, setConsent] = useState(false);
  const [message, setMessage] = useState("");
  const epoch = useRef(0);
  const send = useServerFn(submitDynamicHandoff);
  const key = canonicalJson([request.scope, request.requestId, userId]);
  useEffect(() => {
    const current = ++epoch.current;
    setState("LOCAL_ONLY"); setPreview(null); setConsent(false); setMessage("");
    void Promise.all([prepareCloudHandoff(request), listHandoffReceipts(request.scope, userId)]).then(async ([p, receipts]) => {
      const sha = await sha256Hex(canonicalJson(p));
      if (current !== epoch.current) return;
      const r = receipts.filter((r) => r.requestId === request.requestId && r.payloadSha256 === sha).at(-1);
      if (r) { setState(r.status); setMessage(`Recorded server receipt ${r.submissionId} at ${r.receivedAt}. Refresh Scientific Review to verify current cloud availability.`); }
    }).catch(() => { if (current === epoch.current) setMessage("Local receipt could not be checked; cloud status is unknown."); });
    return () => { epoch.current = current + 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key binds immutable request scope and account
  }, [key]);
  const submit = async () => {
    if (!preview || !consent || state === "SUBMITTING") return;
    const current = epoch.current;
    setState("SUBMITTING");
    try {
      const fresh = await loadMissionIdentity();
      const allowed = fresh.signedIn && !fresh.error && fresh.userId === userId && fresh.memberships.some((m) => m.missionId === request.scope.missionId && (m.crewMemberId === request.scope.crewMemberId || !m.crewMemberId && m.role === "ground_medical") && ["crew_self", "ground_medical"].includes(m.role));
      if (!allowed) throw new Error("Current authorization for this exact scope could not be confirmed.");
      if (current !== epoch.current) return;
      const res = await send({ data: preview });
      if (current !== epoch.current) return;
      if (!res.ok) throw new Error(res.message);
      const result = res.status === "conflict" ? "CONFLICT" : "SUBMITTED";
      await appendHandoffReceipt({ requestId: request.requestId, scope: request.scope, actorUserId: userId, status: result, receivedAt: res.receivedAt || new Date().toISOString(), submissionId: res.submissionId, payloadSha256: res.payloadSha256 });
      if (current !== epoch.current) return;
      setState(result); setConsent(false); onSubmitted?.();
      setMessage(result === "CONFLICT" ? "Changed payload for this request was refused. Original local evidence and server copy are unchanged." : `Server receipt ${res.submissionId} at ${res.receivedAt}. Metadata submitted; scientific review is still pending.`);
    } catch (e) {
      if (current === epoch.current) { setState("FAILED"); setMessage(e instanceof Error ? e.message : "Submission failed. Retry with the same request; the server prevents duplicates."); }
    }
  };
  return <div className="space-y-2 border-t border-border py-3 text-xs" aria-label={`Cloud handoff ${request.requestId}`}>
    <div className="flex flex-wrap gap-2"><Badge variant="outline">{state}</Badge><span>Scientific review pending · {request.terms.length} terms</span></div>
    {state === "LOCAL_ONLY" ? <p>Stored on this device only — not visible to other devices or reviewers.</p> : null}
    <Button variant="outline" disabled={state === "SUBMITTING"} onClick={() => { void prepareCloudHandoff(request).then(setPreview).catch((e) => setMessage(String(e))); setConsent(false); }}>Preview metadata submission</Button>
    {preview ? <details open><summary className="cursor-pointer">Metadata preview ({preview.terms.length} terms)</summary>
      <p>No measurements, observation dates, excerpts, document contents or filenames. Only labels, exact units, classification, candidate IDs, document hashes and opaque evidence pointers are sent. Local encrypted evidence remains unchanged.</p>
      <ul className="max-h-48 overflow-auto">{preview.terms.map((t) => <li key={t.termId} className="break-words">{t.originalLabels.join(" / ")} · {t.exactUnit || "unit missing"} · {t.classification} · {t.sourceDocumentSha256.length} document hash(es)</li>)}</ul>
      <label className="flex items-start gap-2 py-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />I consent to sending this metadata for this mission, crew member and provenance. This does not grant scientific approval.</label>
      <Button disabled={!consent || state === "SUBMITTING" || state === "CONFLICT"} onClick={() => void submit()}>{state === "SUBMITTING" ? "Submitting…" : state === "FAILED" ? "Retry metadata submission" : "Submit metadata to cloud"}</Button>
    </details> : null}
    {message ? <p role="status" className="break-words">{message}</p> : null}
  </div>;
}