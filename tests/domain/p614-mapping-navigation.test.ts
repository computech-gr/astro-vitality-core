import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MAPPING_GOVERNANCE_ANCHOR, MappingApprovalDistinction } from "@/components/p614-mapping-governance-panel";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("P61.4 navigation from the import exception queue to Scientific Review", () => {
  it("Scientific Review mounts the governance panel with a jump link", () => {
    const route = src("src/routes/mission.scientific-review.tsx");
    expect(route).toContain("<P614MappingGovernancePanel />");
    expect(route).toContain("href={`#${MAPPING_GOVERNANCE_ANCHOR}`}");
    expect(MAPPING_GOVERNANCE_ANCHOR).toBe("p614-mapping-governance");
  });
  it("the bulk import panel shows the held-mapping queue, which links to the panel anchor", () => {
    expect(src("src/components/p61-bulk-import-panel.tsx")).toContain("<P614HeldMappingQueue");
    const queue = src("src/components/p614-held-mapping-queue.tsx");
    expect(queue).toContain('to="/mission/scientific-review" hash={MAPPING_GOVERNANCE_ANCHOR}');
  });
  it("the panel records decisions only through the existing triage and synthetic demo decision functions", () => {
    const panel = src("src/components/p614-mapping-governance-panel.tsx");
    const imports = [...panel.matchAll(/from "(@\/lib\/[^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual(["@/lib/p36-global-review.functions", "@/lib/p36-global-review.server", "@/lib/p37-synthetic-demo.functions"]);
    expect(panel).not.toMatch(/activateSyntheticDemoFn|bulkDemo|saveUnifiedObservation/);
  });
  it("states that mapping approval, activation and observation attestation are separate", () => {
    const html = renderToStaticMarkup(createElement(MappingApprovalDistinction));
    expect(html).toContain("mapping approval");
    expect(html).toContain("Ground Medical activation");
    expect(html).toContain("Ground Medical attestation");
  });
});
