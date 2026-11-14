import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, FlaskConical, Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { P72_ROLE_ROUTES, P72_TARGET_MISSION, p72TargetLabel, p72TargetMembership } from "@/domain/mission-access/p72-role-access";
import { DEMO_ROLE_LABELS, type DemoRole } from "@/domain/public-demo/workflow";

/**
 * P72 presentation bar on the three role consoles: shows the target mission, the
 * signed-in identity and whether it holds this role's membership, plus direct routes to
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
  return (
    <section aria-label="Mission presentation context" className="mt-6 w-full">
      <div className="rounded-xl border border-primary/30 bg-card p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-semibold">{route.consoleLabel} · {p72TargetLabel(role)}</p>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Synthetic evidence only · no diagnosis or clinical clearance</span>
        </div>
        <p className="mt-2 text-muted-foreground">
          Role: {DEMO_ROLE_LABELS[role].title} · Signed in as <span className="font-mono text-foreground">{identity.email ?? "unknown account"}</span>
          {role === "researcher" ? null : <> · Subject: {P72_TARGET_MISSION.crewDisplayName} ({P72_TARGET_MISSION.crewExternalRef})</>}
        </p>
        <p className="mt-1" role="status">
          {membership
            ? `Active ${route.membershipRole.replaceAll("_", " ")} membership in this mission.`
            : `This account has no ${route.membershipRole.replaceAll("_", " ")} membership in this mission yet; the mission operator must invite it before mission records appear here.`}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link to="/mission/intake"><FlaskConical /> Examinations</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/mission/intelligence"><Layers /> Health Domains</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/mission/health-report"><FileText /> Full Health Report</Link></Button>
        </div>
      </div>
    </section>
  );
}
