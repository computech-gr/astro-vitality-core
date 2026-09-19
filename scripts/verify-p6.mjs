import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findUnexpectedMigrations } from "./migration-policy.mjs";

const root = process.cwd();
const failures = [];
const required = [
  "src/integrations/wearables/web-bluetooth-heart-rate.ts",
  "src/integrations/wearables/mobile-health-bridge.ts",
  "src/integrations/wearables/vendor-cloud.ts",
  "src/integrations/wearables/index.ts",
  "tests/integrations/p6-wearables-integration.test.ts",
  "docs/WEARABLES_INTEGRATION.md",
];
for (const file of required)
  if (!existsSync(join(root, file))) failures.push(`Missing required P6 file: ${file}`);

const ble = readFileSync(
  join(root, "src/integrations/wearables/web-bluetooth-heart-rate.ts"),
  "utf8",
);
for (const token of [
  "heart_rate",
  "heart_rate_measurement",
  "parseHeartRateMeasurement",
  "phys.heart_rate",
])
  if (!ble.includes(token)) failures.push(`BLE adapter missing ${token}`);

const mobile = readFileSync(
  join(root, "src/integrations/wearables/mobile-health-bridge.ts"),
  "utf8",
);
for (const token of ["createHealthConnectAdapter", "createHealthKitAdapter", "getCanonicalMetric"])
  if (!mobile.includes(token)) failures.push(`Mobile health bridge missing ${token}`);

const vendor = readFileSync(join(root, "src/integrations/wearables/vendor-cloud.ts"), "utf8");
if (!vendor.includes("OAuth/token acquisition remains outside this adapter"))
  failures.push("Vendor adapter must keep OAuth/token acquisition outside the adapter");
if (!vendor.includes("getCanonicalMetric"))
  failures.push("Vendor adapter must fail closed through canonical registry");

const tests = readFileSync(
  join(root, "tests/integrations/p6-wearables-integration.test.ts"),
  "utf8",
);
for (const token of [
  "WebBluetoothHeartRateAdapter",
  "createHealthConnectAdapter",
  "VendorCloudWearableAdapter",
  "same P4 canonical metric",
])
  if (!tests.includes(token)) failures.push(`P6 test coverage missing ${token}`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.scripts?.["verify:p6"] !== "node scripts/verify-p6.mjs")
  failures.push("package.json must expose verify:p6");
if (!String(pkg.scripts?.check ?? "").includes("verify:p6"))
  failures.push("Full check must include verify:p6");
const workflow = readFileSync(join(root, ".github/workflows/quality.yml"), "utf8");
if (!workflow.includes("bun run verify:p6")) failures.push("CI must run the P6 verifier");

const unexpectedMigrations = findUnexpectedMigrations(root);
if (unexpectedMigrations.length) {
  failures.push(`Unexpected Supabase migrations: ${unexpectedMigrations.join(", ")}`);
}

if (failures.length) {
  console.error("P6 wearables integration verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P6 wearables integration verification PASS");
