/**
 * FV-01.4.6 Mission Audit Log — read-only view helpers.
 * The server (get_mission_audit_log) authorizes, scopes and redacts; these helpers add
 * defense-in-depth redaction and UTC filter handling. Nothing here can write audit history.
 */
export type AuditOutcome = "success" | "refused";

export interface MissionAuditEntry {
  /** Opaque per-mission reference (server HMAC). Never the raw audit record ID. */
  ref: string;
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
  next_cursor: string | null;
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

export const EMPTY_AUDIT_FILTERS: MissionAuditFilters = {
  fromDate: "",
  toDate: "",
  action: "",
  outcome: "",
  search: "",
};
export const AUDIT_PAGE_SIZE = 25;

/** Keys the server may return; anything else is dropped client-side as well. */
/** Mirrors the server's enumerated value sets. Free text is never accepted for any key. */
const STATUS = ["planning", "active", "completed", "aborted", "candidate", "inactive"];
export const SAFE_DETAIL_VALUES: Record<string, readonly string[] | "boolean" | "hours"> = {
  status: STATUS,
  previous_status: STATUS,
  role: ["crew_self", "ground_medical", "mission_operator", "researcher"],
  classification: ["synthetic", "deidentified", "mission_sensitive", "medical_sensitive"],
  policy: ["fv01-v1", "p28-v1"],
  reason: [
    "approval_required",
    "approver_cannot_be_recipient",
    "crew_self_binding_conflict",
    "identifier_unavailable",
    "invite_unavailable",
    "inviter_cannot_approve",
    "minimum_cohort_not_met",
    "minimum_event_volume_not_met",
    "mission_not_closed",
    "not_pending",
    "recipient_cannot_approve",
    "recipient_mismatch",
    "recipient_unbound",
    "role_combination_not_permitted",
    "self_issued_invite",
    "self_reactivation",
    "snapshot_unavailable",
    "wrong_recipient",
  ],
  expires_in_hours: "hours",
  external_ref_present: "boolean",
  bootstrap_one_time: "boolean",
  creator_operator: "boolean",
};
export const SAFE_DETAIL_KEYS = Object.keys(SAFE_DETAIL_VALUES);
const IDENTIFIER = /^[a-z][a-z0-9_]{0,63}$/;

export function redactDetails(details: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!details || typeof details !== "object" || Array.isArray(details)) return out;
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    const rule = Object.prototype.hasOwnProperty.call(SAFE_DETAIL_VALUES, key)
      ? SAFE_DETAIL_VALUES[key]
      : undefined;
    if (rule === "boolean") {
      if (typeof value === "boolean") out[key] = value;
    } else if (rule === "hours") {
      if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8760)
        out[key] = value;
    } else if (rule && typeof value === "string" && rule.includes(value)) out[key] = value;
  }
  return out;
}

export function sanitizeAuditPage(raw: unknown): MissionAuditPage {
  const page = (raw ?? {}) as Partial<{
    entries: unknown[];
    has_more: unknown;
    next_cursor: unknown;
    actions: unknown[];
  }>;
  const cursor =
    typeof page.next_cursor === "string" &&
    /^v3\.[A-Za-z0-9_-]{1,300}\.[0-9a-f]{64}$/.test(page.next_cursor)
      ? page.next_cursor
      : null;
  const entries = Array.isArray(page.entries) ? page.entries : [];
  return {
    entries: entries.map((item) => {
      const e = item as Partial<
        Record<
          | "ref"
          | "occurred_at"
          | "action"
          | "outcome"
          | "target_type"
          | "actor"
          | "actor_role"
          | "details",
          unknown
        >
      >;
      const actor =
        typeof e.actor === "string" && (e.actor === "self" || /^member-[0-9a-f]{8}$/.test(e.actor))
          ? e.actor
          : "member";
      return {
        ref: typeof e.ref === "string" && /^[0-9a-f]{32}$/.test(e.ref) ? e.ref : "",
        occurred_at: String(e.occurred_at ?? ""),
        action: typeof e.action === "string" && IDENTIFIER.test(e.action) ? e.action : "other",
        outcome: e.outcome === "refused" ? "refused" : "success",
        target_type:
          typeof e.target_type === "string" && IDENTIFIER.test(e.target_type)
            ? e.target_type
            : "other",
        actor,
        actor_role:
          typeof e.actor_role === "string" &&
          /^(crew_self|ground_medical|mission_operator|researcher)(,(crew_self|ground_medical|mission_operator|researcher))*$/.test(
            e.actor_role,
          )
            ? e.actor_role
            : null,
        details: redactDetails(e.details),
      } satisfies MissionAuditEntry;
    }),
    has_more: page.has_more === true && cursor !== null,
    next_cursor: cursor,
    actions: Array.isArray(page.actions)
      ? page.actions.filter((a): a is string => typeof a === "string" && IDENTIFIER.test(a)).sort()
      : [],
    timezone: "UTC",
  };
}

/** Inclusive UTC calendar dates → half-open [from, to+1day) ISO range for the server. */
export function auditDateRange(filters: Pick<MissionAuditFilters, "fromDate" | "toDate">): {
  from: string | null;
  to: string | null;
  error?: string;
} {
  const valid = (v: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());
  if (filters.fromDate && !valid(filters.fromDate))
    return { from: null, to: null, error: "Invalid start date." };
  if (filters.toDate && !valid(filters.toDate))
    return { from: null, to: null, error: "Invalid end date." };
  const from = filters.fromDate ? new Date(`${filters.fromDate}T00:00:00Z`).toISOString() : null;
  const to = filters.toDate
    ? new Date(new Date(`${filters.toDate}T00:00:00Z`).getTime() + 86_400_000).toISOString()
    : null;
  if (from && to && from >= to)
    return { from: null, to: null, error: "The start date must be on or before the end date." };
  return { from, to };
}

export function formatAuditTimestampUtc(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function auditActionLabel(action: string): string {
  return action.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Distinguishes "not deployed yet" from authorization failures. */
export function classifyAuditError(message: string): "unavailable" | "denied" | "error" {
  if (
    /get_mission_audit_log|could not find the function|schema cache|does not exist/i.test(message)
  )
    return "unavailable";
  if (/invalid cursor/i.test(message)) return "error";
  if (/denied|authentication required|permission/i.test(message)) return "denied";
  return "error";
}
