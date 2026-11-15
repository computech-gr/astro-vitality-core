import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical, HeartPulse, Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { startPublicDemoRoleFn } from "@/lib/p69-public-demo.functions";
import { DEMO_ROLES, DEMO_ROLE_LABELS, type DemoRole } from "@/domain/public-demo/workflow";
import { readStoredDemoWorkspace, writeStoredDemoWorkspace } from "@/domain/public-demo/session-storage";
import { P72_ROLE_ROUTES, decideP72HomepageCardEntry } from "@/domain/mission-access/p72-role-access";
import { checkP72RoleAccountFn } from "@/lib/p72-role-access.functions";
import { resolveP72RoleEntry } from "@/components/mission-access/p72-role-entry";

const ICONS: Record<DemoRole, typeof Rocket> = { astronaut: Rocket, researcher: FlaskConical, medical: HeartPulse };

export function PublicDemoRoleEntry({
  variant = "panel",
  defaultJoinCode = "",
  onStarted,
}: {
  variant?: "hero" | "panel";
  defaultJoinCode?: string;
  onStarted?: () => void;
}) {
  const navigate = useNavigate();
  const [busyRole, setBusyRole] = useState<DemoRole | null>(null);
  const [message, setMessage] = useState<{ text: string; offline: boolean } | null>(null);
  const [confirmRole, setConfirmRole] = useState<DemoRole | null>(null);
  const [confirmAccount, setConfirmAccount] = useState<string | null>(null);
  const [confirmFromDemo, setConfirmFromDemo] = useState(false);
  const [joinCode, setJoinCode] = useState(defaultJoinCode);
  const checkAccount = useServerFn(checkP72RoleAccountFn);
  const hero = variant === "hero";

  async function start(role: DemoRole, confirmed = false) {
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    const signedInStandard = data.session && data.session.user.app_metadata?.["mitochondria_public_demo"] !== true;
    if (hero && !confirmed) {
      // P72.5: the homepage cards are the mission-account sign-in entry points.
      const entry = decideP72HomepageCardEntry(!data.session ? "none" : signedInStandard ? "standard" : "demo");
      if (entry === "sign_in") {
        await navigate({ to: "/mission/identity", search: { role } });
        return;
      }
      if (entry === "confirm_demo_session") {
        setConfirmAccount(null);
        setConfirmFromDemo(true);
        setConfirmRole(role);
        return;
      }
    }
    setConfirmFromDemo(false);
    if (signedInStandard && !confirmed) {
      // P72: the mapped mission account goes straight to its normal console.
      setBusyRole(role);
      try {
        const decision = await resolveP72RoleEntry(role, checkAccount);
        if (decision.kind === "console") {
          await navigate({ to: decision.path });
          return;
        }
        setConfirmAccount(decision.kind === "wrong_account" ? decision.signedInAs : null);
      } catch {
        setConfirmAccount(null);
      } finally {
        setBusyRole(null);
      }
      setConfirmRole(role);
      return;
    }
    setConfirmRole(null);
    setBusyRole(role);
    try {
      const code = joinCode.trim();
      const result = await startPublicDemoRoleFn({ data: { role, joinCode: code || null } });
      if (!result.ok) {
        setMessage({
          text: result.message,
          offline: ["disabled", "migration_required", "unavailable", "rate_limited"].includes(result.code),
        });
        return;
      }
      if (signedInStandard) await supabase.auth.signOut({ scope: "local" });
      const { error } = await supabase.auth.setSession({
        access_token: result.session.accessToken,
        refresh_token: result.session.refreshToken,
      });
      if (error) {
        setMessage({ text: "The demo session could not be opened in this browser.", offline: true });
        return;
      }
      const previous = readStoredDemoWorkspace();
      writeStoredDemoWorkspace({
        joinCode: result.workspace.joinCode ?? (code ? code.toUpperCase() : (previous?.joinCode ?? null)),
        role,
        expiresAt: result.workspace.expiresAt,
      });
      onStarted?.();
      await navigate({ to: "/mission/demo" });
    } catch {
      setMessage({ text: "The demo service could not be reached.", offline: true });
    } finally {
      setBusyRole(null);
    }
  }

  return (
    <div className={hero ? "mt-8 max-w-2xl" : "rounded-xl border border-border bg-card p-5"}>
      <p className={hero ? "text-xs font-semibold uppercase text-primary" : "text-sm font-semibold"}>
        {hero ? "Mission Access · sign in by role" : "Mission Access · public NASA live demo"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {hero
          ? "Choose a role to sign in to its mission console."
          : "One click, no password. Each visitor gets a private synthetic workspace."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {DEMO_ROLES.map((role) => {
          const Icon = ICONS[role];
          return (
            <Button
              key={role}
              size="lg"
              variant={role === "astronaut" ? "default" : "outline"}
              className={hero ? "h-auto flex-col items-start gap-1 py-3 text-left backdrop-blur" : "h-auto flex-col items-start gap-1 py-3 text-left"}
              disabled={busyRole !== null}
              onClick={() => void start(role)}
              aria-describedby={`demo-role-${role}-${variant}`}
            >
              <span className="flex items-center gap-2 font-semibold">
                {busyRole === role ? <Loader2 className="animate-spin" /> : <Icon />}
                {DEMO_ROLE_LABELS[role].title}
              </span>
              <span id={`demo-role-${role}-${variant}`} className="whitespace-normal text-xs font-normal opacity-80">
                {DEMO_ROLE_LABELS[role].responsibility}
              </span>
            </Button>
          );
        })}
      </div>
      {!hero ? (
        <div className="mt-4 max-w-xs">
          <Label htmlFor="demo-join-code">Join an existing demo workspace (optional)</Label>
          <Input
            id="demo-join-code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="ABCD-1234-EF56"
            autoComplete="off"
            className="mt-2 font-mono uppercase"
          />
        </div>
      ) : null}
      {confirmRole ? (
        <div role="alertdialog" aria-label="Leave your account for the demo" className="mt-4 rounded-md border border-border bg-background/80 p-3 text-sm">
          <p>
            {DEMO_ROLE_LABELS[confirmRole].title} opens the {P72_ROLE_ROUTES[confirmRole].consoleLabel} for the mapped mission account{" "}
            <span className="font-mono">{P72_ROLE_ROUTES[confirmRole].maskedAccount}</span>.{" "}
            {confirmFromDemo
              ? "You are in a synthetic demo session. Signing in to the mapped account ends that session in this browser."
              : <>
                  {confirmAccount ? <>You are signed in as <span className="font-mono">{confirmAccount}</span>. </> : null}
                  Starting the synthetic demo signs your account out in this browser.
                </>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void start(confirmRole, true)}>Continue to synthetic demo</Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const role = confirmRole;
                setConfirmRole(null);
                void supabase.auth.signOut({ scope: "local" }).then(() => navigate({ to: "/mission/identity", search: { role } }));
              }}
            >
              Sign in as the mapped account
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmRole(null)}>{confirmFromDemo ? "Stay in the demo" : "Stay signed in"}</Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="mt-4 rounded-md border border-border bg-background/80 p-3 text-sm">
          {message.text}{" "}
          {message.offline ? (
            <Link to="/mission/demo" search={{ offline: true }} className="font-medium text-primary underline">
              Open the offline rehearsal
            </Link>
          ) : null}
        </p>
      ) : null}
      {hero ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Synthetic data only · not a medical device · no diagnosis or clinical clearance. No mission account?{" "}
          <Link to="/mission/demo" className="font-medium text-foreground underline">
            Try the one-click NASA live demo
          </Link>
          .
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Synthetic data only · not a medical device · no diagnosis or clinical clearance.{" "}
          <Link to="/mission/identity" className="font-medium text-foreground underline">
            Standard sign-in
          </Link>{" "}
          for invited mission accounts.
        </p>
      )}
    </div>
  );
}
