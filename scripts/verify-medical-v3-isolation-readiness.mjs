/** Static, fail-closed readiness verifier. Does not connect to any service. */
import fs from "node:fs";
import path from "node:path";
const required = [
  "scripts/medical-v3-isolated-browser-preflight.py",
  "docs/MEDICAL_V3_ISOLATED_BROWSER_ACCEPTANCE_STATUS.md",
  "src/lib/medical-session-middleware.ts",
  "supabase/pending/20261025000000_medical_v3_synthetic_completion.sql",
];
const missing = required.filter((file) => !fs.existsSync(path.resolve(file)));
if (missing.length) {
  console.error("BLOCKED: missing isolation prerequisites:", missing.join(", "));
  process.exit(2);
}
const preflight = fs.readFileSync("scripts/medical-v3-isolated-browser-preflight.py", "utf8");
for (const guard of ["127.0.0.1", "localhost", "8080", "medical_v3_it", "BLOCKED"]) {
  if (!preflight.includes(guard)) {
    console.error(`BLOCKED: isolation preflight missing guard ${guard}`);
    process.exit(2);
  }
}
console.log(
  "PASS: repository isolation prerequisites present. This is NOT browser acceptance or production authorization.",
);
