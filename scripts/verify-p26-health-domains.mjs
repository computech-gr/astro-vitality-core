import { readFileSync, existsSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const shell = read("src/components/app-shell.tsx");
for (const name of ["immune", "cardiovascular", "behavioral"]) {
  if (!existsSync(new URL(`../src/routes/mission.${name}-health.tsx`, import.meta.url))) throw new Error(`Missing ${name} route`);
  if (!shell.includes(`/mission/${name}-health`)) throw new Error(`Missing ${name} navigation`);
}
const registry = read("src/domain/health-domains/registry.ts");
if (!registry.includes('metricCodes: []') || !registry.includes('scientific_review_pending')) throw new Error("Pending scientific evidence guardrails missing");
const ui = read("src/components/health-domain-workspace.tsx");
const panel = read("src/components/domain-evidence-panel.tsx");
if (!ui.includes("<DomainEvidencePanel") || !panel.includes("loadCrewScientificEvidence(") || !panel.includes('role === "crew_self"') || !ui.includes("No autonomous diagnosis")) throw new Error("Crew-scoped non-diagnostic UI contract missing");
// Bone workspace links to the other domains through the shared registry-driven navigation.
const nav = read("src/components/health-domain-navigation.tsx");
if (!read("src/components/bone-health-entry.tsx").includes('<HealthDomainNavigation current="bone"') || !nav.includes("HEALTH_DOMAINS.map") || !nav.includes("href={item.path}") || !registry.includes('path: "/mission/immune-health"')) throw new Error("Bone workspace domain links missing");
console.log("P26 health domain navigation and safety verifier: PASS");
