/**
 * Browser tab convenience memory for the public demo: only the synthetic
 * workspace join code, chosen role and expiry. No medical values, notes,
 * outcomes or credentials are stored.
 */
import { isDemoRole, type DemoRole } from "./workflow";

export const P69_DEMO_STORAGE_KEY = "mitochondria.p69.public-demo.v1";

export interface StoredDemoWorkspace {
  joinCode: string | null;
  role: DemoRole;
  expiresAt: string;
}

const JOIN = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export function parseStoredDemoWorkspace(raw: string | null): StoredDemoWorkspace | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (Object.keys(v).sort().join(",") !== "expiresAt,joinCode,role") return null;
    if (!isDemoRole(v["role"]) || typeof v["expiresAt"] !== "string") return null;
    if (v["joinCode"] !== null && (typeof v["joinCode"] !== "string" || !JOIN.test(v["joinCode"]))) return null;
    return { joinCode: v["joinCode"] as string | null, role: v["role"], expiresAt: v["expiresAt"] };
  } catch {
    return null;
  }
}

export function readStoredDemoWorkspace(): StoredDemoWorkspace | null {
  if (typeof window === "undefined") return null;
  return parseStoredDemoWorkspace(window.sessionStorage.getItem(P69_DEMO_STORAGE_KEY));
}

export function writeStoredDemoWorkspace(value: StoredDemoWorkspace): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    P69_DEMO_STORAGE_KEY,
    JSON.stringify({ joinCode: value.joinCode, role: value.role, expiresAt: value.expiresAt }),
  );
}

export function clearStoredDemoWorkspace(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(P69_DEMO_STORAGE_KEY);
}
