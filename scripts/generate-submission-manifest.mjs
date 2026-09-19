import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const files = [
  "docs/CHALLENGE_DEMO_SCRIPT.md",
  "docs/VIDEO_STORYBOARD.md",
  "docs/DEMO_FALLBACK_RUNBOOK.md",
  "docs/POSTER_ARCHITECTURE.md",
  "docs/NASA_RESOURCE_ATTRIBUTION.md",
  "docs/SUBMISSION_PACKAGE.md",
  "docs/JUDGING_ALIGNMENT.md",
  "docs/KNOWN_LIMITATIONS.md",
  "CITATIONS.md",
  "data/submission/p20-evidence.v1.json",
  "data/release/mission-day-127.synthetic.json",
];
const entries = files.map((file) => {
  const bytes = readFileSync(join(root, file));
  return { file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
});
const output = join(root, "data/submission/submission-manifest.v1.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ version: "1.0", generatedFrom: "repository-controlled P20 inputs", files: entries }, null, 2)}\n`);
console.log(`Wrote ${output}`);
