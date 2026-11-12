import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import {
  CollapsibleReviewCard,
  COMPACT_MAX_HEIGHT,
  CompactScrollRegion,
} from "@/components/compact-review";
import {
  demoParameterRows,
  filterDemoParameters,
  MissionDemoParametersPanel,
} from "@/components/mission-demo-parameters-panel";
import { StoredObservationsReview } from "@/components/stored-observations-review";
import { GM_USER, V9_SCOPE, obs } from "../domain/fixtures-v9-observations";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");

const entry = (demoId: string, displayName: string, unit: string, domain: string, aliases: string[]) =>
  ({ demoId, displayName, unit, domain, aliases, activation: { activationEventId: `ev-${demoId}` } }) as never;
const catalog = {
  demoCatalogVersion: 4,
  active: [
    entry("demo-0001", "Serum phosphate", "mg/dL", "bone", ["Phosphate"]),
    entry("demo-0002", "Resting heart rate", "bpm", "cardiovascular", ["HR"]),
  ],
  revoked: [entry("demo-0003", "Old marker", "U/L", "immune", ["Old"])],
};

describe("compact scroll region", () => {
  test("caps height, scrolls internally and is keyboard focusable", () => {
    const html = renderToStaticMarkup(
      createElement(CompactScrollRegion, { label: "List", maxHeight: "reviewList" }, "x"),
    );
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("max-h-[450px]");
  });
  test("uses the required maximum heights", () => {
    expect(COMPACT_MAX_HEIGHT.demoParameters).toBe("max-h-[300px]");
    expect(COMPACT_MAX_HEIGHT.reviewList).toBe("max-h-[450px]");
    expect(COMPACT_MAX_HEIGHT.approvalTable).toBe("max-h-[450px]");
  });
});

describe("mission synthetic demo parameters", () => {
  const rows = demoParameterRows(catalog);
  test("search filters by name, identifier, category and unit", () => {
    expect(filterDemoParameters(rows, "PHOSPHATE").map((r) => r.demoId)).toEqual(["demo-0001"]);
    expect(filterDemoParameters(rows, "demo-0002").map((r) => r.demoId)).toEqual(["demo-0002"]);
    expect(filterDemoParameters(rows, "cardio").map((r) => r.demoId)).toEqual(["demo-0002"]);
    expect(filterDemoParameters(rows, "u/l").map((r) => r.demoId)).toEqual(["demo-0003"]);
    expect(filterDemoParameters(rows, "  ")).toHaveLength(3);
    expect(filterDemoParameters(rows, "no-such-metric")).toEqual([]);
  });
  test("renders every parameter with total count inside a 300px scroll region", () => {
    const html = renderToStaticMarkup(createElement(MissionDemoParametersPanel, { catalog: catalog as never }));
    expect(html).toContain("3 parameters (2 active, 1 revoked)");
    expect(html).toContain('data-testid="mission-demo-parameters-scroll"');
    expect(html).toContain("max-h-[300px]");
    expect(html).toContain('type="search"');
    expect(html).toContain("exact unit mg/dL");
    expect(html).toContain("REVOKED — no longer recognized");
    expect(html).toContain("verified demo catalog v4");
  });
  test("mission and crew selectors stay outside the scroll area", () => {
    const ws = src("src/components/unified-intake-workspace.tsx");
    expect(ws).toContain("<MissionDemoParametersPanel catalog={missionDemoCatalog} />");
    expect(ws.indexOf('id="intake-membership"')).toBeLessThan(ws.indexOf("<MissionDemoParametersPanel"));
  });
});

describe("collapsible scientific review cards", () => {
  const card = (defaultOpen: boolean) =>
    renderToStaticMarkup(
      createElement(
        "ul",
        null,
        createElement(
          CollapsibleReviewCard,
          { id: "p614-x", label: "CTX (ng/mL)", title: "CTX", meta: "Held", defaultOpen },
          createElement("textarea", { "aria-label": "Rationale", defaultValue: "draft" }),
        ),
      ),
    );
  test("collapsed card shows name and expand control but keeps the form mounted", () => {
    const html = card(false);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="p614-x-details"');
    expect(html).toContain("Expand CTX (ng/mL)");
    expect(html).toMatch(/id="p614-x-details"[^>]*hidden=""/);
    // Body stays in the DOM while collapsed, so unsaved reviewer input survives collapse/reopen.
    expect(html).toContain('aria-label="Rationale"');
  });
  test("expanded card shows its full body", () => {
    const html = card(true);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toMatch(/id="p614-x-details"[^>]*hidden/);
  });
  test("the mapping governance panel uses collapsible cards inside a 450px list", () => {
    const panel = src("src/components/p614-mapping-governance-panel.tsx");
    expect(panel).toContain("<CollapsibleReviewCard");
    expect(panel).toContain('maxHeight="reviewList"');
    expect(panel).toContain("<DecisionForm {...props} />");
  });
});

describe("Ground Medical approvals table", () => {
  const history = [obs(), obs(), obs({ status: "erroneous", statusReason: "Typo in source" })];
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ["/mission/intake"] }),
  });
  const html = renderToStaticMarkup(
    createElement(RouterContextProvider, { router } as never, createElement(StoredObservationsReview, {
      history,
      membership: { missionId: V9_SCOPE.missionId, crewMemberId: V9_SCOPE.crewMemberId },
      provenance: V9_SCOPE.provenance,
      userId: GM_USER,
      rolesForScope: ["ground_medical"],
      reload: async () => {},
    })),
  );
  test("bulk counter and Save selected approvals sit above the scrolling table", () => {
    const bar = html.indexOf('data-testid="stored-observations-bulk-bar"');
    const scroll = html.indexOf('data-testid="stored-observations-scroll"');
    expect(bar).toBeGreaterThan(-1);
    expect(bar).toBeLessThan(scroll);
    expect(html.indexOf("Save selected approvals")).toBeLessThan(scroll);
    expect(html).toContain("0 selected of 2 eligible");
  });
  test("table scrolls internally with a sticky header", () => {
    expect(html).toMatch(/data-testid="stored-observations-scroll"[^>]*>|max-h-\[450px\]/);
    expect(html).toContain("max-h-[450px]");
    expect(html).toContain("sticky top-0");
  });
  test("rows keep checkboxes and Attest / Edit / Mark erroneous in table and card layouts", () => {
    expect(html).toContain('data-testid="stored-observations-table"');
    expect(html).toContain('data-testid="stored-observations-cards"');
    expect(html).toContain("lg:table");
    expect(html).toContain("lg:hidden");
    const count = (t: string) => html.split(t).length - 1;
    // Two eligible rows, each rendered in the table and in the card list.
    expect(count(">Attest<")).toBe(4);
    expect(count(">Edit<")).toBe(4);
    expect(count(">Mark erroneous<")).toBe(4);
    expect(count('role="checkbox"')).toBeGreaterThanOrEqual(8);
  });
  test("selection lives in component state, not in the scrolled rows", () => {
    const c = src("src/components/stored-observations-review.tsx");
    expect(c).toContain("const [selected, setSelected] = useState<Set<string>>(new Set());");
    expect(c).not.toMatch(/virtual|IntersectionObserver/i);
  });
});
