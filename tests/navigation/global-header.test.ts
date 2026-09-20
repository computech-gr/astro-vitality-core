import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const appShell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
const guide = readFileSync(join(root, "src/components/project-guide.tsx"), "utf8");

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
    for (const href of ["/#home", "/#mission", "/#science", "/#platform", "/#technology", "/#open-source", "/#about"]) {
      expect(appShell).toContain(`href: "${href}"`);
    }
    expect(appShell).toContain('href="/#home" aria-label="The Mitochondria home"');
  });
});
