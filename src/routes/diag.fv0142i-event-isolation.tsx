// FV-01.4.2I B7 TEMPORARY COUNT-ONLY EVENT ISOLATION DIAGNOSTIC — REMOVE AFTER B7. Not linked from navigation.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const TARGETS = [
  { label: "FV01-TEST-A mission_events", missionId: "mission-72dcc77a19d1483ab0ef1fd1c8909a2c" },
  { label: "FV01-TEST-B mission_events", missionId: "mission-f0569228f13f47df98dece1940d16ba2" },
  { label: "MISSION_TEST mission_events", missionId: "mission-3fd366c331ed46afb0645cced1d45294" },
] as const;

type Result = { kind: "COUNT"; value: number } | { kind: "ERROR" } | { kind: "UNSUPPORTED" };

function Probe() {
  const [results, setResults] = useState<Result[] | null>(null);
  const [running, setRunning] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  async function run() {
    if (running) return;
    setRunning(true);
    try {
      const { data } = await supabase.auth.getSession();
      const ok = Boolean(data.session);
      setSignedIn(ok);
      if (!ok) return;
      const out: Result[] = [];
      for (const t of TARGETS) {
        try {
          const { count, error } = await supabase
            .from("mission_events")
            .select("id", { count: "exact", head: true })
            .eq("mission_id", t.missionId);
          if (error) out.push({ kind: "ERROR" });
          else if (typeof count !== "number") out.push({ kind: "UNSUPPORTED" });
          else out.push({ kind: "COUNT", value: count });
        } catch {
          out.push({ kind: "ERROR" });
        }
      }
      setResults(out);
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>FV-01.4.2I temporary event isolation check</CardTitle>
          <p className="text-sm text-muted-foreground">Count-only reads with your own signed-in session. No row content is fetched; nothing is written.</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Button disabled={running} onClick={() => void run()}>{running ? "Counting…" : "Run count-only check"}</Button>
          {signedIn === false ? <p>Not signed in. Sign in on Mission Identity first.</p> : null}
          {results ? (
            <ul className="space-y-1 font-mono text-xs">
              {TARGETS.map((t, i) => {
                const r = results[i]!;
                return <li key={t.missionId}>{t.label}: {r.kind === "COUNT" ? `COUNT ${r.value}` : r.kind}</li>;
              })}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

export const Route = createFileRoute("/diag/fv0142i-event-isolation")({
  head: () => ({
    meta: [
      { title: "Temporary event isolation check | The Mitochondria" },
      { name: "description", content: "Temporary owner-operated count-only isolation check." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Temporary event isolation check" },
      { property: "og:description", content: "Temporary owner-operated count-only isolation check." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: Probe,
});
