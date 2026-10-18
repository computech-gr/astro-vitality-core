import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Operator-visible navigation only. Every destination enforces its own RBAC/RLS. */
export const SYNTHETIC_DEMO_JOURNEY = [
  { label: "Mission identity", href: "/mission/identity", purpose: "Confirm the signed-in identity and active mission membership." },
  { label: "Mission workspace", href: "/mission/experience", purpose: "Select the synthetic mission and crew context." },
  { label: "Mission documents", href: "/mission/documents", purpose: "Review synthetic lab evidence with Crew Self authorization." },
  { label: "Device integration", href: "/mission/devices", purpose: "Inspect simulated-device capabilities and collection boundaries." },
  { label: "Bone health", href: "/mission/bone-health", purpose: "Inspect synthetic-only local bone evidence." },
  { label: "Cardiovascular health", href: "/mission/cardiovascular-health", purpose: "Inspect cardiovascular research evidence." },
  { label: "Immune changes", href: "/mission/immune-health", purpose: "Inspect scientific draft proposals and missing evidence." },
  { label: "Behavioral health", href: "/mission/behavioral-health", purpose: "Inspect behavioral and sleep research evidence." },
  { label: "Health intelligence", href: "/mission/intelligence", purpose: "Review non-diagnostic research intelligence." },
  { label: "Ground & research", href: "/mission/ground", purpose: "Independent Ground Medical membership is required for decisions." },
] as const;

export function MissionDemoLaunchpad({ missionCode }: { missionCode: string }) {
  return (
    <section className="mt-8" aria-label="Synthetic mission demo launchpad">
      <Card>
        <CardHeader><CardTitle>Synthetic mission demo journey</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Operator mission: {missionCode}. These are navigation links, not elevated privileges. Each page independently checks identity, crew assignment and database authorization. No impersonation, clinical activation or real-data processing is enabled.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SYNTHETIC_DEMO_JOURNEY.map((step, index) => (
              <a key={step.href} href={step.href} className="rounded-md border border-border p-3 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                <span className="text-sm font-semibold">{index + 1}. {step.label}</span>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.purpose}</p>
              </a>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Full administrator demo execution across role-separated workflows requires a separately reviewed backend authorization design and isolated synthetic demo mission. Operator membership alone does not confer Crew Self or Ground Medical rights.</p>
        </CardContent>
      </Card>
    </section>
  );
}
