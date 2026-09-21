import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fail = (message) => { console.error(`P20 FINAL SUBMISSION GATE FAILED: ${message}`); process.exit(1); };
const readJson = (file) => JSON.parse(readFileSync(join(root, file), "utf8"));

const ledger = readJson("data/submission/p20-evidence.v1.json");
const pending = ledger.evidence.filter((item) => item.critical && item.status !== "ready");
const manifestPath = join(root, "data/submission/submission-manifest.v1.json");
if (!existsSync(manifestPath)) fail("generate the controlled submission manifest first with `bun run submission:manifest`.");

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!Array.isArray(manifest.files) || manifest.files.length === 0) fail("submission manifest has no controlled files.");
for (const entry of manifest.files) {
  if (!entry?.file || typeof entry.sha256 !== "string" || !Number.isInteger(entry.bytes)) fail("submission manifest contains an invalid entry.");
  const path = join(root, entry.file);
  if (!existsSync(path)) fail(`manifest file is missing: ${entry.file}`);
  const bytes = readFileSync(path);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== entry.bytes) fail(`manifest byte count drift: ${entry.file}`);
  if (digest !== entry.sha256) fail(`manifest SHA-256 drift: ${entry.file}`);
}

const external = readJson("data/submission/p20-final-external-evidence.v1.json");
const videoLedger = ledger.evidence.find((item) => item.id === "P20-VIDEO-001");
if (videoLedger?.status === "ready") {
  const v = external.video;
  if (v?.status !== "ready" || !/^https:\/\//.test(v.publicUrl ?? "") || v.originalTeamCreated !== true || v.rightsAndLicensesConfirmed !== true || v.requiredLikenessConsentsConfirmed !== true || !v.checkedAt) {
    fail("P20-VIDEO-001 is READY without complete public-video rights/consent evidence.");
  }
}
const rulesLedger = ledger.evidence.find((item) => item.id === "P20-RULES-001");
if (rulesLedger?.status === "ready") {
  const r = external.official2026SubmissionRules;
  if (r?.status !== "ready" || !/^https:\/\//.test(r.officialSourceUrl ?? "") || r.submissionFieldsRechecked !== true || r.judgingInstructionsRechecked !== true || r.rightsRequirementsRechecked !== true || !r.checkedAt) {
    fail("P20-RULES-001 is READY without complete official-2026-rules re-check evidence.");
  }
}

if (pending.length) {
  console.error("P20 FINAL SUBMISSION GATE BLOCKED:\n- " + pending.map((item) => `${item.id}: ${item.status} — ${item.evidence}`).join("\n- "));
  process.exit(1);
}
console.log("P20 FINAL SUBMISSION GATE PASS — all critical evidence is READY and every controlled manifest file matches its recorded SHA-256 and byte count.");
