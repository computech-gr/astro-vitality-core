import { CANONICAL_ORIGIN, getSiteOrigin } from "@/infrastructure/config";
import { getSupabaseBrowserConfigStatus } from "@/integrations/supabase/config";

export type MissionAuthReadinessState = "ready" | "configuration_required" | "unknown";

export interface MissionAuthReadiness {
  state: MissionAuthReadinessState;
  emailProviderEnabled?: boolean;
  signupAllowed?: boolean;
  runtimeOrigin: string;
  canonicalOrigin: string;
  message: string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : undefined;
}

export function parseMissionAuthSettings(payload: unknown): Pick<MissionAuthReadiness, "emailProviderEnabled" | "signupAllowed"> {
  const root = asRecord(payload);
  if (!root) return {};

  const external = asRecord(root["external"]);
  const email = asRecord(root["email"]);
  const explicitEmail =
    typeof external?.["email"] === "boolean"
      ? (external["email"] as boolean)
      : typeof email?.["enabled"] === "boolean"
        ? (email["enabled"] as boolean)
        : typeof root["email"] === "boolean"
          ? (root["email"] as boolean)
          : undefined;

  const signupAllowed = typeof root["disable_signup"] === "boolean" ? !root["disable_signup"] : undefined;
  return {
    ...(typeof explicitEmail === "boolean" ? { emailProviderEnabled: explicitEmail } : {}),
    ...(typeof signupAllowed === "boolean" ? { signupAllowed } : {}),
  };
}

export async function loadMissionAuthReadiness(): Promise<MissionAuthReadiness> {
  const config = getSupabaseBrowserConfigStatus();
  const runtimeOrigin = getSiteOrigin();
  if (!config.configured || !config.url || !config.publishableKey) {
    return {
      state: "configuration_required",
      runtimeOrigin,
      canonicalOrigin: CANONICAL_ORIGIN,
      message: "CONFIGURATION REQUIRED — browser-safe Supabase configuration is missing.",
    };
  }

  try {
    const response = await fetch(`${config.url.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: config.publishableKey },
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        state: "unknown",
        runtimeOrigin,
        canonicalOrigin: CANONICAL_ORIGIN,
        message: `Auth readiness could not be confirmed (${response.status}). Existing sign-in may still be attempted.`,
      };
    }
    const parsed = parseMissionAuthSettings(await response.json());
    if (parsed.emailProviderEnabled === false) {
      return {
        state: "configuration_required",
        ...parsed,
        runtimeOrigin,
        canonicalOrigin: CANONICAL_ORIGIN,
        message: "CONFIGURATION REQUIRED — Supabase Email authentication is disabled for this project.",
      };
    }
    return {
      state: "ready",
      ...parsed,
      runtimeOrigin,
      canonicalOrigin: CANONICAL_ORIGIN,
      message:
        parsed.signupAllowed === false
          ? "Email sign-in is enabled. New account sign-up is disabled by project policy."
          : "Email authentication readiness is available.",
    };
  } catch {
    return {
      state: "unknown",
      runtimeOrigin,
      canonicalOrigin: CANONICAL_ORIGIN,
      message: "Auth readiness endpoint is unreachable. Existing sign-in may still be attempted.",
    };
  }
}
