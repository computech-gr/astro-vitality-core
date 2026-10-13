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
if (!ui.includes("loadCrewScientificEvidence") || !ui.includes('role === "crew_self"') || !ui.includes("No autonomous diagnosis")) throw new Error("Crew-scoped non-diagnostic UI contract missing");
if (!read("src/components/bone-health-entry.tsx").includes("/mission/immune-health")) throw new Error("Bone workspace domain links missing");
console.log("P26 health domain navigation and safety verifier: PASS");
