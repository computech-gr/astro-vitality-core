import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, CircleOff, Orbit, RefreshCw, ShieldCheck, UserPlus, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createMissionInvite, loadMissionIdentity, type MissionMembershipContext, type MissionRole } from "@/infrastructure/mission-identity";
import {
  canDeactivateMembership,
  createMissionCrewMember,
  createMissionOperation,
  loadMissionOperationsWorkspace,
  missionTransitionOptions,
  setMissionMembershipActive,
  updateMissionCrewMember,
  updateMissionOperation,
  type CrewStatus,
  type MissionOperationsWorkspace,
  type MissionStatus,
} from "@/infrastructure/mission-operations";

function roleLabel(role: MissionRole) {
  return role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function MissionOperations() {
  const [operators, setOperators] = useState<MissionMembershipContext[]>([]);
  const [missionId, setMissionId] = useState("");
  const [workspace, setWorkspace] = useState<MissionOperationsWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [newMissionCode, setNewMissionCode] = useState("");
  const [newMissionName, setNewMissionName] = useState("");
  const [crewName, setCrewName] = useState("");
  const [crewExternalRef, setCrewExternalRef] = useState("");
  const [crewStatus, setCrewStatus] = useState<CrewStatus>("candidate");
  const [inviteRole, setInviteRole] = useState<MissionRole>("crew_self");
  const [inviteCrewId, setInviteCrewId] = useState("");
  const [createdInvite, setCreatedInvite] = useState("");

  async function refreshIdentity(preferredMissionId?: string) {
    const identity = await loadMissionIdentity();
    const nextOperators = identity.memberships.filter((item) => item.role === "mission_operator");
    setOperators(nextOperators);
    const nextMissionId = preferredMissionId ?? missionId ?? nextOperators[0]?.missionId ?? "";
    if (!nextMissionId && nextOperators[0]?.missionId) setMissionId(nextOperators[0].missionId);
    return { identity, operators: nextOperators };
  }

  async function refreshWorkspace(targetMissionId = missionId) {
    if (!targetMissionId) {
      setWorkspace(null);
      return;
    }
    const next = await loadMissionOperationsWorkspace(targetMissionId);
    setWorkspace(next);
  }

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission operation failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const identity = await loadMissionIdentity();
        if (cancelled) return;
        const nextOperators = identity.memberships.filter((item) => item.role === "mission_operator");
        setOperators(nextOperators);
        const initialMission = nextOperators[0]?.missionId ?? "";
        setMissionId(initialMission);
        if (initialMission) setWorkspace(await loadMissionOperationsWorkspace(initialMission));
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Unable to load mission operations.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const activeCrew = useMemo(() => workspace?.crew.filter((crew) => crew.status === "active") ?? [], [workspace]);

  async function createMission() {
    await run(async () => {
      const result = await createMissionOperation({ code: newMissionCode, name: newMissionName });
      setNewMissionCode("");
      setNewMissionName("");
      await refreshIdentity(result.mission_id);
      setMissionId(result.mission_id);
      await refreshWorkspace(result.mission_id);
    }, "Mission created and your operator membership was provisioned atomically.");
  }

  async function createCrew() {
    if (!missionId) return;
    await run(async () => {
      await createMissionCrewMember({ missionId, displayName: crewName, externalRef: crewExternalRef, status: crewStatus });
      setCrewName("");
      setCrewExternalRef("");
      await refreshWorkspace();
    }, "Crew member added to this mission registry.");
  }

  async function issueInvite() {
    if (!missionId) return;
    await run(async () => {
      const code = await createMissionInvite({ missionId, role: inviteRole, crewMemberId: inviteRole === "crew_self" ? inviteCrewId : undefined });
      setCreatedInvite(code);
      await refreshWorkspace();
    }, "One-time mission invite created. Copy it now and share through an approved channel.");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[92rem] px-5 py-8 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="section-kicker">Mission & crew operations</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Govern the mission lifecycle without bypassing RLS.</h1>
            <p className="mt-4 max-w-4xl leading-7 text-muted-foreground">Mission operators create missions, maintain a mission-scoped crew registry, issue role-bound invites, and deactivate access without destructive deletes. Every mutation is authorized in the database and audited.</p>
          </div>
          <Button variant="outline" disabled={busy || !missionId} onClick={() => void run(() => refreshWorkspace(), "Mission workspace refreshed.")}><RefreshCw className={busy ? "animate-spin" : ""} /> Refresh</Button>
        </section>

        {message ? <div className="mt-6 rounded-md border border-border bg-card/70 p-3 text-sm text-muted-foreground">{message}</div> : null}

        {!operators.length ? (
          <Card className="mt-8"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="text-primary" /> Operator membership required</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-muted-foreground">Sign in through Mission Identity with an active <code>mission_operator</code> membership. Authentication alone does not authorize mission administration.</CardContent></Card>
        ) : (
          <>
            <section className="mt-8 grid gap-5 xl:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Orbit className="text-primary" /> Operator mission</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div><Label>Mission</Label><Select value={missionId} onValueChange={(value) => { setMissionId(value); setCreatedInvite(""); void run(() => refreshWorkspace(value), "Mission workspace loaded."); }}><SelectTrigger className="mt-2"><SelectValue placeholder="Select mission" /></SelectTrigger><SelectContent>{operators.map((item) => <SelectItem key={item.missionId} value={item.missionId}>{item.missionCode ?? item.missionId} · {item.missionName ?? "Mission"}</SelectItem>)}</SelectContent></Select></div>
                  {workspace ? <div className="rounded-md border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{workspace.mission.code}</strong><p className="mt-1 text-sm text-muted-foreground">{workspace.mission.name}</p></div><Badge variant="outline">{workspace.mission.status.toUpperCase()}</Badge></div><p className="mt-3 font-mono text-xs text-muted-foreground">{workspace.mission.id}</p></div> : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Create another mission</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div><Label htmlFor="mission-code">Mission code</Label><Input id="mission-code" value={newMissionCode} onChange={(event) => setNewMissionCode(event.target.value.toUpperCase())} placeholder="LUNAR-01" className="mt-2" /></div>
                  <div><Label htmlFor="mission-name">Mission name</Label><Input id="mission-name" value={newMissionName} onChange={(event) => setNewMissionName(event.target.value)} placeholder="Lunar Surface Mission 01" className="mt-2" /></div>
                  <div className="sm:col-span-2"><Button disabled={busy || newMissionCode.trim().length < 3 || newMissionName.trim().length < 3} onClick={() => void createMission()}><Orbit /> Create planning mission</Button></div>
                </CardContent>
              </Card>
            </section>

            {workspace ? (
              <>
                <section className="mt-8 grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
                  <Card>
                    <CardHeader><CardTitle>Mission lifecycle</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div><Label>Status</Label><Select value={workspace.mission.status} onValueChange={(value) => void run(async () => { await updateMissionOperation({ missionId, status: value as MissionStatus }); await refreshWorkspace(); }, `Mission status changed to ${value}.`)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{missionTransitionOptions(workspace.mission.status).map((status) => <SelectItem key={status} value={status}>{status.toUpperCase()}</SelectItem>)}</SelectContent></Select></div>
                      <p className="text-xs leading-5 text-muted-foreground">Lifecycle is forward-only: planning → active → completed/aborted. Terminal missions cannot be silently reopened.</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="text-primary" /> Add crew member</CardTitle></CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-3">
                      <div><Label htmlFor="crew-name">Display name</Label><Input id="crew-name" value={crewName} onChange={(event) => setCrewName(event.target.value)} className="mt-2" /></div>
                      <div><Label htmlFor="crew-ref">External ref</Label><Input id="crew-ref" value={crewExternalRef} onChange={(event) => setCrewExternalRef(event.target.value)} className="mt-2" placeholder="Optional" /></div>
                      <div><Label>Status</Label><Select value={crewStatus} onValueChange={(value) => setCrewStatus(value as CrewStatus)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="candidate">CANDIDATE</SelectItem><SelectItem value="active">ACTIVE</SelectItem><SelectItem value="inactive">INACTIVE</SelectItem></SelectContent></Select></div>
                      <div className="sm:col-span-3"><Button disabled={busy || crewName.trim().length < 2 || !["planning","active"].includes(workspace.mission.status)} onClick={() => void createCrew()}><UserPlus /> Add to mission registry</Button></div>
                    </CardContent>
                  </Card>
                </section>

                <section className="mt-8">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="text-primary" /> Mission crew registry</CardTitle></CardHeader>
                    <CardContent>{workspace.crew.length ? <div className="grid gap-3 lg:grid-cols-2">{workspace.crew.map((crew) => <div key={crew.crew_member_id} className="rounded-md border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{crew.display_name}</strong>{crew.external_ref ? <p className="mt-1 text-xs text-muted-foreground">{crew.external_ref}</p> : null}</div><Badge variant="outline">{crew.status.toUpperCase()}</Badge></div><p className="mt-3 font-mono text-xs text-muted-foreground">{crew.crew_member_id}</p><div className="mt-4 flex flex-wrap gap-2">{(["candidate","active","inactive"] as const).filter((status) => status !== crew.status).map((status) => <Button key={status} size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => { await updateMissionCrewMember({ missionId, crewMemberId: crew.crew_member_id, status }); await refreshWorkspace(); }, `${crew.display_name} is now ${status}.`)}>{status === "active" ? <BadgeCheck /> : <CircleOff />}{status}</Button>)}</div></div>)}</div> : <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No crew members have been registered for this mission.</div>}</CardContent>
                  </Card>
                </section>

                <section className="mt-8 grid gap-5 xl:grid-cols-[1fr_1fr]">
                  <Card>
                    <CardHeader><CardTitle>Issue mission-scoped invite</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div><Label>Role</Label><Select value={inviteRole} onValueChange={(value) => { setInviteRole(value as MissionRole); if (value !== "crew_self") setInviteCrewId(""); }}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="crew_self">Crew self</SelectItem><SelectItem value="ground_medical">Ground medical</SelectItem><SelectItem value="mission_operator">Mission operator</SelectItem><SelectItem value="researcher">Researcher</SelectItem></SelectContent></Select></div>
                      {inviteRole === "crew_self" ? <div><Label>Active crew member</Label><Select value={inviteCrewId} onValueChange={setInviteCrewId}><SelectTrigger className="mt-2"><SelectValue placeholder="Select crew member" /></SelectTrigger><SelectContent>{activeCrew.map((crew) => <SelectItem key={crew.crew_member_id} value={crew.crew_member_id}>{crew.display_name}</SelectItem>)}</SelectContent></Select></div> : null}
                      <Button disabled={busy || (inviteRole === "crew_self" && !inviteCrewId)} onClick={() => void issueInvite()}>Create one-time invite</Button>
                      {createdInvite ? <div className="rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4"><p className="text-xs uppercase tracking-wider text-emerald-300">One-time code — copy now</p><p className="mt-2 break-all font-mono text-sm">{createdInvite}</p></div> : null}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader><CardTitle>Membership access</CardTitle></CardHeader>
                    <CardContent>{workspace.memberships.length ? <div className="space-y-3">{workspace.memberships.map((membership) => <div key={membership.id} className="rounded-md border border-border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{roleLabel(membership.role)}</strong><p className="mt-1 font-mono text-xs text-muted-foreground">user {membership.user_id.slice(0,8)}…{membership.crew_member_id ? ` · crew ${membership.crew_member_id}` : ""}</p></div><Badge variant={membership.active ? "default" : "outline"}>{membership.active ? "ACTIVE" : "INACTIVE"}</Badge></div><div className="mt-3"><Button size="sm" variant="outline" disabled={busy || (membership.active && !canDeactivateMembership(membership, workspace.memberships))} onClick={() => void run(async () => { await setMissionMembershipActive({ missionId, membershipId: membership.id, active: !membership.active }); await refreshIdentity(); await refreshWorkspace(); }, membership.active ? "Membership deactivated." : "Membership reactivated.")}>{membership.active ? "Deactivate" : "Reactivate"}</Button>{membership.active && membership.role === "mission_operator" && !canDeactivateMembership(membership, workspace.memberships) ? <p className="mt-2 text-xs text-muted-foreground">The last active mission operator cannot be deactivated.</p> : null}</div></div>)}</div> : <p className="text-sm text-muted-foreground">No mission memberships are visible.</p>}</CardContent>
                  </Card>
                </section>
              </>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
