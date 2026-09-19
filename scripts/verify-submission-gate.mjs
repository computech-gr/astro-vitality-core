import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const ledger = JSON.parse(readFileSync(join(root, "data/submission/p20-evidence.v1.json"), "utf8"));
const pending = ledger.evidence.filter((item) => item.critical && item.status !== "ready");
const manifest = join(root, "data/submission/submission-manifest.v1.json");
if (!existsSync(manifest)) {
  console.error("P20 FINAL SUBMISSION GATE FAILED: generate the controlled submission manifest first with `bun run submission:manifest`.");
  process.exit(1);
}
if (pending.length) {
  console.error("P20 FINAL SUBMISSION GATE BLOCKED:\n- " + pending.map((item) => `${item.id}: ${item.status} — ${item.evidence}`).join("\n- "));
  process.exit(1);
}
console.log("P20 FINAL SUBMISSION GATE PASS — all critical evidence is recorded ready.");
