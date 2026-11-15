import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, FlaskConical, Globe, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { P72_ROLE_ROUTES, P72_TARGET_MISSION, p72TargetLabel, p72TargetMembership } from "@/domain/mission-access/p72-role-access";
import { DEMO_ROLE_LABELS, type DemoRole } from "@/domain/public-demo/workflow";

/**
 * P72 presentation bar on the three role consoles: shows the target mission, the
 * role and whether it holds this role's membership, plus direct routes to
 * Examinations, Health Domains and the Full Health Report. Display only — each page
 * still enforces its own permissions.
 */
export function P72MissionContextBar({ role }: { role: DemoRole }) {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => void loadMissionIdentity().then((r) => { if (alive) setIdentity(r); }).catch(() => { if (alive) setIdentity(null); });
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => { alive = false; unsubscribe(); };
  }, []);
  if (!identity?.signedIn) return null;
  const route = P72_ROLE_ROUTES[role];
  const membership = p72TargetMembership(role, identity.memberships);
  // P72.6: a server-verified global Researcher READ scope replaces the membership warning.
  const globalResearch = role === "researcher" && !identity.error ? identity.globalResearch : undefined;
  return (
    <section aria-label="Mission presentation context" className="mt-6 w-full">
      <div className="rounded-xl border border-primary/30 bg-card p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{route.consoleLabel} · {p72TargetLabel(role)}</p>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Synthetic evidence only · no diagnosis or clinical clearance</span>
        </div>
        <p className="mt-2 text-muted-foreground">
          Role: {DEMO_ROLE_LABELS[role].title}
          {role === "researcher" ? null : <> · Signed in as <span className="font-mono text-foreground">{identity.email ?? "unknown account"}</span></>}
          {role === "researcher" ? null : <> · Subject: {P72_TARGET_MISSION.crewDisplayName} ({P72_TARGET_MISSION.crewExternalRef})</>}
        </p>
        <p className="mt-1" role="status">
          {globalResearch
            ? `Global Researcher read access (server-verified) · ${globalResearch.missions.length} missions · synthetic records only · no Medical, approval-activation or administrative permissions.`
            : membership
              ? `Active ${route.membershipRole.replaceAll("_", " ")} membership in this mission.`
              : `This account has no ${route.membershipRole.replaceAll("_", " ")} membership in this mission yet; the mission operator must invite it before mission records appear here.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {globalResearch ? (
            <Button asChild size="sm"><Link to="/mission/research-access"><Globe /> All missions · Examinations &amp; Health Domains</Link></Button>
          ) : (
            <Button asChild size="sm" variant="outline"><Link to="/mission/intake"><FlaskConical /> Examinations</Link></Button>
          )}
          {/* P72.4: Ground Medical opens the domain pages (selected mission + crew); the Crew-Self-only overview stays for Researcher. */}
          <Button asChild size="sm" variant="outline">
            {role === "researcher" ? <Link to={globalResearch ? "/mission/research-access" : "/mission/intelligence"}><Layers /> Health Domains</Link> : <Link to="/mission/bone-health"><Layers /> Health Domains</Link>}
          </Button>
          <Button asChild size="sm" variant="outline"><Link to="/mission/health-report"><FileText /> Full Health Report</Link></Button>
        </div>
      </div>
    </section>
  );
}
