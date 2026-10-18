import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { summarizeDemoAccess } from "@/domain/mission-access/demo-readiness";
import { buildDemoRunbook, summarizeDemoActors } from "@/domain/mission-access/demo-runbook";
import { buildSyntheticDemoDataset, summarizeSyntheticDemoDataset } from "@/domain/mission-access/synthetic-demo-dataset";
import { DEMO_JOURNEY, getDemoJourneyAccess, isReservedDemoMission, canRecordDemoJourneyEvidence, summarizeDemoJourneyEvidence, type DemoJourneyEvidence } from "@/domain/mission-access/demo-journey";

/** Operator-visible navigation only. Every destination enforces its own RBAC/RLS. */
export const SYNTHETIC_DEMO_JOURNEY = DEMO_JOURNEY;

export function MissionDemoLaunchpad({ missionCode }: { missionCode: string }) {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [evidence, setEvidence] = useState<Record<string, DemoJourneyEvidence>>({});
  useEffect(() => {
    let active = true;
    const refresh = () => { void loadMissionIdentity().then((value) => { if (active) setIdentity(value); }).catch(() => { if (active) setIdentity(null); }); };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => { active = false; unsubscribe(); };
  }, []);
  useEffect(() => { setEvidence({}); }, [missionCode]);
  const access = summarizeDemoAccess(identity, missionCode);
  const editable = canRecordDemoJourneyEvidence(missionCode);
  const progress = summarizeDemoJourneyEvidence(DEMO_JOURNEY.map(step => evidence[step.href] ?? "not_checked"));
  const runbook = buildDemoRunbook(missionCode, identity, evidence);
  const actors = summarizeDemoActors(runbook);
  const demoDataset = buildSyntheticDemoDataset(missionCode);
  const datasetSummary = summarizeSyntheticDemoDataset(demoDataset);
  const exportDataset = () => {
    if (isReservedDemoMission(missionCode)) return;
    const blob = new Blob([JSON.stringify(demoDataset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mitochondria-synthetic-dataset-${missionCode.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const exportRunbook = () => {
    const blob = new Blob([JSON.stringify(runbook, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mitochondria-demo-runbook-${missionCode.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
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
          <div className="mt-4 rounded-md border border-border p-3" aria-label="Demo journey execution tracker">
            <p className="text-sm font-semibold">Demo execution tracker — this browser session only</p>
            <p className="mt-1 text-xs text-muted-foreground">{progress.observed}/{progress.total} observed · {progress.blocked} blocked · {progress.remaining} not checked. This is a manual navigation checklist, not proof of authorization, backend acceptance or scientific validation.</p>
            <p className="mt-1 text-xs text-muted-foreground">No data is stored, uploaded or synchronized. Reset happens when the page reloads or mission changes. MISSION_TEST cannot be marked complete.</p>
            <button type="button" disabled={!editable || progress.observed + progress.blocked === 0} className="mt-2 rounded border border-border px-3 py-1 text-xs disabled:opacity-50" onClick={() => setEvidence({})}>Reset checklist</button>
          </div>
          <div className="mt-4 rounded-md border border-border p-3" aria-label="Demo role handoff runbook">
            <p className="text-sm font-semibold">Operational demo runbook — role-separated handoffs</p>
            <p className="mt-1 text-xs text-muted-foreground">This is an offline planning export, not an authorization, an audit receipt or proof that a step was completed. No cloud calls or stored data.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {actors.map(item => (
                <div key={item.actor} className="rounded border border-border p-2 text-xs">
                  <span className="font-semibold">{item.actor.replaceAll("_", " ")}</span>
                  <span className="ml-2 text-muted-foreground">{item.steps} steps · {item.membershipVisible ? "membership visible" : "separate authorized account required"}</span>
                </div>
              ))}
            </div>
            <button type="button" onClick={exportRunbook} className="mt-3 rounded border border-border px-3 py-2 text-xs hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">Export offline demo runbook (JSON)</button>
            <p className="mt-2 text-xs text-muted-foreground">Exporting from MISSION_TEST is planning-only and always resets all statuses to not checked. Never import the export as execution evidence.</p>
          </div>
          <div className="mt-4 rounded-md border border-border p-3" aria-label="Synthetic multi-domain demo dataset">
            <p className="text-sm font-semibold">Synthetic multi-domain demo dataset</p>
            <p className="mt-1 text-xs text-muted-foreground">Deterministic fictional astronaut records for offline demo rehearsal. {datasetSummary.total} observations across {datasetSummary.domains} health domains, {datasetSummary.timepoints} timepoints. Values are illustrative, not clinical thresholds or validated health findings.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {datasetSummary.byDomain.map(item => <div key={item.domain} className="rounded border border-border p-2 text-xs"><span className="font-semibold">{item.domain}</span><p className="text-muted-foreground">{item.count} fictional observations</p></div>)}
            </div>
            <button type="button" disabled={isReservedDemoMission(missionCode)} onClick={exportDataset} className="mt-3 rounded border border-border px-3 py-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">Export synthetic demo dataset (JSON)</button>
            <p className="mt-2 text-xs text-muted-foreground">Local download only. No Cloud writes, real people, device connections or scientific interpretation. MISSION_TEST export is disabled. Import into canonical health records is intentionally not enabled.</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SYNTHETIC_DEMO_JOURNEY.map((step, index) => (
              <div key={step.href} className="rounded-md border border-border p-3">
                <a href={step.href} className="block rounded hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                <span className="text-sm font-semibold">{index + 1}. {step.label}</span>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.purpose}</p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">Access: {getDemoJourneyAccess(identity, missionCode, step)}</p>
                </a>
                <label className="mt-3 block text-xs text-muted-foreground">Manual verification status
                  <select aria-label={`${step.label} manual verification status`} disabled={!editable} className="mt-1 block w-full rounded border border-border bg-background p-2 text-foreground disabled:opacity-50" value={evidence[step.href] ?? "not_checked"} onChange={event => setEvidence(previous => ({ ...previous, [step.href]: event.target.value as DemoJourneyEvidence }))}>
                    <option value="not_checked">Not checked</option><option value="observed">Observed manually</option><option value="blocked">Blocked / unavailable</option>
                  </select>
                </label>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Full administrator demo execution across role-separated workflows requires a separately reviewed backend authorization design and isolated synthetic demo mission. Operator membership alone does not confer Crew Self or Ground Medical rights.</p>
        </CardContent>
      </Card>
    </section>
  );
}
