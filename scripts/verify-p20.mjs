import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "data/submission/p20-evidence.v1.json",
  "data/submission/p19-independent-reproduction.v1.json",
  "data/submission/p20-final-external-evidence.v1.json",
  "docs/CHALLENGE_DEMO_SCRIPT.md",
  "docs/VIDEO_STORYBOARD.md",
  "docs/DEMO_FALLBACK_RUNBOOK.md",
  "docs/POSTER_ARCHITECTURE.md",
  "docs/NASA_RESOURCE_ATTRIBUTION.md",
  "docs/SUBMISSION_PACKAGE.md",
  "docs/JUDGING_ALIGNMENT.md",
  "scripts/generate-submission-manifest.mjs",
  "src/domain/challenge-submission/contracts.ts",
  "src/domain/challenge-submission/catalog.ts",
  "src/domain/challenge-submission/report.ts",
  "src/domain/challenge-submission/index.ts",
  "src/components/challenge-submission.tsx",
  "src/routes/mission.submission.tsx",
  "tests/submission/p20-challenge-submission.test.ts",
  "tests/submission/p20-final-evidence-gate.test.ts",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const script of ["verify:p20", "submission:manifest", "submission:gate"]) {
  if (!pkg.scripts?.[script]) failures.push(`package.json missing ${script}`);
}
if (!String(pkg.scripts?.check ?? "").includes("verify:p20")) failures.push("Full check must include verify:p20");

const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes('Challenge Submission')) failures.push("About navigation must expose Challenge Submission");
if (!shell.includes('/mission/submission')) failures.push("Challenge Submission must route to /mission/submission");
if (!shell.includes('create-health-monitoring-software-for-astronauts-on-space-missions')) failures.push("Mission challenge link must use the official 2026 challenge URL");

const docs = readFileSync(join(root, "docs/SUBMISSION_PACKAGE.md"), "utf8").toLowerCase();
for (const token of ["real physical live-device", "release-candidate", "final original challenge video", "official 2026 submission/judging", "submission:gate"]) {
  if (!docs.includes(token)) failures.push(`submission package docs missing ${token}`);
}

const attribution = readFileSync(join(root, "docs/NASA_RESOURCE_ATTRIBUTION.md"), "utf8").toLowerCase();
for (const token of ["independent participant project", "do not imply endorsement", "synthetic only", "participant terms"]) {
  if (!attribution.includes(token)) failures.push(`NASA attribution missing ${token}`);
}

const ledger = JSON.parse(readFileSync(join(root, "data/submission/p20-evidence.v1.json"), "utf8"));
const ids = new Set(ledger.evidence.map((item) => item.id));
for (const id of ["P20-HW-001", "P20-DEMO-001", "P20-DQ-001", "P20-OFFLINE-001", "P20-GROUND-001", "P20-LAB-001", "P20-RC-001", "P20-VIDEO-001", "P20-ATTR-001", "P20-LIMIT-001", "P20-RULES-001"]) {
  if (!ids.has(id)) failures.push(`submission evidence missing ${id}`);
}

if (failures.length) {
  console.error("P20 Challenge Demo & Submission structural verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P20 Challenge Demo & Submission structural verification PASS");
