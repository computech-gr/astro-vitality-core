import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const TEST_EMAILS = new Set(["security@computech.gr", "support@computech.gr"]);
const TABLES = ["missions", "mission_memberships", "crew_members", "mission_events", "audit_events"] as const;
type Result = { table: (typeof TABLES)[number]; count: number | null; error: string | null };

/** Temporary owner-operated diagnostic. Client-side gating is NOT a security boundary. */
export function MissionRlsCountProbe({ email, membershipCount }: { email?: string; membershipCount: number }) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!email || !TEST_EMAILS.has(email.toLowerCase()) || membershipCount !== 0) return null;
  const expectedEmail = email.toLowerCase();

  async function run() {
    setRunning(true);
    setResults(null);
    setError(null);
    try {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user || userData.user.email?.toLowerCase() !== expectedEmail) {
        setError("Authenticated identity changed. No probes executed.");
        return;
      }
      const next: Result[] = [];
      for (const table of TABLES) {
        // HEAD + count only; no rows or mission identifiers are retrieved.
        const { count, error: readError } = await supabase.from(table).select("id", { count: "exact", head: true });
        next.push({ table, count, error: readError ? "Read denied or unavailable (details intentionally hidden)" : null });
      }
      setResults(next);
    } catch {
      setError("Diagnostic failed. No conclusion can be drawn.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card className="mt-8 border-amber-400/40" data-testid="fv0141g-rls-probe">
      <CardHeader><CardTitle>FV-01.4.1G — Temporary read-only RLS verification</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>TEMPORARY — REMOVE AFTER ACCEPTANCE. Owner-operated diagnostic for synthetic accounts only. Counts are computed by the backend under this signed-in session. This is not a substitute for reviewing the RLS policies.</p>
        <p className="font-mono">Account: {email}</p>
        <Button type="button" variant="outline" disabled={running} onClick={() => void run()}>
          {running ? "Checking read-only counts…" : "Run five read-only RLS counts"}
        </Button>
        {error ? <p role="alert">{error}</p> : null}
        {results ? (
          <div className="space-y-1" aria-live="polite">
            {results.map(({ table, count, error: readError }) => (
              <p key={table} className="font-mono">{table}: {readError ? `ERROR (${readError})` : `count=${count ?? "UNKNOWN"}`}</p>
            ))}
            {results.some((result) => result.count !== null && result.count > 0) ? (
              <p role="alert" className="font-semibold text-destructive">STOP: A nonzero count was returned. Do not share these results publicly. Stop testing and investigate authorization.</p>
            ) : null}
            <p>Expected: count=0 for both test accounts. An error or unknown count is NOT VERIFIED, not PASS. A zero for mission_events is inconclusive if that table has no records.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
