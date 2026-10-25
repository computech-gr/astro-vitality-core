import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getSyntheticMedicalEvidence,
  getMedicalReviewHistory,
  appendMedicalReview,
  exportSyntheticMedicalHistory,
} from "@/lib/medical-governance.functions";
import { askSyntheticEvidence } from "@/lib/synthetic-evidence-qa.functions";
import {
  emergencyDisableSyntheticAI,
  getSyntheticActivationStatus,
} from "@/lib/synthetic-activation-control.functions";
import { OctagonX } from "lucide-react";
import type { SyntheticEvidenceSnapshot } from "@/domain/health-intelligence/synthetic-evidence";
import { SYNTHETIC_DEMO_QUESTIONS } from "@/domain/health-intelligence/production-synthetic-demo";
import { validateAIDraft } from "@/domain/health-intelligence/ai-draft-validation";
import { SYNTHETIC_STATUS_MESSAGES } from "@/domain/health-intelligence/synthetic-status";
import type { DurableReviewEvent } from "@/domain/health-intelligence/medical-governance";
import {
  SYNTHETIC_TAB_CACHE_KEY, readSyntheticTabState, writeSyntheticTabState,
} from "@/domain/health-intelligence/synthetic-tab-state";

/** Separate from offline reports: no observation-store dependency or browser authority. */
export function SyntheticMedicalReview() {
  const load = useServerFn(getSyntheticMedicalEvidence);
  const history = useServerFn(getMedicalReviewHistory);
  const append = useServerFn(appendMedicalReview);
  const exportAuthorized = useServerFn(exportSyntheticMedicalHistory);
  const ask = useServerFn(askSyntheticEvidence);
  const disableAI = useServerFn(emergencyDisableSyntheticAI);
  const activationStatus = useServerFn(getSyntheticActivationStatus);
  const generationEpoch = useRef(0);
  const authorizationEpoch = useRef(0);
  const ownerRef = useRef<string | null>(null);
  const snapshotRef = useRef<SyntheticEvidenceSnapshot | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const clearCache = () => {
    try { sessionStorage.removeItem(SYNTHETIC_TAB_CACHE_KEY); } catch { /* Optional storage. */ }
  };
  const [guardStatus, setGuardStatus] = useState<Awaited<
    ReturnType<typeof activationStatus>
  > | null>(null);
  const [question, setQuestion] = useState<string>(SYNTHETIC_DEMO_QUESTIONS[0]);
  const [persistent, setPersistent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const clearSession = () => {
    generationEpoch.current++;
    setAcknowledged(false);
    setAnswer("");
    setDraft("");
    setFinal("");
    setRationale("");
    setConsent(false);
    setQaConsent(false);
  };
  const [qaConsent, setQaConsent] = useState(false);
  const [answer, setAnswer] = useState("");
  const [snapshot, setSnapshot] = useState<SyntheticEvidenceSnapshot | null>(null);
  const [events, setEvents] = useState<DurableReviewEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [final, setFinal] = useState("");
  const [rationale, setRationale] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Select Load authorized synthetic fixture to check current server authorization. No AI request is sent by loading evidence.",
  );
  const latest = events.reduce<DurableReviewEvent | null>(
    (a, b) => (!a || b.revision > a.revision ? b : a),
    null,
  );
  const refresh = async () => {
    const epoch = ++authorizationEpoch.current;
    generationEpoch.current++;
    setCacheReady(false);
    setConsent(false);
    setQaConsent(false);
    setAcknowledged(false);
    // Hide cached work until this read reauthorizes it; retain in-memory text on same-scope focus.
    setSnapshot(null);
    try {
      const auth = await supabase.auth.getUser();
      if (authorizationEpoch.current !== epoch) return;
      const userId = auth.data.user?.id;
      if (auth.error || !userId) throw new Error("Sign in required to restore synthetic work.");
      if (ownerRef.current && ownerRef.current !== userId) {
        clearSession(); clearCache(); snapshotRef.current = null;
      }
      ownerRef.current = userId;
      const result = await load();
      if (authorizationEpoch.current !== epoch) return;
      if (!result.available || !result.snapshot)
        throw new Error("Synthetic source disabled; no cached work authorized.");
      const current = result.snapshot;
      const [resultHistory, guard, verifiedAuth] = await Promise.all([
        history({ data: { missionId: current.missionId, crewMemberId: current.crewMemberId } }),
        activationStatus(), supabase.auth.getUser(),
      ]);
      if (authorizationEpoch.current !== epoch) return;
      if (verifiedAuth.error || verifiedAuth.data.user?.id !== userId)
        throw new Error("Account changed; synthetic work invalidated.");
      const previous = snapshotRef.current;
      if (previous && (previous.sha256 !== current.sha256 || previous.missionId !== current.missionId ||
          previous.crewMemberId !== current.crewMemberId)) {
        clearSession(); clearCache();
      }
      if (!previous) {
        let cached = null;
        try { cached = readSyntheticTabState(sessionStorage, userId, current); } catch { /* Optional storage. */ }
        if (cached) {
          setQuestion(cached.question); setAnswer(cached.answer);
          setDraft(cached.draft); setFinal(cached.final);
        }
      }
      snapshotRef.current = current;
      setSnapshot(current);
      setPersistent(resultHistory.available);
      setEvents(resultHistory.events);
      setGuardStatus(guard);
      setCacheReady(true);
      setStatus("Authorized synthetic fixture; retained text is unverified local work, not consent or medical approval.");
    } catch (error) {
      if (authorizationEpoch.current !== epoch) return;
      clearSession(); clearCache(); snapshotRef.current = null;
      setSnapshot(null); setEvents([]); setPersistent(false); setGuardStatus(null);
      setStatus(error instanceof Error ? error.message : "Synthetic authorization failed.");
    }
  };
  refreshRef.current = refresh;
  useEffect(() => {
    const authEpoch = authorizationEpoch;
    const requestEpoch = generationEpoch;
    const invalidate = () => {
      authorizationEpoch.current++;
      ownerRef.current = null;
      snapshotRef.current = null;
      clearCache(); clearSession(); setCacheReady(false);
      setSnapshot(null); setEvents([]); setPersistent(false); setGuardStatus(null);
    };
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const nextOwner = session?.user.id;
      if (event === "SIGNED_OUT" || event === "USER_UPDATED" ||
          (ownerRef.current && nextOwner !== ownerRef.current)) invalidate();
      // SIGNED_IN on refocus is not necessarily an account change.
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        authorizationEpoch.current++; generationEpoch.current++;
        setConsent(false); setQaConsent(false); setAcknowledged(false); setCacheReady(false);
        setSnapshot(null);
        queueMicrotask(() => { void refreshRef.current?.(); });
      }
    });
    const refocus = () => {
      if (document.visibilityState === "visible") void refreshRef.current?.();
    };
    window.addEventListener("focus", refocus);
    document.addEventListener("visibilitychange", refocus);
    void refreshRef.current?.();
    return () => {
      authEpoch.current++; requestEpoch.current++;
      data.subscription.unsubscribe();
      window.removeEventListener("focus", refocus);
      document.removeEventListener("visibilitychange", refocus);
    };
  }, []);
  useEffect(() => {
    if (!cacheReady || !snapshot || !ownerRef.current) return;
    try {
      writeSyntheticTabState(sessionStorage, ownerRef.current, snapshot, { question, answer, draft, final });
    } catch { /* Optional storage. */ }
  }, [cacheReady, snapshot, question, answer, draft, final]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      authorizationEpoch.current++;
      setCacheReady(false);
      snapshotRef.current = null;
      clearCache();
      clearSession();
      setSnapshot(null);
      setEvents((previous) => previous.map((event) => ({ ...event, verified_current: false })));
      setStatus(
        error instanceof Error ? error.message : "Request failed; no verified acknowledgment.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async (type: "draft_created" | "approved" | "returned" | "revoked") => {
    if (!snapshot) return;
    await append({
      data: {
        missionId: snapshot.missionId,
        crewMemberId: snapshot.crewMemberId,
        type,
        previousId: latest?.id ?? null,
        requestId: crypto.randomUUID(),
        evidenceSha256:
          type === "revoked" ? (latest?.evidence_sha256 ?? snapshot.sha256) : snapshot.sha256,
        draftText: type === "revoked" ? (latest?.draft_text ?? draft) : draft,
        finalText: final,
        rationale,
      },
    });
    await refresh();
  };
  const exportHistory = async () => {
    if (!snapshot) throw new Error("Load an authorized synthetic source first.");
    // Re-query the authorized server on every export; never export stale cached events.
    const payload = await exportAuthorized({
      data: { missionId: snapshot.missionId, crewMemberId: snapshot.crewMemberId },
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = "mitochondria-synthetic-medical-review-history.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
    setStatus(
      "Synthetic review history exported from a fresh authorized server read; handle as sensitive research data.",
    );
  };
  const generate = async () => {
    if (!snapshot || !consent) return;
    const epoch = generationEpoch.current;
    setAcknowledged(false);
    setConsent(false);
    if (!persistent) {
      const result = await ask({
        data: {
          question: SYNTHETIC_DEMO_QUESTIONS[0],
          consent: true,
          provenance: "synthetic",
          missionId: snapshot.missionId,
          crewMemberId: snapshot.crewMemberId,
        },
      });
      if (generationEpoch.current !== epoch) return;
      if (result.status !== 200 || !result.text || result.evidence_sha256 !== snapshot.sha256)
        throw new Error(result.error ?? "Synthetic draft rejected.");
      setDraft(result.text);
      setFinal(result.text);
      setStatus("Synthetic research draft — unsaved; session-only advisor review.");
      setGuardStatus(await activationStatus());
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (generationEpoch.current !== epoch) return;
    if (!data.session) throw new Error("Sign in required.");
    const response = await fetch("/api/medical-ai-draft", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({
        missionId: snapshot.missionId,
        crewMemberId: snapshot.crewMemberId,
        provenance: "synthetic",
        consent: true,
        observations: snapshot.evidence,
      }),
    });
    const result = (await response.json()) as { draft?: string; error?: string };
    if (generationEpoch.current !== epoch) return;
    if (!response.ok || !result.draft) throw new Error(result.error ?? "Draft rejected.");
    setDraft(result.draft);
    setFinal(result.draft);
    setStatus("AI draft — unverified, unsaved; independent advisor assessment required.");
  };
  const askQuestion = async () => {
    if (!snapshot || !qaConsent) return;
    setQaConsent(false);
    setAcknowledged(false);
    setAnswer("");
    const epoch = generationEpoch.current;
    const result = await ask({
      data: {
        question,
        consent: true,
        provenance: "synthetic",
        missionId: snapshot.missionId,
        crewMemberId: snapshot.crewMemberId,
      },
    });
    if (generationEpoch.current !== epoch) return;
    if (result.status !== 200 || !result.text || result.evidence_sha256 !== snapshot.sha256)
      throw new Error(result.error ?? "Synthetic answer rejected.");
    setAnswer(result.text);
    setGuardStatus(await activationStatus());
  };
  return (
    <section aria-label="Server synthetic fixture review" className="space-y-3 border-t py-6">
      <h2 className="text-xl font-semibold">Synthetic Research AI — Factual Q&amp;A</h2>
      <p className="text-sm text-muted-foreground">
        Research-only demonstration using server-authorized synthetic evidence. Load the fixture,
        choose a predefined factual question, and explicitly consent before any AI request.
        Separate from encrypted offline observations; no clinical approval.
      </p>
      <Button disabled={busy} onClick={() => void run(refresh)}>
        Load authorized synthetic fixture
      </Button>
      <Button asChild variant="outline">
        <Link to="/mission/ai-administration">AI Administration & Usage</Link>
      </Button>
      <Button
        variant="destructive"
        onClick={() => {
          authorizationEpoch.current++;
          setCacheReady(false);
          snapshotRef.current = null;
          clearCache();
          clearSession();
          void disableAI({ data: { reference: "operator-emergency-disable" } })
            .then(() => {
              clearSession();
              setStatus("Synthetic AI disabled; already permitted requests may still complete.");
              void activationStatus().then(setGuardStatus);
            })
            .catch(() =>
              setStatus(
                "Emergency disable not confirmed; use the authorized SQL disable procedure.",
              ),
            );
        }}
      >
        <OctagonX aria-hidden="true" /> Emergency disable AI
      </Button>
      <p role="status" className="break-words text-sm">
        {status}
      </p>
      {guardStatus && (
        <dl className="grid gap-1 text-sm">
          <div>Production AI: {guardStatus.configurationEnabled ? "configured" : "off"}</div>
          {guardStatus.statusFailure && (
            <div role="status">{SYNTHETIC_STATUS_MESSAGES[guardStatus.statusFailure]}</div>
          )}
          {guardStatus.mode === "research" ? guardStatus.research ? (
            <>
              <div>
                Policy: {guardStatus.research.version} ·{" "}
                {guardStatus.research.enabled ? "enabled" : "paused"}
              </div>
              <div>Request eligibility: {guardStatus.research.eligible ? "eligible" : "not eligible"}</div>
              <div>
                Attempts this month: {guardStatus.research.attempts} · Remaining internal budget:
                USD {(guardStatus.research.remainingMicrousd / 1_000_000).toFixed(2)}
              </div>
              <div>
                Rolling quota: {guardStatus.research.rollingLimit} /{" "}
                {guardStatus.research.rollingSeconds} seconds
              </div>
            </>
          ) : <div>Research policy: unavailable</div> : guardStatus.guard ? (
            <>
              <div>Guard: {guardStatus.guard.version} · {guardStatus.guard.enabled ? "enabled" : "disabled"}</div>
              <div>
                Attempts: {guardStatus.guard?.attempts ?? 0} / 10 · Estimated holds: USD{" "}
                {((guardStatus.guard?.heldMicrousd ?? 0) / 1_000_000).toFixed(2)} / 1.00
              </div>
              <div className="break-all">
                UTC window: {guardStatus.guard?.startsAt ?? "not authorized"} —{" "}
                {guardStatus.guard?.endsAt ?? "not authorized"}
              </div>
              <div className="break-all">
                Operator: {guardStatus.guard?.operatorId ?? "not authorized"}
              </div>
            </>
          ) : <div>Legacy guard: unavailable</div>}
          <div className="break-all">Operator-supplied deployment revision: {guardStatus.revision ?? "not supplied or invalid"}</div>
          <div className="text-muted-foreground">Revision metadata is not independent deployment attestation.</div>
        </dl>
      )}
      {snapshot && (
        <>
          <p className="break-all text-xs">Server canonical SHA-256: {snapshot.sha256}</p>
          <ul className="space-y-2 text-sm">
            {snapshot.evidence.map((o) => (
              <li key={o.id} className="break-words">
                {o.id} · {o.metric} · {o.value} {o.unit} · {o.time}
              </li>
            ))}
          </ul>
          <div id="synthetic-research-qa" className="scroll-mt-28 space-y-2 rounded-lg border p-4">
            <h3 className="font-semibold">Synthetic evidence Q&amp;A — research only</h3>
            <label htmlFor="synthetic-question" className="block text-sm">
              Question about observed evidence
            </label>
            <select
              id="synthetic-question"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                setQaConsent(false);
                setAnswer("");
                setAcknowledged(false);
              }}
              className="w-full min-w-0 rounded border bg-background p-2"
            >
              {SYNTHETIC_DEMO_QUESTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={qaConsent}
                onChange={(e) => setQaConsent(e.target.checked)}
              />
              Send this question and only authorized synthetic evidence to OpenAI for this request.
            </label>
            <Button
              disabled={busy || !qaConsent || !question.trim()}
              onClick={() => void run(askQuestion)}
            >
              Ask synthetic evidence question
            </Button>
            {answer && <p className="whitespace-pre-wrap break-words">{answer}</p>}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Send only these invented synthetic fixtures to the configured AI provider.
          </label>
          <Button disabled={busy || !consent} onClick={() => void run(generate)}>
            Generate synthetic research draft
          </Button>
          <label htmlFor="synthetic-draft" className="block text-sm">
            Unverified synthetic draft
          </label>
          <textarea
            id="synthetic-draft"
            rows={4}
            maxLength={12000}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setAcknowledged(false);
            }}
            className="w-full rounded border bg-background p-2"
          />
          <label htmlFor="synthetic-final" className="block text-sm">
            Advisor edited text
          </label>
          <textarea
            id="synthetic-final"
            rows={4}
            maxLength={12000}
            value={final}
            onChange={(e) => {
              setFinal(e.target.value);
              setAcknowledged(false);
            }}
            className="w-full rounded border bg-background p-2"
          />
          <label htmlFor="synthetic-rationale" className="block text-sm">
            Synthetic review rationale
          </label>
          <textarea
            id="synthetic-rationale"
            rows={2}
            maxLength={2000}
            value={rationale}
            onChange={(e) => {
              setRationale(e.target.value);
              setAcknowledged(false);
            }}
            className="w-full rounded border bg-background p-2"
          />
          {!persistent && (
            <div className="space-y-2">
              <Button
                disabled={busy || !draft.trim() || !final.trim() || !rationale.trim()}
                onClick={() =>
                  void run(async () => {
                    const current = await load();
                    if (
                      !current.available ||
                      !current.snapshot ||
                      current.snapshot.sha256 !== snapshot.sha256
                    )
                      throw new Error(
                        "Evidence or authorization changed; acknowledgment invalidated.",
                      );
                    if (!validateAIDraft(final, current.snapshot.evidence).ok)
                      throw new Error(
                        "Unsupported statements or citations; acknowledgment rejected.",
                      );
                    setAcknowledged(true);
                    setStatus(
                      "Session-only synthetic acknowledgment. Not saved, licensed or scientifically approved.",
                    );
                  })
                }
              >
                Acknowledge session-only review
              </Button>
              {acknowledged && (
                <p role="status">Session-only acknowledgment — not a persistent approval.</p>
              )}
            </div>
          )}
          {persistent && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    busy ||
                    !draft.trim() ||
                    !rationale.trim() ||
                    Boolean(latest && !["revoked", "superseded"].includes(latest.event_type))
                  }
                  onClick={() => void run(() => save("draft_created"))}
                >
                  Save synthetic draft
                </Button>
                <Button
                  disabled={
                    busy ||
                    !latest ||
                    !["draft_created", "returned"].includes(latest.event_type) ||
                    !final.trim() ||
                    !rationale.trim()
                  }
                  onClick={() => void run(() => save("approved"))}
                >
                  Acknowledge synthetic review
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    busy ||
                    !latest ||
                    !["draft_created", "returned"].includes(latest.event_type) ||
                    !rationale.trim()
                  }
                  onClick={() => void run(() => save("returned"))}
                >
                  Return draft
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || latest?.event_type !== "approved" || !rationale.trim()}
                  onClick={() => void run(() => save("revoked"))}
                >
                  Revoke acknowledgment
                </Button>
              </div>
              <Button variant="outline" disabled={busy} onClick={() => void run(exportHistory)}>
                Export authorized synthetic review history (JSON)
              </Button>
              <p className="text-xs text-muted-foreground">
                Contains reviewer identifiers, evidence hashes, timestamps and review text. Export
                is not a clinical signature; store the file securely.
              </p>
            </>
          )}
          <ol className="space-y-3 text-sm">
            {events.map((event) => (
              <li key={event.id} className="border-t pt-3">
                <strong>
                  {event.event_type === "approved"
                    ? event.verified_current
                      ? "SERVER-VERIFIED SYNTHETIC ACKNOWLEDGMENT"
                      : "STALE / UNVERIFIED"
                    : event.event_type.toUpperCase()}
                </strong>
                <p className="break-all">
                  Revision {event.revision} · {event.actor_user_id} · {event.created_at}
                </p>
                <p className="whitespace-pre-wrap break-words">{event.final_text}</p>
                <p>{event.rationale}</p>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
