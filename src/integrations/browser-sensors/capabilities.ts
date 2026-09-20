import { deviceMotionPermissionMode, isDeviceMotionSupported } from "./device-motion";
import { isCameraPpgSupported } from "./camera-ppg";

export interface BrowserLiveCapability {
  id: "camera_ppg" | "device_motion" | "web_bluetooth";
  label: string;
  availability: "available" | "permission_required" | "unsupported";
  detail: string;
}

export interface BrowserLiveCapabilities {
  cameraPpg: BrowserLiveCapability;
  deviceMotion: BrowserLiveCapability;
  webBluetooth: BrowserLiveCapability;
}

export function detectBrowserLiveCapabilities(): BrowserLiveCapabilities {
  const cameraAvailable = isCameraPpgSupported();
  const motionMode = deviceMotionPermissionMode();
  const bluetoothAvailable = typeof navigator !== "undefined" && "bluetooth" in navigator;
  return {
    cameraPpg: {
      id: "camera_ppg",
      label: "Phone Camera PPG",
      availability: cameraAvailable ? "permission_required" : "unsupported",
      detail: cameraAvailable
        ? "Zero-install pulse estimation from the rear camera after explicit camera permission."
        : "This browser does not expose camera capture to the console.",
    },
    deviceMotion: {
      id: "device_motion",
      label: "Phone Motion Sensors",
      availability: !isDeviceMotionSupported()
        ? "unsupported"
        : motionMode === "prompt"
          ? "permission_required"
          : "available",
      detail: !isDeviceMotionSupported()
        ? "This browser does not expose DeviceMotion events."
        : motionMode === "prompt"
          ? "Motion access is available after the browser's explicit permission prompt."
          : "Motion context is available from the browser device-sensor API.",
    },
    webBluetooth: {
      id: "web_bluetooth",
      label: "Direct Bluetooth Health Sensor",
      availability: bluetoothAvailable ? "permission_required" : "unsupported",
      detail: bluetoothAvailable
        ? "Connect a user-selected BLE sensor that exposes the standard Heart Rate Service."
        : "Direct Web Bluetooth is not available in this browser; use camera PPG or another supported source.",
    },
  };
}
