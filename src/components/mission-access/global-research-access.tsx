import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, FileText, Microscope } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DomainExaminationObservations } from "@/components/domain-examination-observations";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import {
  GLOBAL_RESEARCH_PROVENANCE,
  globalResearchAllows,
  missionLabel,
  readGlobalResearchSelection,
  writeGlobalResearchSelection,
} from "@/domain/mission-access/global-research-scope";
import { MEASUREMENT_PROFILES } from "@/domain/health-measurements/profiles";
import { listBoneEntries, type BoneHealthEntry } from "@/domain/bone-health/history";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import {
  importUnifiedObservationEvent,
  listUnifiedObservationEvents,
  listUnifiedObservations,
} from "@/domain/health-intelligence/observation-store";
import { observationDateLabel } from "@/domain/health-intelligence/observation-date";
import { appendObservationSyncReceipts, listObservationSyncReceipts } from "@/domain/health-intelligence/review-ledger";
import { runObservationSync } from "@/domain/health-intelligence/observation-sync-runner";
import { runReviewSync } from "@/domain/health-intelligence/review-sync-runner";
import { notifyReviewDataChanged } from "@/domain/health-intelligence/review-change-events";
import { pullObservationEvents } from "@/lib/observation-sync.functions";
import { pullReviewEvents } from "@/lib/review-sync.functions";

const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-foreground";
const sessionStore = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

/**
 * P72.6 read-only Researcher view across every mission. Visible only with the
 * server-verified global Researcher READ scope (synthetic records only). It can download
 * records to this device and show them; it never uploads, attests, corrects, imports
 * documents, approves or activates anything. Every download is re-authorized by the
 * server and the database.
 */
export function GlobalResearchAccess() {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [missionId, setMissionId] = useState("");
  const [crewMemberId, setCrewMemberId] = useState("");
  const [records, setRecords] = useState<UnifiedObservation[] | null>(null);
  const [domainEntries, setDomainEntries] = useState<Record<string, BoneHealthEntry[]>>({});
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void loadMissionIdentity()
        .then((v) => alive && setIdentity(v))
        .catch(() => alive && setIdentity(null));
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const scope = identity?.signedIn && !identity.error ? identity.globalResearch : undefined;
  const missions = scope?.missions ?? [];
  const mission = missions.find((m) => m.missionId === missionId);

  // Restore (or default) the selection from this tab's memory; IDs only.
  useEffect(() => {
    if (!scope || !identity?.userId) return;
    const remembered = readGlobalResearchSelection(sessionStore(), identity.userId);
    const [m, c] = remembered.split("|");
    if (m && c && globalResearchAllows(scope, m, c, GLOBAL_RESEARCH_PROVENANCE)) {
      setMissionId((prev) => prev || m);
      setCrewMemberId((prev) => prev || c);
    } else {
      const first = scope.missions.find((x) => x.crew.length);
      setMissionId((prev) => (prev && scope.missions.some((x) => x.missionId === prev) ? prev : (first?.missionId ?? "")));
    }
  }, [scope, identity?.userId]);

  useEffect(() => {
    if (!mission) return;
    setCrewMemberId((prev) => (mission.crew.some((c) => c.crewMemberId === prev) ? prev : (mission.crew[0]?.crewMemberId ?? "")));
  }, [mission]);

  const allowed = Boolean(scope && missionId && crewMemberId && globalResearchAllows(scope, missionId, crewMemberId, GLOBAL_RESEARCH_PROVENANCE));

  useEffect(() => {
    if (allowed && identity?.userId) writeGlobalResearchSelection(sessionStore(), identity.userId, `${missionId}|${crewMemberId}`);
  }, [allowed, identity?.userId, missionId, crewMemberId]);

  useEffect(() => {
    setRecords(null);
    setDomainEntries({});
    if (!allowed) return;
    let active = true;
    void listUnifiedObservations(missionId, crewMemberId)
      .then((rows) => active && setRecords(rows.filter((r) => r.provenance === GLOBAL_RESEARCH_PROVENANCE)))
      .catch(() => active && setRecords([]));
    void Promise.all(
      Object.values(MEASUREMENT_PROFILES).map(async (p) => [p.domainId, await listBoneEntries(missionId, crewMemberId, p).catch(() => [])] as const),
    ).then((pairs) => active && setDomainEntries(Object.fromEntries(pairs)));
    return () => {
      active = false;
    };
  }, [allowed, missionId, crewMemberId, version]);

  const download = useCallback(async () => {
    if (!allowed || busy) return;
    setBusy(true);
    setStatus("Checking read access with the server…");
    const s = { missionId, crewMemberId, provenance: GLOBAL_RESEARCH_PROVENANCE };
    try {
      const fresh = await loadMissionIdentity({ freshGlobalResearch: true });
      const userId = fresh.signedIn && !fresh.error ? fresh.userId : undefined;
      if (!userId || userId !== identity?.userId || !globalResearchAllows(fresh.globalResearch, missionId, crewMemberId, s.provenance))
        throw new Error("Read access for this mission and crew member is no longer valid. Nothing was downloaded.");
      const obs = await runObservationSync(
        { scope: s, canUpload: false, realDataConfirmed: false },
        {
          listLocal: async () => (await listUnifiedObservationEvents(missionId, crewMemberId)).map((e) => ({ eventId: e.eventId, eventKind: e.eventKind, observation: e.observation })),
          listReceipts: () => listObservationSyncReceipts(s),
          appendReceipts: (rs) => appendObservationSyncReceipts(rs, s, userId),
          importEvent: (e) => importUnifiedObservationEvent(e),
          // Read-only: the run never uploads (canUpload false); this throws if ever reached.
          push: () => Promise.reject(new Error("Researcher read access never uploads.")),
          pull: (a) => pullObservationEvents({ data: a }),
          now: () => new Date().toISOString(),
        },
      );
      const rev = await runReviewSync(
        { scope: s, actorUserId: userId, canPush: false, history: await listUnifiedObservations(missionId, crewMemberId) },
        {
          push: () => Promise.reject(new Error("Researcher read access never uploads.")),
          pull: (a) => pullReviewEvents({ data: a }),
          now: () => new Date().toISOString(),
        },
      );
      notifyReviewDataChanged({ missionId, crewMemberId });
      setStatus(`Examinations: ${obs.status === "ok" ? "" : `${obs.status} — `}${obs.message} Reviews: ${rev.status === "ok" ? "" : `${rev.status} — `}${rev.message} Nothing was uploaded, confirmed or approved.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Download failed. Nothing was changed.");
    } finally {
      setBusy(false);
      setVersion((v) => v + 1);
    }
  }, [allowed, busy, missionId, crewMemberId, identity?.userId]);

  const counts = useMemo(() => {
    if (!records) return null;
    const active = records.filter((r) => r.status !== "erroneous");
    return {
      total: active.length,
      accepted: active.filter((r) => r.reviewState === "accepted").length,
      series: new Set(active.map((r) => `${r.metricId}|${r.originalUnit}`)).size,
    };
  }, [records]);

  if (!identity) return <p className="mx-auto max-w-6xl px-5 py-8 text-sm text-muted-foreground" role="status">Checking access…</p>;
  if (!identity.signedIn)
    return <p className="mx-auto max-w-6xl px-5 py-8 text-sm" role="status">Sign in with the Researcher account to open missions.</p>;
  if (!scope)
    return (
      <p className="mx-auto max-w-6xl px-5 py-8 text-sm" role="status">
        This account has no server-verified global Researcher read access. Mission records appear here only after that access is granted.
      </p>
    );

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-foreground sm:px-5">
      <header>
        <p className="section-kicker">P72.6 · Researcher</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">All missions · read-only</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Server-verified Researcher read access to every mission ({missions.length}). Synthetic records only. This view cannot upload,
          confirm, attest, correct, approve or activate anything; Medical and catalog activation permissions are not included.
        </p>
      </header>

      <section aria-label="Choose mission and crew member" className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2">
        <label className="text-sm">
          Mission
          <select className={field} value={missionId} onChange={(e) => { setMissionId(e.target.value); setCrewMemberId(""); setStatus(""); }}>
            <option value="">Select mission</option>
            {missions.map((m) => (
              <option key={m.missionId} value={m.missionId}>
                {missionLabel(m)}{m.crew.length ? "" : " (no assigned crew)"}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Crew member
          <select className={field} value={crewMemberId} disabled={!mission?.crew.length} onChange={(e) => { setCrewMemberId(e.target.value); setStatus(""); }}>
            <option value="">Select crew member</option>
            {(mission?.crew ?? []).map((c) => (
              <option key={c.crewMemberId} value={c.crewMemberId}>
                {c.displayName ?? c.crewMemberId}{c.externalRef ? ` (${c.externalRef})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="button" onClick={() => void download()} disabled={!allowed || busy}>
            <Download /> {busy ? "Downloading…" : "Download records to this device (read-only)"}
          </Button>
          <Button asChild variant="outline"><Link to="/mission/health-report"><FileText /> Full Health Report</Link></Button>
          <Button asChild variant="outline"><Link to="/mission/scientific-review"><Microscope /> Scientific Review</Link></Button>
        </div>
        {status ? <p className="text-sm sm:col-span-2" role="status">{status}</p> : null}
      </section>

      {allowed ? (
        <>
          <section aria-label="Examinations (read-only)" className="rounded-xl border border-border p-5">
            <h2 className="text-xl font-semibold">Examinations · read-only</h2>
            {!records ? (
              <p className="mt-3 text-sm text-muted-foreground" role="status">Reading encrypted local records…</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground" data-count="examinations">
                  {counts?.total ?? 0} synthetic examination records on this device ({counts?.accepted ?? 0} reviewer-confirmed,{" "}
                  {counts?.series ?? 0} biomarker series). Use Download to fetch records from the cloud. Zero is not a negative finding.
                </p>
                {records.length ? (
                  <div className="mt-4 max-h-[32rem] overflow-auto rounded border border-border">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-card">
                        <tr>
                          <th className="p-2">Biomarker</th>
                          <th className="p-2">Value</th>
                          <th className="p-2">Unit</th>
                          <th className="p-2">Observed</th>
                          <th className="p-2">Health domain</th>
                          <th className="p-2">Review</th>
                          <th className="p-2">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={r.id} className="border-t border-border align-top">
                            <td className="p-2 font-mono">{r.metricId}</td>
                            <td className="p-2 font-mono">{r.value}</td>
                            <td className="p-2">{r.reportedUnit ?? r.originalUnit}</td>
                            <td className="p-2">{observationDateLabel(r)}</td>
                            <td className="p-2">{r.domain}</td>
                            <td className="p-2">
                              {r.status === "erroneous" ? "Erroneous (kept in history)" : r.reviewState.replaceAll("_", " ")}
                            </td>
                            <td className="p-2 text-muted-foreground">{r.source.label}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section aria-label="Health Domains (read-only)">
            <h2 className="text-xl font-semibold">Health Domains · read-only</h2>
            {Object.values(MEASUREMENT_PROFILES).map((profile) => (
              <DomainExaminationObservations
                key={`${profile.domainId}:${missionId}:${crewMemberId}:${version}`}
                profile={profile}
                missionId={missionId}
                crewMemberId={crewMemberId}
                domainEntries={domainEntries[profile.domainId] ?? []}
              />
            ))}
          </section>
        </>
      ) : null}
    </main>
  );
}
