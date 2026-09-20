import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const ORIGIN = "https://mitochondria.edocinfo.com";

const read = (p) => readFileSync(join(root, p), "utf8");

const policy = read("src/infrastructure/seo.ts");
const sitemap = read("public/sitemap.xml");
const robots = read("public/robots.txt");

const INDEXABLE = {
  "/": "src/routes/index.tsx",
  "/project/guide": "src/routes/project.guide.tsx",
  "/mission/validation": "src/routes/mission.validation.tsx",
  "/mission/submission": "src/routes/mission.submission.tsx",
};

const OPERATIONAL = {
  "/mission/live": "src/routes/mission.live.tsx",
  "/mission/readiness": "src/routes/mission.readiness.tsx",
  "/mission/intelligence": "src/routes/mission.intelligence.tsx",
  "/mission/alerts": "src/routes/mission.alerts.tsx",
  "/mission/guidance": "src/routes/mission.guidance.tsx",
  "/mission/offline": "src/routes/mission.offline.tsx",
  "/mission/ground": "src/routes/mission.ground.tsx",
  "/mission/simulation": "src/routes/mission.simulation.tsx",
};

// 1. Policy module declares both sets and the shared social image.
for (const token of ["INDEXABLE_ROUTES", "NON_INDEXABLE_ROUTES", '"/og-image.jpg"']) {
  if (!policy.includes(token)) failures.push(`seo policy module missing ${token}`);
}
for (const path of Object.keys(INDEXABLE)) {
  if (!policy.includes(`"${path}"`)) failures.push(`policy missing indexable route ${path}`);
}
for (const path of Object.keys(OPERATIONAL)) {
  if (!policy.includes(`"${path}"`)) failures.push(`policy missing non-indexable route ${path}`);
}
for (const token of [
  '{ name: "robots", content: "index, follow" }',
  '{ name: "robots", content: "noindex, nofollow" }',
]) {
  if (!policy.includes(token)) failures.push(`policy missing robots directive ${token}`);
}
for (const token of [
  'property: "og:title"',
  'property: "og:description"',
  'property: "og:type"',
  'property: "og:url"',
  'property: "og:image"',
  'name: "twitter:card", content: "summary_large_image"',
  'name: "twitter:title"',
  'name: "twitter:description"',
  'name: "twitter:image"',
]) {
  const occurrences = policy.split(token).length - 1;
  if (occurrences < 2) failures.push(`policy must apply ${token} to both route classes`);
}

// 2. Route files use the policy builders, never ad-hoc metadata.
for (const [path, file] of Object.entries(INDEXABLE)) {
  const src = read(file);
  if (!src.includes("indexableRouteHead")) failures.push(`${file} must use indexableRouteHead`);
  if (!src.includes(`path: "${path}"`)) failures.push(`${file} must self-canonicalize to ${path}`);
}
for (const [path, file] of Object.entries(OPERATIONAL)) {
  const src = read(file);
  if (!src.includes("operationalRouteHead")) failures.push(`${file} must use operationalRouteHead`);
  if (!src.includes(`path: "${path}"`)) failures.push(`${file} must self-canonicalize to ${path}`);
}

// 3. No Lovable preview origin anywhere in SEO surfaces.
for (const [label, text] of [
  ["seo policy", policy],
  ["sitemap.xml", sitemap],
  ["robots.txt", robots],
  ...Object.values({ ...INDEXABLE, ...OPERATIONAL }).map((f) => [f, read(f)]),
]) {
  if (/lovable\.app/i.test(text)) failures.push(`${label} must not reference a Lovable preview origin`);
}

// 4. Sitemap validity and exact indexable coverage.
if (!sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
  failures.push("sitemap.xml missing XML declaration");
}
if (!sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')) {
  failures.push("sitemap.xml missing sitemaps.org urlset namespace");
}
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const expected = Object.keys(INDEXABLE).map((p) => (p === "/" ? `${ORIGIN}/` : `${ORIGIN}${p}`));
for (const url of expected) {
  if (!locs.includes(url)) failures.push(`sitemap.xml missing indexable URL ${url}`);
}
for (const url of locs) {
  if (!url.startsWith(`${ORIGIN}/`)) failures.push(`sitemap.xml URL not on production origin: ${url}`);
  if (!expected.includes(url)) failures.push(`sitemap.xml must not index non-public route: ${url}`);
}
if (new Set(locs).size !== locs.length) failures.push("sitemap.xml contains duplicate URLs");

// 5. robots.txt declares the sitemap and does not block crawlers.
if (!robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`)) {
  failures.push("robots.txt missing Sitemap declaration");
}
if (/^\s*Disallow:\s*\/\s*$/m.test(robots)) failures.push("robots.txt blocks the whole site");

// 6. Exactly one meaningful <h1> per page component.
const PAGE_COMPONENTS = [
  "src/components/app-shell.tsx",
  "src/components/project-guide.tsx",
  "src/components/validation-usability.tsx",
  "src/components/challenge-submission.tsx",
  "src/components/live-dashboard.tsx",
  "src/components/readiness-assessment.tsx",
  "src/components/health-intelligence.tsx",
  "src/components/explainable-alerts.tsx",
  "src/components/action-guidance.tsx",
  "src/components/offline-mission.tsx",
  "src/components/ground-research-console.tsx",
  "src/components/synthetic-mission.tsx",
];
for (const file of PAGE_COMPONENTS) {
  const src = read(file);
  const h1Count = (src.match(/<h1[\s>]/g) ?? []).length;
  if (h1Count !== 1) failures.push(`${file} must render exactly one <h1> (found ${h1Count})`);
  const h2Count = (src.match(/<h2[\s>]/g) ?? []).length;
  if (h2Count < 1) failures.push(`${file} must render at least one <h2> section heading`);
  if (/<h4[\s>]/.test(src) && h2Count === 0) failures.push(`${file} skips heading levels`);
}

// 7. Policy documentation exists.
const doc = read("docs/SEO_INDEXABILITY_POLICY.md");
for (const token of [ORIGIN, "noindex, nofollow", "/og-image.jpg", "sitemap.xml"]) {
  if (!doc.includes(token)) failures.push(`docs/SEO_INDEXABILITY_POLICY.md missing ${token}`);
}

if (failures.length) {
  console.error("SEO & indexability verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log("SEO & indexability verification PASS");
