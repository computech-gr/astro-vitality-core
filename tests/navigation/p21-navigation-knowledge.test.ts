import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { TECHNOLOGY_TOPICS, TECHNOLOGY_TOPIC_SLUGS, findTechnologyTopic, technologyTopicPath } from "@/content/technology-topics";
import { INDEXABLE_ROUTES, TECHNOLOGY_TOPIC_ROUTES, indexableRouteHead } from "@/infrastructure/seo";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const shell = read("src/components/app-shell.tsx");
const topicPage = read("src/components/knowledge/topic-page.tsx");
const sitemap = read("public/sitemap.xml");

const MISSION_ROUTES = [
  "experience", "identity", "operations", "live", "devices", "readiness", "intelligence", "nasa-evidence",
  "alerts", "guidance", "offline", "records", "ground", "simulation", "bone-health", "immune-health",
  "cardiovascular-health", "behavioral-health", "validation", "submission",
];

describe("P21 categorized navigation", () => {
  test("top-level groups match the approved information architecture", () => {
    for (const label of ["Mission", "Science", "Platform", "Mission Operations", "Technology", "Open Source & About"]) {
      expect(shell).toContain(`label: "${label}",`);
    }
  });

  test("every existing functional route is still reachable from the header", () => {
    for (const name of MISSION_ROUTES) {
      expect(shell).toContain(`"/mission/${name}"`);
      expect(existsSync(join(root, `src/routes/mission.${name}.tsx`))).toBe(true);
    }
  });

  test("desktop mega menus are grouped and labelled; mobile uses grouped accordions", () => {
    expect(shell).toContain("DropdownMenuGroup");
    expect(shell).toContain("DropdownMenuLabel");
    expect(shell).toContain("data-mega-menu");
    expect(shell).toContain('aria-label="Primary navigation"');
    expect(shell).toContain('aria-label="Mobile navigation"');
    expect(shell).toContain('role="group"');
    expect(shell).toContain('aria-label="Open navigation menu"');
  });

  test("no navigation column exceeds eight items", () => {
    const groups = [...shell.matchAll(/items: \[([^\]]*)\]/g)].map((m) => m[1].split('", "').length);
    expect(groups.length).toBeGreaterThan(10);
    for (const count of groups) expect(count).toBeLessThanOrEqual(8);
  });

  test("technology labels open dedicated pages while guide anchors remain for old bookmarks", () => {
    for (const slug of TECHNOLOGY_TOPIC_SLUGS) expect(shell).toContain(`"/technology/${slug}"`);
    expect(shell).toContain('"System Architecture": guideHref("system-architecture")');
    const guide = read("src/components/project-guide.tsx");
    for (const slug of TECHNOLOGY_TOPIC_SLUGS) expect(guide).toContain(`id: "${slug}"`);
    expect(guide).toContain("/technology/${item.id}");
  });

  test("homepage anchors used by existing links still exist", () => {
    for (const id of ["home", "mission", "science", "platform", "technology", "open-source", "about"]) {
      expect(shell).toContain(`id="${id}"`);
    }
    expect(shell).toContain("TopicCardGrid");
  });
});

describe("P21 technology topic pages", () => {
  test("all eight topics are defined with every required section", () => {
    expect(TECHNOLOGY_TOPICS.map((t) => t.slug)).toEqual([...TECHNOLOGY_TOPIC_SLUGS]);
    for (const topic of TECHNOLOGY_TOPICS) {
      expect(topic.intro.length).toBeGreaterThan(80);
      expect(topic.whyItMatters.length).toBeGreaterThanOrEqual(2);
      expect(topic.approach.length).toBeGreaterThanOrEqual(2);
      expect(topic.diagram.nodes.length).toBeGreaterThanOrEqual(3);
      expect(topic.technical.length).toBeGreaterThanOrEqual(2);
      expect(topic.status.length).toBeGreaterThanOrEqual(2);
      expect(topic.limitations.length).toBeGreaterThanOrEqual(1);
      expect(topic.related.length).toBeGreaterThanOrEqual(2);
      expect(topic.references.length).toBeGreaterThanOrEqual(1);
    }
  });

  test("referenced repository documents exist", () => {
    for (const topic of TECHNOLOGY_TOPICS) {
      for (const ref of topic.references) {
        const path = ref.href.split("/blob/main/")[1];
        expect(existsSync(join(root, path)), path).toBe(true);
      }
    }
  });

  test("internal related links point at existing routes", () => {
    for (const topic of TECHNOLOGY_TOPICS) {
      for (const link of topic.related) {
        const path = link.href.split("#")[0];
        if (path.startsWith("/technology/")) expect(findTechnologyTopic(path.slice(12))).toBeDefined();
        else if (path.startsWith("/mission/")) expect(existsSync(join(root, `src/routes/mission.${path.slice(9)}.tsx`))).toBe(true);
        else expect(path).toBe("/project/guide");
      }
    }
  });

  test("status text never claims host-dependent or unvalidated work is operational", () => {
    for (const topic of TECHNOLOGY_TOPICS) {
      expect(topic.status.some((s) => s.level !== "implemented")).toBe(true);
      const text = JSON.stringify(topic).toLowerCase();
      for (const banned of ["clinically validated measurement is", "flight-qualified software is", "fully operational", "diagnoses"]) {
        expect(text).not.toContain(banned);
      }
    }
    expect(JSON.stringify(findTechnologyTopic("security-privacy"))).toContain("FV-01-13");
    expect(JSON.stringify(findTechnologyTopic("offline-first-architecture"))).toContain("airplane-mode");
  });

  test("topic pages are indexable, self-canonical and listed in the sitemap", () => {
    for (const slug of TECHNOLOGY_TOPIC_SLUGS) {
      const path = technologyTopicPath(slug);
      expect(TECHNOLOGY_TOPIC_ROUTES).toContain(path);
      expect(INDEXABLE_ROUTES).toContain(path);
      expect(sitemap).toContain(`https://mitochondria.edocinfo.com${path}</loc>`);
      const head = indexableRouteHead({ path, title: "T", description: "D", ogType: "article" });
      expect(head.links[0].href).toBe(`https://mitochondria.edocinfo.com${path}`);
    }
  });

  test("topic page layout uses semantic, accessible structure", () => {
    expect((topicPage.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(topicPage).toContain('aria-label="Breadcrumb"');
    expect(topicPage).toContain('aria-current="page"');
    expect(topicPage).toContain("<figure");
    expect(topicPage).toContain("<figcaption");
    expect(topicPage).toContain("opens in a new tab");
    expect(topicPage).toContain("does not diagnose");
  });

  test("unknown topics return not-found instead of an empty page", () => {
    const route = read("src/routes/technology.$topic.tsx");
    expect(route).toContain("throw notFound()");
    expect(route).toContain("noindex, nofollow");
  });
});
