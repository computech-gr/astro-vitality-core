import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { workflowsForRole } from "@/domain/mission-experience/workflows";

export function MissionExperiencePage() {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      setLoading(true);
      try {
        const result = await loadMissionIdentity();
        if (alive && current === revision) { setIdentity(result); setError(result.error ?? ""); }
      } catch (cause) {
        if (alive && current === revision) { setIdentity(null); setError(cause instanceof Error ? cause.message : "Unable to verify mission identity."); }
      } finally { if (alive && current === revision) setLoading(false); }
    };
    void refresh();
    const unsubscribe = subscribeMissionIdentity(() => { void refresh(); });
    return () => { alive = false; revision++; unsubscribe(); };
  }, []);

  const active = identity?.active;
  const workflows = identity?.signedIn && active ? workflowsForRole(active.role) : [];
  return (
    <main id="main-content" className="mx-auto min-h-screen w-full max-w-7xl px-5 pb-16 pt-28 lg:px-8">
      <p className="section-kicker" data-phase="P33">Astronaut Experience & Mission Control</p>
      <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">Mission workspace</h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">Choose a mission task with clear provenance and human oversight. This is a navigation workspace, not a live health-status verdict or a clinical decision system.</p>
      <section aria-label="Identity and access status" className="mt-8 rounded-xl border border-border bg-card p-5" aria-live="polite">
        {loading ? <p role="status">Verifying mission membership…</p> : error ? <p role="alert" className="flex items-center gap-2"><ShieldAlert className="size-5" />{error}</p> : active && identity?.signedIn ? (
          <div className="space-y-2"><p className="font-semibold">Authorized mission: {active.missionName ?? active.missionCode ?? "Selected mission"}</p><p className="text-sm text-muted-foreground">Role: {active.role.replaceAll("_", " ")} · Mission-scoped access · No automatic health interpretation</p></div>
        ) : <p>No active authorized mission selected. Sign in and select a mission to access operational workflows.</p>}
        <div className="mt-4 flex flex-wrap gap-3"><Button asChild variant="outline"><a href="/mission/identity">Mission identity & sign-in <ArrowUpRight className="ml-2 size-4" /></a></Button><Button variant="outline" onClick={() => { setLoading(true); void loadMissionIdentity().then((result) => { setIdentity(result); setError(result.error ?? ""); }).catch((cause: unknown) => { setIdentity(null); setError(cause instanceof Error ? cause.message : "Unable to verify identity."); }).finally(() => setLoading(false)); }}><RefreshCw className="mr-2 size-4" />Refresh access</Button></div>
      </section>
      <section className="mt-9" aria-labelledby="workflows-heading">
        <h2 id="workflows-heading" className="font-display text-2xl font-semibold">Available mission tasks</h2>
        {!loading && workflows.length === 0 ? <p className="mt-4 text-muted-foreground">No tasks available until an active mission membership is verified.</p> : null}
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{workflows.map((item) => <Card key={item.id} className="flex flex-col"><CardHeader><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{item.category}</p><CardTitle className="text-lg">{item.title}</CardTitle></CardHeader><CardContent className="flex flex-1 flex-col justify-between gap-5"><p className="text-sm leading-6 text-muted-foreground">{item.detail}</p><Button asChild variant="outline" className="w-full"><a href={item.href}>Open workflow <ArrowUpRight className="ml-2 size-4" /></a></Button></CardContent></Card>)}</div>
      </section>
      <p className="mt-8 text-sm text-muted-foreground">Links are convenience navigation only; each destination must enforce its own access controls. Synthetic demonstration data is not clinical evidence. Offline records may remain unsynced or require human review.</p>
    </main>
  );
}
