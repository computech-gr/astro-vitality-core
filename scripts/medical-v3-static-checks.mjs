import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// These require independently attested services; they are not static acceptance.
export const runtimeExclusions = Object.freeze({
  "verify-fv01-pg-integration.mjs": "Disposable PostgreSQL required",
  "verify-medical-governance-v3.mjs": "Disposable database required",
  "verify-medical-v3-synthetic-completion.mjs": "Disposable database/provider required",
  "verify-medical-v3-production-synthetic.mjs": "Disposable exact-scope database required",
  "verify-synthetic-activation-guard.mjs":
    "Disposable PostgreSQL concurrency and guard schema required",
  "verify-remote-auth-config.mjs": "Independent authenticated services required",
  "verify-medical-v3-staging-target.mjs": "Owner-approved staging configuration required",
});

export function selectStaticChecks(names) {
  return names
    .filter((name) => /^verify-[a-z0-9-]+\.mjs$/.test(name))
    .filter((name) => !Object.hasOwn(runtimeExclusions, name))
    .sort();
}

function main() {
  const names = selectStaticChecks(readdirSync("scripts"));
  const failures = [];
  for (const [name, reason] of Object.entries(runtimeExclusions)) {
    console.log(`NOT EXECUTED: ${name}: ${reason}`);
  }
  for (const name of names) {
    const result = spawnSync(process.execPath, [`scripts/${name}`], {
      stdio: "inherit",
      timeout: 60_000,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        CI: "true",
      },
    });
    if (result.error || result.status !== 0) failures.push(name);
  }
  console.log(
    `Static verifiers: ${names.length - failures.length} passed / ${failures.length} failed`,
  );
  if (failures.length) console.error(`Failed checks: ${failures.join(", ")}`);
  console.log(
    "Not isolation, browser acceptance, scientific approval or production authorization.",
  );
  process.exitCode = failures.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
