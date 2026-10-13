import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

/*
 * FV-01.4.2G TEMPORARY DIAGNOSTIC — REMOVE AFTER ACCEPTANCE.
 * Count-only HEAD reads through the signed-in user's own browser session (publishable client, RLS applies).
 * No rows, identifiers, tokens or raw backend errors are fetched or rendered. Never runs automatically.
 */
export const FV0142G_TABLES = ["missions", "mission_memberships", "crew_members", "mission_events", "audit_events"] as const;
export type Fv0142gTable = (typeof FV0142G_TABLES)[number];
export const FV0142G_EXPECTED: Record<Fv0142gTable, number> = {
  missions: 1,
  mission_memberships: 1,
  crew_members: 1,
  mission_events: 0,
  audit_events: 0,
};

export type Fv0142gOutcome =
  | { table: Fv0142gTable; kind: "COUNT"; count: number }
  | { table: Fv0142gTable; kind: "ERROR" }
  | { table: Fv0142gTable; kind: "UNSUPPORTED" };

/** Errors and missing counts are never converted into a count, so they can never match an expectation. */
export function classifyProbe(table: Fv0142gTable, count: number | null | undefined, error: unknown): Fv0142gOutcome {
  if (error) return { table, kind: "ERROR" };
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return { table, kind: "UNSUPPORTED" };
  return { table, kind: "COUNT", count };
}

export function outcomeMatchesExpectation(outcome: Fv0142gOutcome): boolean {
  return outcome.kind === "COUNT" && outcome.count === FV0142G_EXPECTED[outcome.table];
}

export function Fv0142gIsolationProbe() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Fv0142gOutcome[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setResults(null);
    setNotice(null);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        setNotice("Not signed in. Sign in on Mission Identity first. No counts were requested.");
        return;
      }
      const next: Fv0142gOutcome[] = [];
      for (const table of FV0142G_TABLES) {
        const { count, error: readError } = await supabase.from(table).select("id", { count: "exact", head: true });
        next.push(classifyProbe(table, count, readError));
      }
      setResults(next);
    } catch {
      setNotice("Diagnostic failed. No conclusion can be drawn (details intentionally hidden).");
    } finally {
      setRunning(false);
    }
  }

  const allMatch = results?.every(outcomeMatchesExpectation) ?? false;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-5 py-10">
        <Card data-testid="fv0142g-isolation-probe">
          <CardHeader><CardTitle>FV-01.4.2G — Temporary cross-mission isolation counts</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>TEMPORARY — REMOVE AFTER ACCEPTANCE. Read-only, count-only. Results are observations from the current authenticated session only; counts are computed by the backend under this session's access rules.</p>
            <Button type="button" variant="outline" disabled={running} onClick={() => void run()}>
              {running ? "Requesting read-only counts…" : "Run five read-only counts"}
            </Button>
            {notice ? <p role="alert">{notice}</p> : null}
            {results ? (
              <div className="space-y-1" aria-live="polite">
                {results.map((outcome) => (
                  <p key={outcome.table} className="font-mono">
                    {outcome.table}: {outcome.kind === "COUNT" ? `COUNT ${outcome.count}` : outcome.kind} (expected {FV0142G_EXPECTED[outcome.table]}){outcomeMatchesExpectation(outcome) ? " — match" : " — MISMATCH"}
                  </p>
                ))}
                {allMatch ? (
                  <p>All five observations match the expectation for a single Crew Self membership. mission_events = 0 is inconclusive while that table has no records.</p>
                ) : (
                  <p role="alert" className="font-semibold text-destructive">STOP: at least one result is a mismatch, ERROR or UNSUPPORTED. Do not continue testing; this is NOT VERIFIED and not PASS.</p>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
