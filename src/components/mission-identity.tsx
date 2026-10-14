import { useEffect, useMemo, useState } from "react";
import { KeyRound, LogIn, LogOut, Mail, Orbit, RefreshCw, ShieldCheck, UserRoundCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activateFirstMission, loadFirstOperatorBootstrapStatus, type FirstOperatorBootstrapStatus } from "@/infrastructure/first-operator-activation";
import { loadInviteCrewOptions, type MissionOperationsCrew } from "@/infrastructure/mission-operations";
import { loadMissionAuthReadiness, type MissionAuthReadiness } from "@/infrastructure/mission-auth-readiness";
import {
  acceptMissionInvite,
  createMissionInvite,
  loadMissionIdentity,
  requestMissionMagicLink,
  setActiveMissionMembership,
  signInMissionIdentity,
  signOutMissionIdentity,
  signUpMissionIdentity,
  subscribeMissionIdentity,
  validateMissionSignUpPassword,
  type MissionIdentitySnapshot,
  type MissionMembershipContext,
  type MissionRole,
} from "@/infrastructure/mission-identity";

const EMPTY: MissionIdentitySnapshot = {
  configured: true,
  signedIn: false,
  memberships: [],
};

function membershipKey(item: MissionMembershipContext) {
  return `${item.missionId}::${item.role}::${item.crewMemberId ?? ""}`;
}

function roleLabel(role: MissionRole) {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function MissionIdentity() {
  const [snapshot, setSnapshot] = useState<MissionIdentitySnapshot>(EMPTY);
  const [authReadiness, setAuthReadiness] = useState<MissionAuthReadiness | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRole, setInviteRole] = useState<MissionRole>("crew_self");
  const [inviteCrewMemberId, setInviteCrewMemberId] = useState("");
  const [createdInvite, setCreatedInvite] = useState<string | null>(null);
  const [bootstrapCode, setBootstrapCode] = useState("");
  const [bootstrapName, setBootstrapName] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [bootstrapStatus, setBootstrapStatus] = useState<FirstOperatorBootstrapStatus | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      const [identity, readiness] = await Promise.all([loadMissionIdentity(), loadMissionAuthReadiness()]);
      setSnapshot(identity);
      setAuthReadiness(readiness);
      // Fail closed while status is unavailable, including during sign-out.
      setBootstrapStatus(identity.signedIn ? await loadFirstOperatorBootstrapStatus() : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission identity refresh failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    return subscribeMissionIdentity(() => void refresh());
  }, []);

  const activeKey = snapshot.active ? membershipKey(snapshot.active) : "";
  const operatorMemberships = useMemo(
    () => snapshot.memberships.filter((item) => item.role === "mission_operator"),
    [snapshot.memberships],
  );
  const [inviteMissionId, setInviteMissionId] = useState("");
  const [inviteCrewOptions, setInviteCrewOptions] = useState<MissionOperationsCrew[]>([]);
  const [inviteCrewLoading, setInviteCrewLoading] = useState(false);
  const [inviteCrewError, setInviteCrewError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteMissionId && operatorMemberships[0]) setInviteMissionId(operatorMemberships[0].missionId);
  }, [inviteMissionId, operatorMemberships]);

  // Load eligible crew for the selected mission through the existing RLS-protected
  // workspace loader. Changing mission or role clears any previous selection first.
  useEffect(() => {
    setInviteCrewMemberId("");
    setInviteCrewOptions([]);
    setInviteCrewError(null);
    if (!inviteMissionId || inviteRole !== "crew_self") {
      setInviteCrewLoading(false);
      return;
    }
    let cancelled = false;
    setInviteCrewLoading(true);
    loadInviteCrewOptions(inviteMissionId)
      .then((crew) => {
        if (cancelled) return;
        setInviteCrewOptions(crew);
        setInviteCrewLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        setInviteCrewError(error instanceof Error ? error.message : "Crew list could not be loaded.");
        setInviteCrewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteMissionId, inviteRole]);

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mission identity action failed.");
      setBusy(false);
    }
  }

  async function signUp() {
    const passwordError = validateMissionSignUpPassword(password);
    if (passwordError) {
      setMessage(passwordError);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await signUpMissionIdentity(email, password);
      setMessage(
        result.confirmationRequired
          ? "Account created. Check your email to confirm it, then return here to sign in."
          : "Account created and signed in.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account creation failed.");
      setBusy(false);
    }
  }

  async function createInvite() {
    setBusy(true);
    setMessage(null);
    setCreatedInvite(null);
    try {
      const code = await createMissionInvite({
        missionId: inviteMissionId,
        role: inviteRole,
        ...(inviteCrewMemberId.trim() ? { crewMemberId: inviteCrewMemberId.trim() } : {}),
      });
      setCreatedInvite(code);
      setMessage("One-time mission invite created. Share it through an approved channel; it is shown only now.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invite creation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[92rem] px-5 py-8 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="section-kicker">Mission identity & governed cloud access</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Sign in. Select a mission. Keep provenance intact.</h1>
            <p className="mt-4 max-w-4xl leading-7 text-muted-foreground">
              Authentication never unlocks cloud writes by itself. Synchronization requires an active mission membership, and live physiological capture uses a crew-self mission context only when that membership identifies the crew member.
            </p>
          </div>
          <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw className={busy ? "animate-spin" : ""} /> Refresh identity
          </Button>
        </section>

        {message ? <div className="mt-6 rounded-md border border-border bg-card/70 p-3 text-sm text-muted-foreground">{message}</div> : null}
        {snapshot.error ? <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">{snapshot.error}</div> : null}
        {authReadiness ? (
          <div className={`mt-3 rounded-md border p-3 text-sm ${authReadiness.state === "configuration_required" ? "border-rose-400/40 bg-rose-400/10 text-rose-200" : authReadiness.state === "unknown" ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>
            <strong>{authReadiness.state === "configuration_required" ? "CONFIGURATION REQUIRED" : authReadiness.state === "unknown" ? "AUTH READINESS UNKNOWN" : "AUTH READY"}</strong> — {authReadiness.message}
          </div>
        ) : null}

        {!snapshot.signedIn && (
          <Card className="mt-6 border-border">
            <CardHeader><CardTitle>First mission activation</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>For a brand-new deployment only: an authorized administrator must provision the first mission operator before invitations can be issued. Existing deployments do not require this step. Creating an account alone does not grant mission access.</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Create and confirm the intended operator account using the form below.</li>
                <li>Have an authorized deployment administrator run the existing one-time server-side bootstrap procedure documented in SECURE_BOOTSTRAP_AUTH_READINESS.md. Never paste privileged keys or passwords into this page or a chat.</li>
                <li>Sign in again, then use Mission &amp; Crew Operations to create active crew members and issue one-time crew-self and ground-medical invites.</li>
                <li>Have each invited person sign in with their own account and accept their invite here. Only then perform synthetic browser-to-cloud validation.</li>
              </ol>
              <p>No automatic user, mission or membership creation occurs on this page.</p>
            </CardContent>
          </Card>
        )}

        <h2 className="mt-10 font-display text-2xl font-semibold">Mission access</h2>
        {!snapshot.signedIn ? (
          <section className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><LogIn className="text-primary" /> Mission sign-in</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div><Label htmlFor="mission-email">Email</Label><Input id="mission-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="astronaut@example.org" className="mt-2" /></div>
                  <div>
                    <Label htmlFor="mission-password">Password</Label>
                    <Input id="mission-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2" aria-describedby="mission-password-note mission-password-error" aria-invalid={Boolean(password && validateMissionSignUpPassword(password))} />
                    <p id="mission-password-note" className="mt-2 text-xs text-muted-foreground">Password must contain at least 12 characters.</p>
                    {password && validateMissionSignUpPassword(password) ? <p id="mission-password-error" role="alert" className="mt-1 text-xs text-rose-300">{validateMissionSignUpPassword(password)}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button disabled={busy || authReadiness?.state === "configuration_required" || !email.trim() || !password} onClick={() => void run(() => signInMissionIdentity(email, password))}><LogIn /> Sign in</Button>
                    <Button variant="outline" disabled={busy || authReadiness?.state === "configuration_required" || authReadiness?.signupAllowed === false || !email.trim() || Boolean(validateMissionSignUpPassword(password))} onClick={() => void signUp()}><UserRoundCheck /> Create account</Button>
                    <Button variant="ghost" disabled={busy || authReadiness?.state === "configuration_required" || !email.trim()} onClick={() => void run(() => requestMissionMagicLink(email), "Magic sign-in link sent. Check your email.")}><Mail /> Email magic link</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="text-primary" /> Security boundary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
                <p>Signing in establishes identity only. Mission tables remain protected by RLS and mission membership.</p>
                <p>New accounts have no mission access until an authorized operator issues an invite or provisions membership.</p>
                <p>Local encrypted capture keeps working while signed out; cloud synchronization stays locked.</p>
              </CardContent>
            </Card>
          </section>
        ) : (
          <>
            {snapshot.memberships.length === 0 && bootstrapStatus?.operatorExists === false && bootstrapStatus.bootstrapArmed && !bootstrapStatus.bootstrapConsumed && (
              <Card className="mt-8 border-border">
                <CardHeader><CardTitle>Redeem first-operator activation</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>Only use this after an authorized deployment administrator has armed the one-time bootstrap hash through a privileged database console. This form never arms bootstrap or grants access without the server-side secret.</p>
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs leading-6">
                    <p className="font-semibold text-foreground">Activation prerequisites</p>
                    <ol className="list-decimal pl-5">
                      <li>Confirm this account's email and sign in.</li>
                      <li>Generate the secret and hash on your trusted computer with <code>node scripts/prepare-first-operator-bootstrap.mjs</code>.</li>
                      <li>Approve the hash-only SQL statement for an authorized Lovable Cloud database administrator. Never send the secret.</li>
                      <li>After the administrator confirms the hash was armed, enter the private secret below once.</li>
                    </ol>
                    <p className="mt-2">If privileged execution is unavailable, stop here. This page cannot bypass database permissions.</p>
                  </div>
                  <div><Label htmlFor="bootstrap-code">First mission code</Label><Input id="bootstrap-code" value={bootstrapCode} onChange={(event) => setBootstrapCode(event.target.value)} autoComplete="off" placeholder="MISSION_TEST" className="mt-2" /></div>
                  <div><Label htmlFor="bootstrap-name">First mission name</Label><Input id="bootstrap-name" value={bootstrapName} onChange={(event) => setBootstrapName(event.target.value)} autoComplete="off" placeholder="Mitochondria validation mission" className="mt-2" /></div>
                  <div><Label htmlFor="bootstrap-secret">One-time bootstrap secret</Label><Input id="bootstrap-secret" type="password" autoComplete="off" value={bootstrapSecret} onChange={(event) => setBootstrapSecret(event.target.value)} className="mt-2" /></div>
                  <Button disabled={busy || bootstrapStatus?.operatorExists !== false || !bootstrapStatus.bootstrapArmed || bootstrapStatus.bootstrapConsumed || bootstrapSecret.length < 32 || bootstrapCode.trim().length < 3 || bootstrapName.trim().length < 3} onClick={() => void run(async () => {
                    const secret = bootstrapSecret;
                    setBootstrapSecret("");
                    await activateFirstMission({ code: bootstrapCode, name: bootstrapName, secret });
                  }, "First mission activated. Your operator membership is now available.")}>Activate first mission once</Button>
                  <p>Never share the secret in chat, logs, screenshots or source control. An already-provisioned operator permanently blocks further bootstrap attempts.</p>
                </CardContent>
              </Card>
            )}

            <section className="mt-8 grid gap-4 md:grid-cols-3">
              <Card><CardHeader><CardTitle className="text-sm">Identity</CardTitle></CardHeader><CardContent><p className="font-mono text-sm">AUTHENTICATED</p><p className="mt-2 break-all text-xs text-muted-foreground">{snapshot.email ?? snapshot.userId}</p></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm">Active memberships</CardTitle></CardHeader><CardContent><p className="font-mono text-2xl">{snapshot.memberships.length}</p><p className="mt-2 text-xs text-muted-foreground">Only active, RLS-visible mission assignments are shown.</p></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-sm">Live sensor context</CardTitle></CardHeader><CardContent><p className="font-mono text-sm">{snapshot.active?.role === "crew_self" && snapshot.active.crewMemberId ? "MISSION-BOUND" : "LOCAL FALLBACK"}</p><p className="mt-2 text-xs text-muted-foreground">Crew-self + crew member identity is required before new live health data is mission-bound.</p></CardContent></Card>
            </section>

            <section className="mt-8 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Orbit className="text-primary" /> Mission memberships</CardTitle></CardHeader>
                <CardContent>
                  {snapshot.memberships.length ? <div className="space-y-3">{snapshot.memberships.map((membership) => {
                    const key = membershipKey(membership);
                    const active = key === activeKey;
                    return <button key={key} type="button" onClick={() => { setActiveMissionMembership(membership); void refresh(); }} className={`w-full rounded-md border p-4 text-left transition-colors ${active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{membership.missionCode ?? membership.missionId}</strong>{membership.missionName ? <p className="mt-1 text-xs text-muted-foreground">{membership.missionName}</p> : null}</div><div className="flex gap-2"><Badge variant="outline">{roleLabel(membership.role)}</Badge>{active ? <Badge>ACTIVE</Badge> : null}</div></div>
                      <p className="mt-3 font-mono text-xs text-muted-foreground">mission {membership.missionId}{membership.crewMemberId ? ` · crew ${membership.crewMemberId}` : ""}</p>
                    </button>;
                  })}</div> : <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No active mission membership is assigned to this identity yet.</div>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="text-primary" /> Join a mission</CardTitle></CardHeader>
                <CardContent>
                  <Label htmlFor="invite-code">One-time invite code</Label>
                  <Input id="invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} className="mt-2 font-mono" placeholder="Paste mission invite" />
                  <Button className="mt-3" disabled={busy || !inviteCode.trim()} onClick={() => void run(async () => { await acceptMissionInvite(inviteCode); setInviteCode(""); }, "Mission invite accepted.")}><KeyRound /> Accept invite</Button>
                  <div className="mt-6 border-t border-border pt-4"><Button variant="outline" disabled={busy} onClick={() => void run(signOutMissionIdentity)}><LogOut /> Sign out</Button></div>
                </CardContent>
              </Card>
            </section>


            {operatorMemberships.length ? (
              <section className="mt-8">
                <Card>
                  <CardHeader><CardTitle>Operator invite issuance</CardTitle><p className="text-sm text-muted-foreground">Available only to mission operators for missions they already govern.</p></CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                      <div><Label>Mission</Label><Select value={inviteMissionId} onValueChange={setInviteMissionId}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{operatorMemberships.map((item) => <SelectItem key={`${item.missionId}:${item.role}`} value={item.missionId}>{item.missionCode ?? item.missionId}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label>Role</Label><Select value={inviteRole} onValueChange={(value) => setInviteRole(value as MissionRole)}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="crew_self">Crew self</SelectItem><SelectItem value="ground_medical">Ground medical</SelectItem><SelectItem value="mission_operator">Mission operator</SelectItem><SelectItem value="researcher">Researcher</SelectItem></SelectContent></Select></div>
                      {inviteRole === "crew_self" ? (
                        <div>
                          <Label>Crew member</Label>
                          <Select value={inviteCrewMemberId} onValueChange={setInviteCrewMemberId} disabled={inviteCrewLoading || Boolean(inviteCrewError)}>
                            <SelectTrigger className="mt-2" aria-label="Crew member"><SelectValue placeholder={inviteCrewLoading ? "Loading crew…" : inviteCrewError ? "Crew unavailable" : "Select crew member"} /></SelectTrigger>
                            <SelectContent>
                              {inviteCrewOptions.map((member) => (
                                <SelectItem key={member.crew_member_id} value={member.crew_member_id}>
                                  {member.display_name}{member.external_ref ? ` (${member.external_ref})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {inviteCrewError ? <p role="alert" className="mt-1 text-xs text-rose-300">{inviteCrewError}</p> : null}
                          {!inviteCrewLoading && !inviteCrewError && inviteCrewOptions.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">No active crew members in this mission yet. Register crew in Mission &amp; Crew Operations first.</p> : null}
                        </div>
                      ) : null}
                      <div className="flex items-end"><Button className="w-full" disabled={busy || !inviteMissionId || (inviteRole === "crew_self" && (!inviteCrewMemberId || !inviteCrewOptions.some((member) => member.crew_member_id === inviteCrewMemberId)))} onClick={() => void createInvite()}>Create one-time invite</Button></div>
                    </div>
                    {createdInvite ? <div className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-4"><p className="text-xs uppercase tracking-wider text-emerald-300">One-time code — copy now</p><p className="mt-2 break-all font-mono text-sm">{createdInvite}</p></div> : null}
                  </CardContent>
                </Card>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
