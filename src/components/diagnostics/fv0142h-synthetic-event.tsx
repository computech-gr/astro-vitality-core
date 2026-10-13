// FV-01.4.2H B6-A TEMPORARY SYNTHETIC EVENT TEST UI — REMOVE AFTER B6 ACCEPTANCE. Not linked from navigation.
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import {
  FV0142H_PAYLOAD,
  FV0142H_SUBMISSION_ENABLED,
  resolveFv0142hTarget,
  submitFv0142hEvent,
  type Fv0142hResolution,
  type Fv0142hSubmitOutcome,
} from "@/diagnostics/fv0142h-synthetic-event";

const REASON: Record<Exclude<Fv0142hResolution, { ok: true }>["reason"], string> = {
  not_signed_in: "Not signed in. Sign in on Mission Identity first.",
  no_eligible_membership: "This account has no eligible FV-01 test Crew Self membership.",
  ambiguous_membership: "Membership set is not exactly one eligible Crew Self membership. Stopped.",
};

export function Fv0142hSyntheticEventTest() {
  const [resolution, setResolution] = useState<Fv0142hResolution | null>(null);
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<Fv0142hSubmitOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function check() {
    setChecking(true);
    if (outcome !== null) return;
    try {
      const snapshot = await loadMissionIdentity();
      setResolution(resolveFv0142hTarget(snapshot.signedIn, snapshot.memberships));
    } catch {
      setResolution({ ok: false, reason: "not_signed_in" });
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (!resolution?.ok || submitting || outcome !== null || !FV0142H_SUBMISSION_ENABLED) return;
    setSubmitting(true);
    try {
      setOutcome(await submitFv0142hEvent(supabase as unknown as Parameters<typeof submitFv0142hEvent>[0], resolution, new Date().toISOString()));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>FV-01.4.2H temporary synthetic event test</CardTitle>
          <p className="text-sm text-muted-foreground">Temporary owner-operated test page. Synthetic, non-medical marker only.</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>Kind: operational_event · Classification: synthetic · Source: fv01-b6-synthetic 1.0.0</p>
          <p className="font-mono text-xs">Payload: {JSON.stringify(FV0142H_PAYLOAD)}</p>
          <Button variant="secondary" disabled={checking || submitting || outcome !== null} onClick={() => void check()}>{checking ? "Checking…" : "Check eligibility"}</Button>
          {resolution ? (
            resolution.ok ? (
              <p>Eligible: {resolution.missionCode} · event {resolution.eventId}</p>
            ) : (
              <p>{REASON[resolution.reason]}</p>
            )
          ) : null}
          <Button disabled={!FV0142H_SUBMISSION_ENABLED || !resolution?.ok || submitting || outcome !== null} onClick={() => void submit()}>
            Submit synthetic event
          </Button>
          {!FV0142H_SUBMISSION_ENABLED ? <p className="text-muted-foreground">Submission is technically disabled pending separate owner authorization (B6-B).</p> : null}
          {submitting ? <p>Submitting… do not reload or click again.</p> : null}
          {outcome ? <p><strong>Final result: {outcome}</strong> — this page is now locked. Do not retry; report this result.</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
