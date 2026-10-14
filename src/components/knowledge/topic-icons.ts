import { CloudOff, Cpu, DatabaseZap, Layers, Microscope, RadioTower, ShieldCheck, Watch, type LucideIcon } from "lucide-react";

import type { TechnologyTopicSlug } from "@/content/technology-topics";

export const TOPIC_ICONS: Record<TechnologyTopicSlug, LucideIcon> = {
  "system-architecture": Layers,
  "device-integration": Cpu,
  wearables: Watch,
  "medical-laboratory-data": Microscope,
  "environmental-telemetry": RadioTower,
  "canonical-health-data-model": DatabaseZap,
  "offline-first-architecture": CloudOff,
  "security-privacy": ShieldCheck,
};
