import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const appShell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
const guide = readFileSync(join(root, "src/components/project-guide.tsx"), "utf8");

const operationalPageComponents = [
  "action-guidance.tsx",
  "device-integration-center.tsx",
  "explainable-alerts.tsx",
  "health-intelligence.tsx",
  "live-dashboard.tsx",
  "readiness-assessment.tsx",
  "synthetic-mission.tsx",
].map((name) => ({
  name,
  source: readFileSync(join(root, "src/components", name), "utf8"),
}));

describe("global site header", () => {
  test("the primary header is mounted once at the root for every route", () => {
    expect(appShell).toContain("export function SiteHeader()");
    expect(rootRoute).toContain('import { SiteHeader } from "@/components/app-shell"');
    expect(rootRoute).toContain("<SiteHeader />");
    expect(appShell).not.toContain("<Header />");
  });

  test("route content is offset below the fixed global header", () => {
    expect(rootRoute).toContain('className="pt-[var(--header-offset,76px)]"');
    expect(guide).not.toContain("pt-[var(--header-offset)]");
  });

  test("header section links work from nested routes", () => {
    const flat = appShell.replace(/\s+/g, " ");
    for (const href of ["/#home", "/mission/experience", "/mission/intelligence", "/#science", "/#technology", "/#open-source", "/#about"]) {
      expect(flat).toContain(`href: "${href}"`);
    }
    expect(flat).toContain('href="/#home" aria-label="The Mitochondria home"');
  });

  test("operational pages rely on the single root header instead of rendering framed duplicate mastheads", () => {
    for (const page of operationalPageComponents) {
      expect(page.source, `${page.name} must not render its own page header`).not.toContain("<header");
      expect(page.source, `${page.name} must not render a second brand logo`).not.toContain(
        "mitochondria-logo.png.asset.json",
      );
    }
  });
});
