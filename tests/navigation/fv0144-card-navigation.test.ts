import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const guide = readFileSync(join(root, "src/components/project-guide.tsx"), "utf8");
const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");

const itemLines = guide.split("\n").filter((line) => /^\s*\{ id: "[a-z0-9-]+", title: /.test(line));

describe("FV-01.4.4 card navigation coverage", () => {
  test("project guide has the expected 49 cards", () => {
    expect(itemLines.length).toBe(49);
  });

  test("every card has a destination or an explicit no-action reason", () => {
    for (const line of itemLines) {
      expect(/href: |links: \[|noAction: /.test(line)).toBe(true);
    }
  });

  test("Team has no invented team link", () => {
    const team = itemLines.find((l) => l.includes('id: "team"'))!;
    expect(team).toContain("noAction:");
    expect(guide).not.toContain("Meet the Team");
  });

  test("internal destinations resolve to route files or anchors", () => {
    const hrefs = [...guide.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    for (const href of hrefs) {
      if (href.startsWith("#")) {
        expect(guide).toContain(`id="${href.slice(1)}"`);
      } else if (href.startsWith("/technology/")) {
        expect(readFileSync(join(root, "src/content/technology-topics.ts"), "utf8")).toContain(`"${href.slice(12)}"`);
      } else if (href.startsWith("/#")) {
        expect(shell).toContain(`id="${href.slice(2)}"`);
      } else if (href.startsWith("/mission/")) {
        expect(existsSync(join(root, `src/routes/mission.${href.slice(9)}.tsx`))).toBe(true);
      }
    }
  });

  test("referenced repository documents exist", () => {
    for (const m of guide.matchAll(/"([A-Z0-9_]+\.md)"/g)) {
      expect(existsSync(join(root, "docs", m[1]))).toBe(true);
    }
  });

  test("no card repeats the same destination twice", () => {
    for (const line of itemLines) {
      const hrefs = [...line.matchAll(/href: (?:"([^"]+)"|([A-Z_]+[^,]*))/g)].map((m) => m[1] ?? m[2]);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  test("external links use safe attributes", () => {
    expect(guide).toContain('rel={link.external ? "noopener noreferrer" : undefined}');
    expect(guide).toContain('rel={item.external ? "noopener noreferrer" : undefined}');
    expect(guide).toContain('rel="noopener noreferrer"');
  });
});
