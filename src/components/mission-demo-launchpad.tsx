import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { summarizeDemoAccess } from "@/domain/mission-access/demo-readiness";
import { DEMO_JOURNEY, getDemoJourneyAccess, isReservedDemoMission } from "@/domain/mission-access/demo-journey";

/** Operator-visible navigation only. Every destination enforces its own RBAC/RLS. */
export const SYNTHETIC_DEMO_JOURNEY = DEMO_JOURNEY;

export function MissionDemoLaunchpad({ missionCode }: { missionCode: string }) {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { void loadMissionIdentity().then((value) => { if (active) setIdentity(value); }).catch(() => { if (active) setIdentity(null); }); };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);
  const access = summarizeDemoAccess(identity, missionCode);
  return (
    <section className="mt-8" aria-label="Synthetic mission demo launchpad">
      <Card>
        <CardHeader><CardTitle>Synthetic mission demo journey</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Operator mission: {missionCode}. These are navigation links, not elevated privileges. Each page independently checks identity, crew assignment and database authorization. No impersonation, clinical activation or real-data processing is enabled.</p>
          <div className="mt-4 rounded-md border border-border bg-muted/30 p-3" aria-label="Demo authorization readiness">
            <p className="text-sm font-semibold">Demo authorization readiness</p>
            <p className="mt-1 text-xs text-muted-foreground">{access.summary}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {access.checks.map((check) => <li key={check.label}>{check.label}: {check.status}</li>)}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Read-only membership inspection. This panel does not grant access, select a new mission, impersonate a crew member or enable clinical/real-data processing.</p>
          </div>
          {isReservedDemoMission(missionCode) && <p role="note" className="mt-4 rounded-md border border-amber-500/40 p-3 text-sm">MISSION_TEST is reserved for final acceptance. This journey is navigation-only; do not write or create demo records in this mission. Use a separately approved synthetic demo mission.</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SYNTHETIC_DEMO_JOURNEY.map((step, index) => (
              <a key={step.href} href={step.href} className="rounded-md border border-border p-3 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                <span className="text-sm font-semibold">{index + 1}. {step.label}</span>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.purpose}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">Access: {getDemoJourneyAccess(identity, missionCode, step)}</p>
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Full administrator demo execution across role-separated workflows requires a separately reviewed backend authorization design and isolated synthetic demo mission. Operator membership alone does not confer Crew Self or Ground Medical rights.</p>
        </CardContent>
      </Card>
    </section>
  );
}
