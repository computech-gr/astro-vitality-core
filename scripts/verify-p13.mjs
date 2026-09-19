import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  "src/domain/action-guidance/contracts.ts",
  "src/domain/action-guidance/protocols.ts",
  "src/domain/action-guidance/engine.ts",
  "src/domain/action-guidance/index.ts",
  "src/components/action-guidance.tsx",
  "src/routes/mission.guidance.tsx",
  "tests/domain/p13-action-protocol-guidance.test.ts",
  "docs/ACTION_PROTOCOL_GUIDANCE.md",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const contracts = readFileSync(join(root, "src/domain/action-guidance/contracts.ts"), "utf8");
for (const token of [
  "repeat-quality-check",
  "recovery-workload-review",
  "hydration-nutrition-review",
  "exercise-review",
  "environmental-review",
  "medical-escalation",
  "requiresAcknowledgement",
  "nonDiagnostic: true",
]) {
  if (!contracts.includes(token)) failures.push(`P13 contract missing ${token}`);
}

const protocols = readFileSync(join(root, "src/domain/action-guidance/protocols.ts"), "utf8");
for (const token of [
  "governed_trigger_required",
  "Decision support only",
  "does not diagnose disease",
]) {
  if (!protocols.toLowerCase().includes(token.toLowerCase()))
    failures.push(`P13 protocol safety wording missing ${token}`);
}

const engine = readFileSync(join(root, "src/domain/action-guidance/engine.ts"), "utf8");
for (const token of [
  "Research-only findings cannot generate operational action guidance",
  "data_quality",
  "createGovernedEscalationAction",
  "authority",
  "version",
  "reasonCode",
  "acknowledgeAction",
]) {
  if (!engine.includes(token)) failures.push(`P13 engine missing ${token}`);
}
if (/medical-escalation"\s*\]/.test(engine))
  failures.push("P13 pattern mapping must not directly map a pattern to medical escalation");

const component = readFileSync(join(root, "src/components/action-guidance.tsx"), "utf8");
for (const token of [
  "No active session guidance",
  "GOVERNED TRIGGER ONLY",
  "No action card is a diagnosis",
  "P13 · Action & Protocol Guidance",
]) {
  if (!component.includes(token)) failures.push(`P13 UI safeguard missing: ${token}`);
}

const shell = readFileSync(join(root, "src/components/app-shell.tsx"), "utf8");
if (!shell.includes('label === "Action Guidance"'))
  failures.push("Platform Action Guidance menu item must activate P13 route");
if (!shell.includes('return "/mission/guidance"')) failures.push("P13 navigation route missing");

const tests = readFileSync(join(root, "tests/domain/p13-action-protocol-guidance.test.ts"), "utf8");
for (const token of [
  "Research-only",
  "DATA QUALITY",
  "medical escalation cannot be inferred",
  "acknowledgements preserve actor",
  "CO2/cognition guidance at WATCH",
]) {
  if (!tests.includes(token)) failures.push(`P13 tests missing gate: ${token}`);
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (packageJson.scripts?.["verify:p13"] !== "node scripts/verify-p13.mjs")
  failures.push("package.json must expose verify:p13");
if (!String(packageJson.scripts?.check ?? "").includes("verify:p13"))
  failures.push("Full check must include verify:p13");

const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p13")) failures.push("CI must run P13 verifier");

const migrationsDir = join(root, "supabase", "migrations");
if (existsSync(migrationsDir)) {
  const sql = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
  const unexpected = sql.filter(
    (name) =>
      ![
        "20260919190000_p15_ground_research_console.sql",
        "20260919164826_c7dfa3eb-b9a5-4bce-9ae7-aa4b712120d9.sql",
        "20260919164849_0a37122b-370c-4662-9148-8a0b58f146c5.sql",
      ].includes(name),
  );
  if (unexpected.length)
    failures.push(`P13 must not add database migrations: ${unexpected.join(", ")}`);
}

if (failures.length) {
  console.error("P13 Action & Protocol Guidance verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P13 Action & Protocol Guidance verification PASS");
