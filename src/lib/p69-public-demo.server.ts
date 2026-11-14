/**
 * P69/P71 public demo server cores (dependency-injected, testable).
 *
 * Provisioning runs only on the server: the staged SQL admits and binds a
 * fresh, random, never-revealed demo identity to an isolated synthetic
 * workspace. The browser receives only that identity's normal session tokens;
 * no password, service credential or shared account ever leaves the server.
 * Every workspace action afterwards is a caller-scoped RPC executed as the
 * demo user, so role, revision, quota, expiry and isolation checks stay in
 * the database.
 */
import { P69_DEMO_CATALOG } from "@/domain/public-demo/catalog";
import {
  isDemoRole,
  validateExaminationInput,
  type DemoMeasurement,
  type DemoRecord,
  type DemoRole,
  type DemoTransitionAction,
} from "@/domain/public-demo/workflow";
import type { SharedContextReadingInput } from "@/domain/mission-context/shared-context";

export type DemoRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

export type DemoErrorCode =
  | "disabled"
  | "migration_required"
  | "rate_limited"
  | "join_invalid"
  | "quota"
  | "expired"
  | "stale"
  | "invalid_state"
  | "conflict"
  | "forbidden"
  | "invalid"
  | "unavailable";

export type DemoFailure = { ok: false; code: DemoErrorCode; message: string };

const MESSAGES: Record<DemoErrorCode, string> = {
  disabled: "The public live demo is not switched on for this site. Use the offline rehearsal or Standard sign-in.",
  migration_required: "The public live demo database is not installed yet. Use the offline rehearsal.",
  rate_limited: "Too many demo entries from this connection in the last hour. Please try again later.",
  join_invalid: "That demo workspace code was not recognised or has expired.",
  quota: "This demo workspace has reached its limit. Start a new workspace or reset this one.",
  expired: "This demo workspace has expired. Start a new one.",
  stale: "Someone changed this since you loaded it. Refresh and review the latest version.",
  invalid_state: "This step is not available for the record's current status.",
  conflict: "This request was already used for a different change. Refresh and try again.",
  forbidden: "Your demo role is not allowed to do this, or the item is not in your workspace.",
  invalid: "Some details were not accepted.",
  unavailable: "The demo service is temporarily unavailable. Use the offline rehearsal.",
};

export function demoFailure(code: DemoErrorCode, detail?: string): DemoFailure {
  return { ok: false, code, message: detail ? `${MESSAGES[code]} ${detail}` : MESSAGES[code] };
}

export function classifyDemoError(error: { code?: string; message?: string } | null | undefined): DemoFailure {
  const code = error?.code;
  switch (code) {
    case "MDEXP":
      return demoFailure("expired");
    case "MDJIN":
      return demoFailure("join_invalid");
    case "MDRAT":
      return demoFailure("rate_limited");
    case "MDQUO":
      return demoFailure("quota");
    case "MDSTA":
      return demoFailure("stale");
    case "MDSTT":
      return demoFailure("invalid_state");
    case "MDIDM":
      return demoFailure("conflict");
    case "42501":
      return demoFailure("forbidden");
    case "22023":
    case "22P02":
      return demoFailure("invalid", (error?.message ?? "").slice(0, 200) || undefined);
    case "PGRST202":
    case "PGRST205":
    case "42883":
    case "42P01":
      return demoFailure("migration_required");
    default:
      return demoFailure("unavailable");
  }
}

/* ------------------------------ provisioning ------------------------------ */

export interface DemoSessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export interface ProvisionDeps {
  enabled: boolean;
  clientSalt: string | undefined;
  clientAddress: string | null;
  emailDomain: string;
  /** Service-role RPC; only the three server-only provisioning functions. */
  adminRpc: DemoRpc;
  createUser(email: string, password: string, role: DemoRole): Promise<{ id: string } | null>;
  deleteUser(id: string): Promise<void>;
  signIn(email: string, password: string): Promise<DemoSessionTokens | null>;
  randomToken(bytes: number): string;
  sha256Hex(text: string): Promise<string>;
}

export type ProvisionResult =
  | {
      ok: true;
      session: DemoSessionTokens;
      workspace: { role: DemoRole; joinCode: string | null; expiresAt: string; missionCode: string };
    }
  | DemoFailure;

const JOIN_CODE = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

export function normalizeJoinCode(raw: string | null | undefined): string | null | "invalid" {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) return null;
  return JOIN_CODE.test(value) ? value : "invalid";
}

export function isPublicDemoConfigured(enabledFlag: string | undefined, salt: string | undefined): boolean {
  return enabledFlag === "true" && typeof salt === "string" && salt.length >= 32;
}

export async function provisionPublicDemoRole(
  deps: ProvisionDeps,
  input: { role: string; joinCode?: string | null | undefined },
): Promise<ProvisionResult> {
  if (!deps.enabled || !deps.clientSalt || deps.clientSalt.length < 32) return demoFailure("disabled");
  if (!isDemoRole(input.role)) return demoFailure("invalid", "Choose Astronaut, Researcher or Medical.");
  const joinCode = normalizeJoinCode(input.joinCode);
  if (joinCode === "invalid") return demoFailure("join_invalid");
  const clientHash = await deps.sha256Hex(`p69|${deps.clientSalt}|${deps.clientAddress ?? "unknown"}`);

  // Opportunistic cleanup of identities from long-expired workspaces.
  const expired = await deps.adminRpc("p69_demo_claim_expired_v1", { p_limit: 5 });
  if (!expired.error && Array.isArray(expired.data)) {
    for (const id of expired.data) if (typeof id === "string") await deps.deleteUser(id).catch(() => undefined);
  }

  const admitted = await deps.adminRpc("p69_demo_admit_v1", { p_client_hash: clientHash });
  if (admitted.error || typeof admitted.data !== "string") return classifyDemoError(admitted.error);

  const email = `visitor-${deps.randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, "")}@${deps.emailDomain}`;
  const password = deps.randomToken(32);
  let userId: string | null = null;
  try {
    const user = await deps.createUser(email, password, input.role);
    if (!user) return demoFailure("unavailable");
    userId = user.id;
    // Sign in BEFORE binding the identity to a workspace: a sign-in failure then
    // never consumes a workspace member slot or leaves a bound, unusable identity.
    const session = await deps.signIn(email, password);
    if (!session) {
      await discardIdentity(deps, userId);
      return demoFailure("unavailable");
    }
    const provisioned = await deps.adminRpc("p69_demo_provision_v1", {
      p_admission_id: admitted.data,
      p_user_id: userId,
      p_role: input.role,
      p_join_code: joinCode,
    });
    if (provisioned.error || !provisioned.data || typeof provisioned.data !== "object") {
      await discardIdentity(deps, userId);
      return classifyDemoError(provisioned.error);
    }
    const ws = provisioned.data as Record<string, unknown>;
    return {
      ok: true,
      session,
      workspace: {
        role: input.role,
        joinCode: typeof ws["joinCode"] === "string" ? ws["joinCode"] : null,
        expiresAt: String(ws["expiresAt"] ?? ""),
        missionCode: String(ws["missionCode"] ?? ""),
      },
    };
  } catch {
    // Any thrown failure after the identity exists (network, auth service) removes it.
    if (userId) await discardIdentity(deps, userId);
    return demoFailure("unavailable");
  }
}

async function discardIdentity(deps: ProvisionDeps, id: string): Promise<void> {
  await deps.deleteUser(id).catch(() => undefined);
}

/* ------------------------------ client address ----------------------------- */

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/;

/**
 * Rate-limit address for demo admission. Only Cloudflare's `cf-connecting-ip`
 * is trusted: the edge overwrites any client-supplied value. `x-forwarded-for`
 * and similar headers are client-controlled and ignored, so they cannot mint
 * fresh rate-limit buckets. IPv6 is bucketed per /64 (one subscriber prefix).
 * A missing or malformed value returns null, which shares one "unknown" bucket
 * (fail-closed: header-less callers cannot multiply their allowance).
 */
export function demoClientAddress(headers: { get(name: string): string | null } | null | undefined): string | null {
  const raw = headers?.get("cf-connecting-ip")?.trim().toLowerCase() ?? "";
  if (!raw || raw.length > 45) return null;
  if (IPV4.test(raw)) return raw;
  if (!IPV6.test(raw) || !raw.includes(":") || (raw.match(/::/g)?.length ?? 0) > 1) return null;
  const [head = "", tail] = raw.split("::");
  const left = head ? head.split(":") : [];
  const right = tail === undefined ? [] : tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (tail === undefined ? left.length !== 8 : missing < 1) return null;
  const groups = [...left, ...Array<string>(tail === undefined ? 0 : missing).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/* ----------------------------- workspace reads ---------------------------- */

export interface DemoWorkspaceSession {
  workspaceId: string;
  role: DemoRole;
  missionCode: string;
  crewSubjectId: string;
  crewSubjectName: string;
  provenance: "synthetic";
  seedVersion: string;
  epoch: number;
  maxEpoch: number;
  workspaceRevision: number;
  expiresAt: string;
  members: Record<DemoRole, number>;
  history: { action: string; actorRole: string; fromEpoch: number | null; toEpoch: number; workspaceRevision: number; recordedAt: string }[];
}

export type WorkspaceResult =
  | { ok: true; session: DemoWorkspaceSession; records: DemoRecord[]; context: SharedContextReadingInput[] }
  | DemoFailure;

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function parseSession(v: unknown): DemoWorkspaceSession | null {
  if (!isRecord(v) || !isDemoRole(v["role"]) || v["provenance"] !== "synthetic") return null;
  const members = isRecord(v["members"]) ? v["members"] : {};
  return {
    workspaceId: String(v["workspaceId"]),
    role: v["role"],
    missionCode: String(v["missionCode"]),
    crewSubjectId: String(v["crewSubjectId"]),
    crewSubjectName: String(v["crewSubjectName"]),
    provenance: "synthetic",
    seedVersion: String(v["seedVersion"]),
    epoch: Number(v["epoch"]),
    maxEpoch: Number(v["maxEpoch"]),
    workspaceRevision: Number(v["workspaceRevision"]),
    expiresAt: String(v["expiresAt"]),
    members: { astronaut: Number(members["astronaut"] ?? 0), researcher: Number(members["researcher"] ?? 0), medical: Number(members["medical"] ?? 0) },
    history: Array.isArray(v["history"]) ? (v["history"] as DemoWorkspaceSession["history"]) : [],
  };
}

function parseRecords(v: unknown): DemoRecord[] | null {
  if (!Array.isArray(v)) return null;
  const out: DemoRecord[] = [];
  for (const r of v) {
    if (!isRecord(r) || r["provenance"] !== "synthetic" || !Array.isArray(r["events"]) || !Array.isArray(r["measurements"])) return null;
    out.push({
      id: String(r["id"]),
      recordRef: String(r["recordRef"]),
      epoch: Number(r["epoch"]),
      crewSubjectId: String(r["crewSubjectId"]),
      observedOn: String(r["observedOn"]),
      submittedRole: r["submittedRole"] as DemoRecord["submittedRole"],
      sourceQuality: r["sourceQuality"] as DemoRecord["sourceQuality"],
      sourceLabel: String(r["sourceLabel"]),
      provenance: "synthetic",
      measurements: (r["measurements"] as DemoMeasurement[]).map((m) => ({ metricId: String(m.metricId), value: String(m.value), unit: String(m.unit) })),
      measurementsSha256: String(r["measurementsSha256"]),
      state: r["state"] as DemoRecord["state"],
      revision: Number(r["revision"]),
      createdAt: String(r["createdAt"]),
      events: (r["events"] as DemoRecord["events"]).map((e) => ({ ...e, redacted: Boolean(e.redacted) })),
    });
  }
  return out;
}

function parseContext(v: unknown): SharedContextReadingInput[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter(isRecord).map((c) => ({
    id: String(c["id"]),
    parameterId: String(c["parameterId"]),
    value: c["value"] === null || c["value"] === undefined ? null : Number(c["value"]),
    unit: String(c["unit"]),
    observedAt: String(c["observedAt"]),
    sourceId: String(c["sourceId"]),
    sourceLabel: String(c["sourceLabel"] ?? ""),
    quality: String(c["quality"]) as SharedContextReadingInput["quality"],
    simulated: c["simulated"] === true,
    availability: c["availability"] === "unavailable" ? "unavailable" : "available",
    measurementSite: typeof c["measurementSite"] === "string" ? c["measurementSite"] : null,
    measurementMethod: typeof c["measurementMethod"] === "string" ? c["measurementMethod"] : null,
  }));
}

export async function loadDemoWorkspace(rpc: DemoRpc): Promise<WorkspaceResult> {
  const session = await rpc("p69_demo_session_v1", {});
  if (session.error) return classifyDemoError(session.error);
  const parsed = parseSession(session.data);
  if (!parsed) return demoFailure("unavailable");
  const [records, context] = await Promise.all([rpc("p69_demo_records_v1", {}), rpc("p69_demo_context_v1", {})]);
  if (records.error) return classifyDemoError(records.error);
  if (context.error) return classifyDemoError(context.error);
  const r = parseRecords(records.data);
  const c = parseContext(context.data);
  if (!r || !c) return demoFailure("unavailable");
  return { ok: true, session: parsed, records: r, context: c };
}

/* ----------------------------- workspace writes --------------------------- */

const KEY = /^[A-Za-z0-9_-]{16,128}$/;
export type MutationResult = { ok: true; data: Record<string, string | number | boolean | null> } | DemoFailure;

async function call(rpc: DemoRpc, fn: string, args: Record<string, unknown>): Promise<MutationResult> {
  const { data, error } = await rpc(fn, args);
  if (error) return classifyDemoError(error);
  if (!isRecord(data)) return demoFailure("unavailable");
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(data))
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  return { ok: true, data: out };
}

export async function submitDemoExamination(
  rpc: DemoRpc,
  input: { observedOn: string; sourceQuality: string; measurements: DemoMeasurement[]; idempotencyKey: string },
  today: string,
): Promise<MutationResult> {
  if (!KEY.test(input.idempotencyKey)) return demoFailure("invalid");
  const valid = validateExaminationInput(input, today);
  if (!valid.ok) return demoFailure("invalid", valid.issues.join(" "));
  const known = new Set(P69_DEMO_CATALOG.map((c) => c.metricId));
  const measurements = input.measurements
    .filter((m) => known.has(m.metricId))
    .map((m) => ({ metricId: m.metricId, value: m.value.trim(), unit: m.unit }));
  return call(rpc, "p69_demo_submit_examination_v1", {
    p_observed_on: input.observedOn,
    p_measurements: measurements,
    p_source_quality: input.sourceQuality,
    p_idempotency_key: input.idempotencyKey,
  });
}

export async function transitionDemoRecord(
  rpc: DemoRpc,
  input: { recordId: string; action: DemoTransitionAction; outcome: string; note: string; expectedRevision: number; idempotencyKey: string },
): Promise<MutationResult> {
  if (!KEY.test(input.idempotencyKey)) return demoFailure("invalid");
  return call(rpc, "p69_demo_transition_v1", {
    p_record_id: input.recordId,
    p_action: input.action,
    p_outcome: input.outcome,
    p_note: input.note,
    p_expected_revision: input.expectedRevision,
    p_idempotency_key: input.idempotencyKey,
  });
}

export function resetDemoWorkspace(rpc: DemoRpc, expectedRevision: number): Promise<MutationResult> {
  return call(rpc, "p69_demo_reset_v1", { p_expected_revision: expectedRevision });
}

export function restoreDemoWorkspace(rpc: DemoRpc, epoch: number, expectedRevision: number): Promise<MutationResult> {
  return call(rpc, "p69_demo_restore_v1", { p_epoch: epoch, p_expected_revision: expectedRevision });
}
