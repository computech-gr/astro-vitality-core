import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const read = (file) => readFileSync(join(root, file), "utf8");

const required = [
  "src/components/device-integration-center.tsx",
  "src/routes/mission.devices.tsx",
  "src/integrations/browser-sensors/camera-ppg.ts",
  "src/integrations/browser-sensors/device-motion.ts",
  "src/integrations/browser-sensors/capabilities.ts",
  "src/integrations/browser-sensors/ppg-algorithm.ts",
  "tests/integrations/p20-zero-install-live-sources.test.ts",
  "docs/ZERO_INSTALL_LIVE_DEVICE_DEMO.md",
];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`missing ${file}`);

const live = read("src/components/live-dashboard.tsx");
for (const token of [
  "Phone Camera PPG",
  "Phone Motion Sensors",
  "Direct Bluetooth Sensor",
  "Download non-value evidence receipt",
  'classification: "medical_sensitive" as const',
  "camera_ppg",
  "device_sensor",
]) if (!live.includes(token)) failures.push(`live console missing ${token}`);
for (const forbidden of ["Connect Health Connect", "ANDROID COMPANION REQUIRED"]) {
  if (live.includes(forbidden)) failures.push(`judge-facing live console must not contain ${forbidden}`);
}

const camera = read("src/integrations/browser-sensors/camera-ppg.ts");
for (const token of ["getUserMedia", "video: true", "permissionsPolicyCamera", "facingMode", "estimatePpgHeartRate", "not-ecg", "phys.heart_rate"]) {
  if (!camera.includes(token)) failures.push(`camera PPG adapter missing ${token}`);
}

const securityHeaders = read("src/security/headers.ts");
for (const token of ["camera=(self)", "accelerometer=(self)", "gyroscope=(self)", "microphone=()"] ) {
  if (!securityHeaders.includes(token)) failures.push(`security Permissions-Policy missing ${token}`);
}
if (securityHeaders.includes("camera=()")) failures.push("security Permissions-Policy must not globally deny camera");

const motion = read("src/integrations/browser-sensors/device-motion.ts");
for (const token of ["DeviceMotionEvent", "requestPermission", "activity.acceleration_3axis", 'channelNames: ["x", "y", "z"]']) {
  if (!motion.includes(token)) failures.push(`phone motion adapter missing ${token}`);
}

const bluetooth = read("src/integrations/wearables/web-bluetooth-heart-rate.ts");
for (const token of ["requestHeartRateDevice", "heart_rate", "heart_rate_measurement", "characteristicvaluechanged"]) {
  if (!bluetooth.toLowerCase().includes(token.toLowerCase())) failures.push(`direct BLE path missing ${token}`);
}

const shell = read("src/components/app-shell.tsx");
if (!shell.includes('if (label === "Device Integration Center") return "/mission/devices"')) failures.push("Device Integration Center navigation missing");

if (existsSync(join(root, "android-companion"))) failures.push("android-companion should be removed from the zero-install judge-demo baseline");
if (existsSync(join(root, ".github/workflows/android-companion.yml"))) failures.push("android companion build workflow should be removed from judge-demo baseline");
if (existsSync(join(root, "docs/P20_SAMSUNG_HEALTH_CONNECT_TEST.md"))) failures.push("Samsung APK test runbook should be removed from the zero-install baseline");

const evidence = JSON.parse(read("data/submission/p20-evidence.v1.json"));
const hw = evidence.evidence.find((item) => item.id === "P20-HW-001");
const realDeviceEvidenceDocPath = join(root, "docs/P20_REAL_DEVICE_EVIDENCE.md");
if (!existsSync(realDeviceEvidenceDocPath)) failures.push("missing P20 real-device evidence narrative");
const realDeviceEvidencePath = join(root, "data/submission/p20-real-device-evidence.v1.json");
if (!existsSync(realDeviceEvidencePath)) failures.push("missing controlled P20 real-device evidence artifact");
else {
  const realDeviceEvidence = JSON.parse(readFileSync(realDeviceEvidencePath, "utf8"));
  if (realDeviceEvidence.evidenceId !== "P20-HW-001") failures.push("real-device evidence artifact has wrong evidenceId");
  if (realDeviceEvidence.privacy?.containsRawHealthValues !== false) failures.push("real-device evidence artifact must not contain raw health values");
  const passed = new Set((realDeviceEvidence.observedPaths ?? []).filter((item) => item.status === "pass").map((item) => item.source));
  if (!passed.has("Phone Camera PPG")) failures.push("real-device evidence must include a passed Phone Camera PPG session");
  if (!passed.has("Phone Motion Sensors")) failures.push("real-device evidence must include a passed Phone Motion Sensors session");
}
if (!hw || hw.status !== "ready") failures.push("P20-HW-001 must be ready only after the controlled real-device evidence artifact is recorded");

if (failures.length) {
  console.error("P20 live device center verification FAILED:\n- " + failures.join("\n- "));
  process.exit(1);
}
console.log("P20 live device center verification PASS");
