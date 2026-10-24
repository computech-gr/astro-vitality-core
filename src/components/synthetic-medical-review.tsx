import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  getSyntheticMedicalEvidence,
  getMedicalReviewHistory,
  appendMedicalReview,
} from "@/lib/medical-governance.functions";
import type { SyntheticEvidenceSnapshot } from "@/domain/health-intelligence/synthetic-evidence";
import type { DurableReviewEvent } from "@/domain/health-intelligence/medical-governance";

/** Separate from offline reports: no observation-store dependency or browser authority. */
export function SyntheticMedicalReview() {
  const load = useServerFn(getSyntheticMedicalEvidence);
  const history = useServerFn(getMedicalReviewHistory);
  const append = useServerFn(appendMedicalReview);
  const [snapshot, setSnapshot] = useState<SyntheticEvidenceSnapshot | null>(null);
  const [events, setEvents] = useState<DurableReviewEvent[]>([]);
  const [draft, setDraft] = useState("");
  const [final, setFinal] = useState("");
  const [rationale, setRationale] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(
    "Production synthetic fixture review is disabled pending separate authorization.",
  );
  const latest = events.reduce<DurableReviewEvent | null>(
    (a, b) => (!a || b.revision > a.revision ? b : a),
    null,
  );
  const refresh = async () => {
    const result = await load();
    if (!result.available || !result.snapshot) {
      setSnapshot(null);
      setEvents([]);
      setStatus("Synthetic source disabled; no persistent acknowledgment available.");
      return;
    }
    setSnapshot(result.snapshot);
    const resultHistory = await history({
      data: {
        missionId: result.snapshot.missionId,
        crewMemberId: result.snapshot.crewMemberId,
      },
    });
    setEvents(resultHistory.events);
    setStatus(
      "Invented synthetic fixtures — test receipts are not human medical review or scientific approval.",
    );
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
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
  const generate = async () => {
    if (!snapshot || !consent) return;
    setConsent(false);
    const { data } = await supabase.auth.getSession();
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
    if (!response.ok || !result.draft) throw new Error(result.error ?? "Draft rejected.");
    setDraft(result.draft);
    setFinal(result.draft);
    setStatus("AI draft — unverified, unsaved; independent advisor assessment required.");
  };
  return (
    <section aria-label="Server synthetic fixture review" className="space-y-3 border-t py-6">
      <h2 className="text-xl font-semibold">Synthetic fixture — server review</h2>
      <p className="text-sm text-muted-foreground">
        Research-only demonstration. Separate from encrypted offline observations. No legal
        signature, clinical certification or scientific approval.
      </p>
      <Button disabled={busy} onClick={() => void run(refresh)}>
        Load authorized synthetic fixture
      </Button>
      <p role="status" className="break-words text-sm">
        {status}
      </p>
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
            onChange={(e) => setDraft(e.target.value)}
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
            onChange={(e) => setFinal(e.target.value)}
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
            onChange={(e) => setRationale(e.target.value)}
            className="w-full rounded border bg-background p-2"
          />
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
