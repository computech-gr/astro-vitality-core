import type { GroundCapability, GroundPrincipal, GroundRole } from "./contracts";

const ROLE_CAPABILITIES: Record<GroundRole, readonly GroundCapability[]> = {
  crew_self: ["identified_health"],
  ground_medical: ["crew_overview", "identified_health", "alert_review", "device_health", "audit_review", "research_export"],
  mission_operator: ["crew_overview", "alert_review", "device_health", "audit_review"],
  researcher: ["research_export"],
};

export function canGroundAccess(principal: GroundPrincipal, capability: GroundCapability): boolean {
  return ROLE_CAPABILITIES[principal.role].includes(capability);
}

export function assertGroundAccess(principal: GroundPrincipal, capability: GroundCapability): void {
  if (!canGroundAccess(principal, capability)) {
    throw new Error(`Ground role ${principal.role} is not authorized for ${capability}`);
  }
}
