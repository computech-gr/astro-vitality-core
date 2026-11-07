import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bulkResearcherVisibility } from "@/domain/health-intelligence/p38-bulk-demo-selection";
import {
  BULK_RESEARCHER_ANCHOR,
  BULK_RESEARCHER_HEADING,
  BulkResearcherSection,
} from "@/components/p38-bulk-researcher-section";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

const eligible = {
  authorizedMissions: 1,
  missionSelected: true,
  lifecycle: { canDecide: true, demoScopeTerms: 185 },
} as const;

describe("P38 bulk Researcher decisions on /mission/scientific-review", () => {
  it("is visible for a selected synthetic mission with Researcher capability and demo scope", () => {
    expect(bulkResearcherVisibility(eligible)).toBe("visible");
  });

  it("is hidden from accounts without the Researcher (scientific approver) capability", () => {
    expect(
      bulkResearcherVisibility({ ...eligible, lifecycle: { canDecide: false, demoScopeTerms: 185 } }),
    ).toBe("not_researcher");
  });

  it("is hidden for a mission with no owner-authorized synthetic demo scope", () => {
    expect(
      bulkResearcherVisibility({ ...eligible, lifecycle: { canDecide: true, demoScopeTerms: 0 } }),
    ).toBe("no_demo_scope");
  });

  it("asks for a mission first, and for sign-in when no synthetic mission is authorized", () => {
    expect(bulkResearcherVisibility({ ...eligible, missionSelected: false })).toBe("choose_mission");
    expect(bulkResearcherVisibility({ ...eligible, authorizedMissions: 0 })).toBe("sign_in");
    expect(bulkResearcherVisibility({ ...eligible, lifecycle: "unavailable" })).toBe("unavailable");
  });

  it("the route reaches the existing P38 component through the authorized mission selection", () => {
    // Route -> workspace -> catalog panel (owns the authorized synthetic mission list) -> P38.
    const route = src("src/routes/mission.scientific-review.tsx");
    expect(route).toContain("<P36ScientificReviewWorkspace />");
    expect(route).toContain("href={`#${BULK_RESEARCHER_ANCHOR}`}");
    expect(src("src/components/p36-scientific-review-workspace.tsx")).toContain("<P37CatalogPanel />");
    const panel = src("src/components/p37-catalog-panel.tsx");
    expect(panel).toMatch(
      /<P38BulkDemoResearcher\s+key=\{`bulk-\$\{mission\.missionId\}`\}\s+missionId=\{mission\.missionId\}/,
    );
    expect(panel).not.toMatch(/missionId=["']/);
    expect(src("src/components/p38-bulk-demo-researcher.tsx")).toContain(
      "<BulkResearcherSection visibility={visibility}>",
    );
  });

  it("renders the anchored heading with the bulk interface inside it when visible", () => {
    const html = renderToStaticMarkup(
      createElement(
        BulkResearcherSection,
        { visibility: "visible" },
        createElement("div", { "data-testid": "p38-bulk-researcher" }),
      ),
    );
    expect(html).toContain(`id="${BULK_RESEARCHER_ANCHOR}"`);
    expect(html).toContain(BULK_RESEARCHER_HEADING);
    expect(html).toContain('data-testid="p38-bulk-researcher"');
  });
});
