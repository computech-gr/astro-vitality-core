import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const read = p => readFileSync(resolve(p), "utf8");
const index = JSON.parse(read("data/scientific/p30-nasa-evidence-index.v1.json"));
const screening = JSON.parse(read("data/scientific/bone-health-literature-screening.v1.json"));
const fail = message => { throw new Error(`P30: ${message}`); };
if (index.operationalActivation !== false || index.liveNasaData !== false) fail("reference-only gates");
for (const s of screening.sourceRegistry) {
 const mapped = index.sources.find(x => x.id === s.sourceId);
 if (!mapped || mapped.url !== s.url || mapped.verifiedAt !== s.verifiedAt) fail(`source provenance drift ${s.sourceId}`);
}
if (new Set(index.sources.map(x => x.id)).size !== index.sources.length) fail("duplicate IDs");
if (new Set(index.sources.map(x => x.url)).size !== index.sources.length) fail("duplicate URLs");
for (const source of index.sources) {
 if (!source.url.startsWith("https://www.nasa.gov/") && !source.url.startsWith("https://nasa.gov/") && !source.url.startsWith("https://ntrs.nasa.gov/") && !source.url.startsWith("https://standards.nasa.gov/")) fail(`non-NASA origin ${source.id}`);
 if (source.independentlyReviewed || source.reviewedFullText) fail(`unsupported review claim ${source.id}`);
 if (!existsSync(resolve(source.sourceFile))) fail(`missing provenance ${source.sourceFile}`);
}
const shell = read("src/components/app-shell.tsx"), seo = read("src/infrastructure/seo.ts"), route = read("src/routes/mission.nasa-evidence.tsx");
if (!shell.includes('"NASA Scientific Evidence"') || !shell.includes('"/mission/nasa-evidence"')) fail("navigation missing");
if (!seo.includes('"/mission/nasa-evidence"') || !route.includes("operationalRouteHead")) fail("noindex route missing");
if (!read("src/components/nasa-evidence-workspace.tsx").includes("NOT CONNECTED")) fail("live-data disclaimer missing");
console.log(`P30 NASA evidence verifier PASS (${index.sources.length} reference records)`);
