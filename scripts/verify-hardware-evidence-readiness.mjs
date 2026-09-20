import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const required = [
  ".github/workflows/android-companion.yml",
  "android-companion/settings.gradle.kts",
  "android-companion/app/build.gradle.kts",
  "android-companion/app/src/main/AndroidManifest.xml",
  "android-companion/app/src/main/java/com/computech/mitochondria/MainActivity.kt",
  "android-companion/app/src/main/java/com/computech/mitochondria/HealthConnectBridge.kt",
  "docs/P20_SAMSUNG_HEALTH_CONNECT_TEST.md",
  "src/integrations/wearables/android-health-connect-js-bridge.ts",
  "tests/integrations/p20-hardware-evidence-readiness.test.ts",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const live = readFileSync(join(root, "src/components/live-dashboard.tsx"), "utf8");
for (const token of [
  'classification: "medical_sensitive" as const',
  "Connect Health Connect",
  "Download non-value evidence receipt",
  "createAndroidHealthConnectJsBridge",
  "containsRawHealthValues: false",
]) if (!live.includes(token)) failures.push(`live hardware path missing ${token}`);
if (live.includes('classification: "synthetic" as const') && live.includes("LIVE_DEVICE_CONTEXT")) failures.push("real live-device context must not be synthetic");

const bridge = readFileSync(join(root, "src/integrations/wearables/android-health-connect-js-bridge.ts"), "utf8");
for (const token of ["MitochondriaHealthConnect", "Health Connect is not a web API", "phys.heart_rate"]) {
  if (!bridge.includes(token)) failures.push(`web Health Connect bridge missing ${token}`);
}

const manifest = readFileSync(join(root, "android-companion/app/src/main/AndroidManifest.xml"), "utf8");
if (!manifest.includes("android.permission.health.READ_HEART_RATE")) failures.push("Android companion missing read-heart-rate permission");
if (/WRITE_HEART_RATE|WRITE_HEALTH/i.test(manifest)) failures.push("Android companion must remain read-only for health data");

const kotlin = readFileSync(join(root, "android-companion/app/src/main/java/com/computech/mitochondria/HealthConnectBridge.kt"), "utf8");
if (!kotlin.includes("HeartRateRecord")) failures.push("Android bridge must read HeartRateRecord");
if (/insertRecords|updateRecords|deleteRecords/.test(kotlin)) failures.push("Android bridge must not write or delete Health Connect records");

const evidence = JSON.parse(readFileSync(join(root, "data/submission/p20-evidence.v1.json"), "utf8"));
const hw = evidence.evidence.find((item) => item.id === "P20-HW-001");
if (!hw || hw.status !== "pending_human") failures.push("P20-HW-001 must remain pending_human until a physical session is recorded");

if (failures.length) {
  console.error("P20 hardware evidence readiness verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P20 hardware evidence readiness verification PASS");
