/**
 * FV-01.4.6 Mission Audit Log — read-only view helpers.
 * The server (get_mission_audit_log) authorizes, scopes and redacts; these helpers add
 * defense-in-depth redaction and UTC filter handling. Nothing here can write audit history.
 */
export type AuditOutcome = "success" | "refused";

export interface MissionAuditEntry {
  id: string;
  occurred_at: string;
  action: string;
  outcome: AuditOutcome;
  target_type: string;
  actor: string;
  actor_role?: string | null;
  details: Record<string, string | number | boolean>;
}

export interface MissionAuditPage {
  entries: MissionAuditEntry[];
  has_more: boolean;
  actions: string[];
  timezone: "UTC";
}

export interface MissionAuditFilters {
  fromDate: string; // YYYY-MM-DD (UTC) or ""
  toDate: string; // YYYY-MM-DD (UTC, inclusive) or ""
  action: string; // "" = all
  outcome: "" | AuditOutcome;
  search: string;
}

export const EMPTY_AUDIT_FILTERS: MissionAuditFilters = { fromDate: "", toDate: "", action: "", outcome: "", search: "" };
export const AUDIT_PAGE_SIZE = 25;

/** Keys the server may return; anything else is dropped client-side as well. */
export const SAFE_DETAIL_KEYS = [
  "previous_status", "status", "role", "kind", "classification", "expires_in_hours",
  "external_ref_present", "bootstrap_one_time", "creator_operator", "reason", "policy", "outcome",
] as const;

const SECRET_PATTERN = /(code|hash|token|secret|password|email|payload|key)/i;

export function redactDetails(details: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!details || typeof details !== "object" || Array.isArray(details)) return out;
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (!(SAFE_DETAIL_KEYS as readonly string[]).includes(key) || SECRET_PATTERN.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") out[key] = typeof value === "string" ? value.slice(0, 120) : value;
  }
  return out;
}

export function sanitizeAuditPage(raw: unknown): MissionAuditPage {
  const page = (raw ?? {}) as Partial<{ entries: unknown[]; has_more: unknown; actions: unknown[] }>;
  const entries = Array.isArray(page.entries) ? page.entries : [];
  return {
    entries: entries.map((item) => {
      const e = item as Record<string, unknown>;
      const actor = typeof e.actor === "string" && (e.actor === "self" || /^member-[0-9a-f]{8}$/.test(e.actor)) ? e.actor : "member";
      return {
        id: String(e.id ?? ""),
        occurred_at: String(e.occurred_at ?? ""),
        action: String(e.action ?? "unknown"),
        outcome: e.outcome === "refused" ? "refused" : "success",
        target_type: String(e.target_type ?? ""),
        actor,
        actor_role: typeof e.actor_role === "string" ? e.actor_role : null,
        details: redactDetails(e.details),
      } satisfies MissionAuditEntry;
    }),
    has_more: page.has_more === true,
    actions: Array.isArray(page.actions) ? page.actions.filter((a): a is string => typeof a === "string").sort() : [],
    timezone: "UTC",
  };
}

/** Inclusive UTC calendar dates → half-open [from, to+1day) ISO range for the server. */
export function auditDateRange(filters: Pick<MissionAuditFilters, "fromDate" | "toDate">): { from: string | null; to: string | null; error?: string } {
  const valid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
  if (filters.fromDate && !valid(filters.fromDate)) return { from: null, to: null, error: "Invalid start date." };
  if (filters.toDate && !valid(filters.toDate)) return { from: null, to: null, error: "Invalid end date." };
  const from = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00Z`).toISOString() : null;
  const to = filters.toDate ? new Date(new Date(`${filters.toDate}T00:00:00Z`).getTime() + 86_400_000).toISOString() : null;
  if (from && to && from >= to) return { from: null, to: null, error: "The start date must be on or before the end date." };
  return { from, to };
}

export function formatAuditTimestampUtc(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function auditActionLabel(action: string): string {
  return action.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Distinguishes "not deployed yet" from authorization failures. */
export function classifyAuditError(message: string): "unavailable" | "denied" | "error" {
  if (/get_mission_audit_log|could not find the function|schema cache|does not exist/i.test(message)) return "unavailable";
  if (/denied|authentication required|permission/i.test(message)) return "denied";
  return "error";
}
