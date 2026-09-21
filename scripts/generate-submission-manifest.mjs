import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  "data/submission/p20-real-device-evidence.v1.json",
  "data/submission/p19-independent-reproduction.v1.json",
  "data/submission/p20-final-external-evidence.v1.json",
  "docs/P20_REAL_DEVICE_EVIDENCE.md",
  "data/release/mission-day-127.synthetic.json",
];

const missing = files.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  console.error(`P20 SUBMISSION MANIFEST FAILED: required controlled input(s) are missing:\n- ${missing.join("\n- ")}\nGenerate required artifacts first (for the deterministic release sample run \`bun run sample:release\`).`);
  process.exit(1);
}

const entries = files.map((file) => {
  const bytes = readFileSync(join(root, file));
  return { file, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.byteLength };
});
const output = join(root, "data/submission/submission-manifest.v1.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify({ version: "1.1", generatedFrom: "repository-controlled P20 inputs", files: entries }, null, 2)}\n`);
console.log(`Wrote ${output}`);
