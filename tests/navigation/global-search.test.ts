import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { searchCatalogue } from "@/components/app-shell";
import { searchEntries, SEARCH_KEYWORDS } from "@/domain/navigation-search/search";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const first = (q: string) => searchEntries(searchCatalogue, q)[0];
const titles = (q: string) => searchEntries(searchCatalogue, q).map((e) => e.title);

describe("global navigation search", () => {
  test("team navigates to the guide Team section", () => {
    expect(first("team")).toMatchObject({ title: "Team", href: "/project/guide#team" });
    expect(read("src/components/project-guide.tsx")).toContain('id: "team"');
  });

  test("synonyms resolve to expected destinations", () => {
    expect(first("biomarker")?.title).toBe("Biomarkers & Signals");
    expect(first("bone")?.href).toBe("/mission/bone-health");
    expect(titles("health")).toContain("Health Intelligence");
    expect(titles("health")).toContain("Bone Health");
    expect(titles("offline")).toContain("Offline Mission Mode");
    expect(first("security")?.title).toBe("Security & Privacy");
  });

  test("settings and audit use verified Mission Operations anchors", () => {
    expect(first("settings")?.href).toBe("/mission/operations#mission-settings");
    expect(first("audit")?.href).toBe("/mission/operations#mission-audit-log");
    expect(read("src/components/mission-settings-panel.tsx")).toContain('id="mission-settings"');
    expect(read("src/components/mission-audit-log.tsx")).toContain('id="mission-audit-log"');
  });

  test("covers Project Guide, Technology topics and mission routes", () => {
    expect(first("wearables")?.href).toBe("/technology/wearables");
    expect(first("personal baselines")?.href).toBe("/project/guide#personal-baselines");
    for (const e of searchCatalogue) {
      if (!e.href.startsWith("/mission/")) continue;
      const path = e.href.split("#")[0].slice(9);
      expect(existsSync(join(root, `src/routes/mission.${path}.tsx`)), e.href).toBe(true);
    }
  });

  test("case-insensitive, partial and typo tolerant; empty results", () => {
    expect(first("TEAM")?.title).toBe("Team");
    expect(first("wearab")?.title).toBe("Wearables");
    expect(titles("cardiovascluar")).toContain("Cardiovascular Health");
    expect(searchEntries(searchCatalogue, "zzzqqq")).toEqual([]);
    expect(searchEntries(searchCatalogue, "   ")).toEqual([]);
  });

  test("keyword map only references real catalogue labels and no private data", () => {
    const labels = new Set(searchCatalogue.map((e) => e.title));
    for (const key of Object.keys(SEARCH_KEYWORDS)) expect(labels.has(key), key).toBe(true);
    const text = JSON.stringify(searchCatalogue);
    for (const banned of ["MISSION_TEST", "FV01-TEST", "@computech"])
      expect(text).not.toContain(banned);
    expect(text).not.toMatch(/mission-[0-9a-f]{16,}/);
  });

  test("dialog: shortcuts, ARIA, single header, mobile-safe sizing", () => {
    const ui = read("src/components/navigation-search.tsx");
    const shell = read("src/components/app-shell.tsx");
    expect(ui).toContain('event.key.toLowerCase() === "k"');
    expect(ui).toContain("event.metaKey || event.ctrlKey");
    expect(ui).toContain('aria-label="Search site (Ctrl+K)"');
    expect(ui).toContain("DialogTitle");
    expect(ui).toContain("w-[calc(100vw-1.5rem)]");
    expect(ui).toContain("overflow-x-hidden");
    expect((shell.match(/<NavigationSearch /g) ?? []).length).toBe(1);
    expect(shell).toContain("data-mega-menu");
  });
});
