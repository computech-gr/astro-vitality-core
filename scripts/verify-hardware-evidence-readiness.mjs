import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => readFileSync(join(root, file), "utf8");

const required = [
  "src/integrations/wearables/web-bluetooth-heart-rate.ts",
  "src/integrations/browser-sensors/camera-ppg.ts",
  "src/integrations/browser-sensors/device-motion.ts",
  "src/components/device-integration-center.tsx",
  "src/routes/mission.devices.tsx",
  "docs/ZERO_INSTALL_LIVE_DEVICE_DEMO.md",
  "tests/integrations/p20-zero-install-live-sources.test.ts",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const live = read("src/components/live-dashboard.tsx");
for (const token of [
  'classification: "medical_sensitive" as const',
  "Phone Camera PPG",
  "Phone Motion Sensors",
  "Direct Bluetooth Sensor",
  "Download non-value evidence receipt",
  "containsRawHealthValues: false",
]) if (!live.includes(token)) failures.push(`live hardware path missing ${token}`);
if (live.includes('classification: "synthetic" as const') && live.includes("LIVE_DEVICE_CONTEXT")) failures.push("real live-device context must not be synthetic");
if (live.includes("Connect Health Connect")) failures.push("judge-facing live flow must not require Health Connect or an APK");

const camera = read("src/integrations/browser-sensors/camera-ppg.ts");
for (const token of ["navigator.mediaDevices.getUserMedia", "estimatePpgHeartRate", "not-ecg", "phys.heart_rate"]) {
  if (!camera.includes(token)) failures.push(`camera PPG path missing ${token}`);
}
const motion = read("src/integrations/browser-sensors/device-motion.ts");
for (const token of ["DeviceMotionEvent", "activity.acceleration_3axis"]) {
  if (!motion.includes(token)) failures.push(`phone motion path missing ${token}`);
}
const ble = read("src/integrations/wearables/web-bluetooth-heart-rate.ts");
for (const token of ["heart_rate", "heart_rate_measurement", "requestDevice"]) {
  if (!ble.toLowerCase().includes(token.toLowerCase())) failures.push(`BLE path missing ${token}`);
}

if (existsSync(join(root, "android-companion"))) failures.push("android-companion must not be required by the judge-facing baseline");
if (existsSync(join(root, ".github/workflows/android-companion.yml"))) failures.push("android companion workflow must not remain in the judge-facing baseline");

const evidence = JSON.parse(read("data/submission/p20-evidence.v1.json"));
const hw = evidence.evidence.find((item) => item.id === "P20-HW-001");
if (!hw || hw.status !== "pending_human") failures.push("P20-HW-001 must remain pending_human until a real zero-install session is recorded");

if (failures.length) {
  console.error("P20 hardware evidence readiness verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P20 hardware evidence readiness verification PASS");
