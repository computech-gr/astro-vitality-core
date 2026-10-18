import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
const rootRoute = readFileSync(join(root, "src/routes/__root.tsx"), "utf8");
const guide = readFileSync(join(root, "src/components/project-guide.tsx"), "utf8");
const failures = [];

for (const token of [
  "export function SiteHeader()",
  'href: "/mission/experience"',
  'href: "/#science"',
  'href: "/mission/intelligence"',
  'href: "/#technology"',
  'href: "/#open-source"',
  'href: "/#about"',
]) {
  if (!shell.includes(token)) failures.push(`app shell missing ${token}`);
}
if (!rootRoute.includes('<SiteHeader />')) failures.push("root route does not mount global site header");
if (!rootRoute.includes('pt-[var(--header-offset,76px)]')) failures.push("root route does not offset content below fixed site header");
if (guide.includes('pt-[var(--header-offset)]')) failures.push("project guide still has duplicate header offset");
if (shell.includes('<Header />')) failures.push("homepage still mounts a second header");

if (failures.length) {
  console.error("Global site header verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("Global site header verification PASS");
