import { readFileSync, existsSync } from 'node:fs';
const required = [
  'docs/MEDICAL_V3_STAGING_ARCHITECTURE.md',
  'docs/MEDICAL_V3_STAGING_SECURITY_STATUS.md',
  'docs/MEDICAL_V3_ISOLATED_EXECUTION_HANDOFF.md',
  'docs/MEDICAL_V3_SYNTHETIC_COMPLETION_STATUS.md',
];
const missing = required.filter((p) => !existsSync(p));
if (missing.length) {
  console.error('BLOCKED: missing required medical v3 handoff files:', missing.join(', '));
  process.exit(2);
}
const wf = readFileSync('.github/workflows/medical-v3-release-gate.yml', 'utf8');
for (const check of ['bun run check', 'bun run typecheck', 'bun run lint', 'bun run format:check', 'bun run build', 'TRIVY_INCLUDE_DEV_DEPS']) {
  if (!wf.includes(check)) throw new Error(`Missing release check: ${check}`);
}
console.log('Medical v3 release gate structure PASS; isolated browser acceptance is NOT attested.');
