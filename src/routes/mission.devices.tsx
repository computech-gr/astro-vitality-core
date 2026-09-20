import { createFileRoute } from "@tanstack/react-router";

import { DeviceIntegrationCenter } from "@/components/device-integration-center";
import { operationalRouteHead } from "@/infrastructure/seo";

const title = "Device Integration Center | The Mitochondria";
const description =
  "Capability-aware live source integration for camera PPG, phone motion sensors, direct Web Bluetooth and governed mission-health adapters.";

export const Route = createFileRoute("/mission/devices")({
  head: () => operationalRouteHead({ path: "/mission/devices", title, description }),
  component: DeviceIntegrationCenter,
});
