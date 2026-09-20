import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INDEXABLE_ROUTES,
  NON_INDEXABLE_ROUTES,
  SOCIAL_PREVIEW_PATH,
  indexableRouteHead,
  isIndexableRoute,
  operationalRouteHead,
} from "@/infrastructure/seo";

const root = process.cwd();
const ORIGIN = "https://mitochondria.edocinfo.com";
const read = (p: string) => readFileSync(join(root, p), "utf8");

const metaValue = (meta: Array<Record<string, string>>, key: "name" | "property", id: string) =>
  meta.find((entry) => entry[key] === id)?.["content"];

describe("v20.2 SEO & indexability policy", () => {
  test("indexable and operational route sets are disjoint and complete", () => {
    for (const route of NON_INDEXABLE_ROUTES) {
      expect(isIndexableRoute(route)).toBe(false);
    }
    for (const route of INDEXABLE_ROUTES) {
      expect(isIndexableRoute(route)).toBe(true);
    }
    expect(INDEXABLE_ROUTES).toContain("/");
    expect(NON_INDEXABLE_ROUTES).toContain("/mission/ground");
  });

  test("indexable routes self-canonicalize with full OG and Twitter metadata", () => {
    for (const path of INDEXABLE_ROUTES) {
      const head = indexableRouteHead({ path, title: `T ${path}`, description: `D ${path}` });
      const expectedUrl = new URL(path, ORIGIN).toString();
      expect(head.links[0]).toEqual({ rel: "canonical", href: expectedUrl });
      expect(metaValue(head.meta, "property", "og:url")).toBe(expectedUrl);
      expect(metaValue(head.meta, "name", "robots")).toBe("index, follow");
      expect(metaValue(head.meta, "property", "og:title")).toBe(`T ${path}`);
      expect(metaValue(head.meta, "property", "og:description")).toBe(`D ${path}`);
      expect(metaValue(head.meta, "name", "twitter:card")).toBe("summary_large_image");
      expect(metaValue(head.meta, "name", "twitter:title")).toBe(`T ${path}`);
      expect(metaValue(head.meta, "name", "twitter:description")).toBe(`D ${path}`);
      const image = `${ORIGIN}${SOCIAL_PREVIEW_PATH}`;
      expect(metaValue(head.meta, "property", "og:image")).toBe(image);
      expect(metaValue(head.meta, "name", "twitter:image")).toBe(image);
    }
  });

  test("operational routes are noindex but still share-safe and self-canonical", () => {
    for (const path of NON_INDEXABLE_ROUTES) {
      const head = operationalRouteHead({ path, title: "T", description: "D" });
      const expectedUrl = new URL(path, ORIGIN).toString();
      expect(metaValue(head.meta, "name", "robots")).toBe("noindex, nofollow");
      expect(head.links[0]).toEqual({ rel: "canonical", href: expectedUrl });
      expect(metaValue(head.meta, "property", "og:url")).toBe(expectedUrl);
      expect(metaValue(head.meta, "name", "twitter:card")).toBe("summary_large_image");
    }
  });

  test("no SEO metadata may use a Lovable preview origin", () => {
    for (const path of [...INDEXABLE_ROUTES, ...NON_INDEXABLE_ROUTES]) {
      const head = isIndexableRoute(path)
        ? indexableRouteHead({ path: path as (typeof INDEXABLE_ROUTES)[number], title: "T", description: "D" })
        : operationalRouteHead({ path: path as (typeof NON_INDEXABLE_ROUTES)[number], title: "T", description: "D" });
      expect(JSON.stringify(head)).not.toContain("lovable.app");
    }
  });

  test("sitemap.xml is valid and lists exactly the indexable routes", () => {
    const sitemap = read("public/sitemap.xml");
    expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = INDEXABLE_ROUTES.map((p) => new URL(p, ORIGIN).toString());
    expect(locs.sort()).toEqual(expected.sort());
    for (const route of NON_INDEXABLE_ROUTES) {
      expect(sitemap).not.toContain(route);
    }
  });

  test("robots.txt declares the sitemap and does not block the site", () => {
    const robots = read("public/robots.txt");
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(robots).not.toMatch(/^\s*Disallow:\s*\/\s*$/m);
  });

  test("every page component renders exactly one h1", () => {
    const components = [
      "app-shell",
      "project-guide",
      "validation-usability",
      "challenge-submission",
      "live-dashboard",
      "readiness-assessment",
      "health-intelligence",
      "explainable-alerts",
      "action-guidance",
      "offline-mission",
      "ground-research-console",
      "synthetic-mission",
    ];
    for (const name of components) {
      const src = read(`src/components/${name}.tsx`);
      expect((src.match(/<h1[\s>]/g) ?? []).length).toBe(1);
      expect((src.match(/<h2[\s>]/g) ?? []).length).toBeGreaterThan(0);
    }
  });
});
