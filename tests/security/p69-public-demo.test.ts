import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildP69SeedDocument } from "@/domain/public-demo/catalog";
import {
  classifyDemoError,
  isPublicDemoConfigured,
  normalizeJoinCode,
  provisionPublicDemoRole,
  type DemoRpc,
  type ProvisionDeps,
} from "@/lib/p69-public-demo.server";
import { parseStoredDemoWorkspace } from "@/domain/public-demo/session-storage";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const SQL_PATH = "supabase/pending/20261114000000_p69_public_demo_workspaces.sql";
const sql = read(SQL_PATH);
const SALT = "s".repeat(40);

function deps(over: Partial<ProvisionDeps> = {}, rpcImpl?: DemoRpc) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const deleted: string[] = [];
  const created: { email: string; password: string }[] = [];
  const rpc: DemoRpc = async (fn, args) => {
    calls.push({ fn, args });
    if (rpcImpl) return rpcImpl(fn, args);
    if (fn === "p69_demo_claim_expired_v1") return { data: [], error: null };
    if (fn === "p69_demo_admit_v1") return { data: "adm-1", error: null };
    return { data: { workspaceId: "w", joinCode: "ABCD-1234-EF56", expiresAt: "2026-11-15T00:00:00Z", missionCode: "NASA-DEMO-304-001" }, error: null };
  };
  const d: ProvisionDeps = {
    enabled: true,
    clientSalt: SALT,
    clientAddress: "203.0.113.9",
    emailDomain: "demo.example.test",
    adminRpc: rpc,
    async createUser(email, password) {
      created.push({ email, password });
      return { id: "user-1" };
    },
    async deleteUser(id) {
      deleted.push(id);
    },
    async signIn() {
      return { accessToken: "at", refreshToken: "rt", expiresAt: 1 };
    },
    randomToken: (n) => "R".repeat(n),
    sha256Hex: async (t) => (t.includes(SALT) ? "h".repeat(64) : "x"),
    ...over,
  };
  return { d, calls, deleted, created };
}

describe("P69 public demo provisioning (server core)", () => {
  test("default-off: disabled flag or missing salt never touches the database", async () => {
    const { d, calls } = deps({ enabled: false });
    expect(await provisionPublicDemoRole(d, { role: "astronaut" })).toMatchObject({ ok: false, code: "disabled" });
    const short = deps({ clientSalt: "short" });
    expect(await provisionPublicDemoRole(short.d, { role: "astronaut" })).toMatchObject({ ok: false, code: "disabled" });
    expect(calls.length + short.calls.length).toBe(0);
    expect(isPublicDemoConfigured("true", SALT)).toBe(true);
    expect(isPublicDemoConfigured("TRUE", SALT)).toBe(false);
    expect(isPublicDemoConfigured("true", undefined)).toBe(false);
  });

  test("success returns only session tokens and workspace facts — never the password", async () => {
    const { d, calls, created } = deps();
    const result = await provisionPublicDemoRole(d, { role: "medical" });
    expect(result).toEqual({
      ok: true,
      session: { accessToken: "at", refreshToken: "rt", expiresAt: 1 },
      workspace: { role: "medical", joinCode: "ABCD-1234-EF56", expiresAt: "2026-11-15T00:00:00Z", missionCode: "NASA-DEMO-304-001" },
    });
    expect(JSON.stringify(result)).not.toContain(created[0]!.password);
    expect(calls.map((c) => c.fn)).toEqual(["p69_demo_claim_expired_v1", "p69_demo_admit_v1", "p69_demo_provision_v1"]);
    expect(calls[1]!.args).toEqual({ p_client_hash: "h".repeat(64) });
    expect(created[0]!.email).toMatch(/^visitor-[a-z0-9]+@demo\.example\.test$/);
  });

  test("rate limit stops before any identity is created", async () => {
    const { d, created } = deps({}, async (fn) =>
      fn === "p69_demo_admit_v1" ? { data: null, error: { code: "MDRAT" } } : { data: [], error: null },
    );
    expect(await provisionPublicDemoRole(d, { role: "astronaut" })).toMatchObject({ ok: false, code: "rate_limited" });
    expect(created.length).toBe(0);
  });

  test("a rejected join deletes the just-created identity", async () => {
    const { d, deleted } = deps({}, async (fn) =>
      fn === "p69_demo_admit_v1" ? { data: "adm", error: null } : fn === "p69_demo_provision_v1" ? { data: null, error: { code: "MDJIN" } } : { data: [], error: null },
    );
    expect(await provisionPublicDemoRole(d, { role: "researcher", joinCode: "abcd-1234-ef56" })).toMatchObject({ ok: false, code: "join_invalid" });
    expect(deleted).toEqual(["user-1"]);
  });

  test("invalid role and malformed codes are rejected locally", async () => {
    const { d, calls } = deps();
    expect(await provisionPublicDemoRole(d, { role: "mission_operator" })).toMatchObject({ ok: false, code: "invalid" });
    expect(await provisionPublicDemoRole(d, { role: "astronaut", joinCode: "nope" })).toMatchObject({ ok: false, code: "join_invalid" });
    expect(calls.length).toBe(0);
    expect(normalizeJoinCode(" abcd-1234-ef56 ")).toBe("ABCD-1234-EF56");
    expect(normalizeJoinCode("")).toBe(null);
  });

  test("expired identities claimed by the database are deleted", async () => {
    const { d, deleted } = deps({}, async (fn) =>
      fn === "p69_demo_claim_expired_v1" ? { data: ["old-1", "old-2"], error: null } : fn === "p69_demo_admit_v1" ? { data: "a", error: null } : { data: { joinCode: null, expiresAt: "x", missionCode: "m" }, error: null },
    );
    await provisionPublicDemoRole(d, { role: "astronaut" });
    expect(deleted).toEqual(["old-1", "old-2"]);
  });

  test("database errors map to fixed, non-sensitive messages", () => {
    expect(classifyDemoError({ code: "MDSTA" }).code).toBe("stale");
    expect(classifyDemoError({ code: "MDSTT" }).code).toBe("invalid_state");
    expect(classifyDemoError({ code: "42501" }).code).toBe("forbidden");
    expect(classifyDemoError({ code: "PGRST202" }).code).toBe("migration_required");
    expect(classifyDemoError({ code: "XX000", message: "secret internals" }).message).not.toContain("secret");
  });
});

describe("P69 staged SQL and boundaries (static)", () => {
  test("staged only in supabase/pending, never in applied migrations", () => {
    expect(existsSync(join(root, SQL_PATH))).toBe(true);
    expect(readdirSync(join(root, "supabase/migrations")).some((f) => f.includes("p69"))).toBe(false);
  });

  test("SQL seed equals the browser-safe seed document exactly", () => {
    const m = sql.match(/\$seed\$(.*?)\$seed\$/s);
    expect(m).not.toBeNull();
    expect(JSON.parse(m![1]!)).toEqual(buildP69SeedDocument());
  });

  test("provisioning RPCs are service_role-only; browser RPCs caller-scoped", () => {
    for (const fn of ["p69_demo_admit_v1(text)", "p69_demo_provision_v1(uuid, uuid, text, text)", "p69_demo_claim_expired_v1(integer)"]) {
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
      expect(sql).not.toContain(`grant execute on function public.${fn} to authenticated`);
    }
    expect(sql).not.toMatch(/to anon/);
    expect(sql).toContain("from public, anon, authenticated, service_role;");
    const definers = sql.match(/security definer/g)?.length ?? 0;
    const pinned = sql.match(/security definer set search_path = ''/g)?.length ?? 0;
    expect(definers).toBe(pinned);
  });

  test("never references real mission, crew, membership, sync or catalog tables", () => {
    for (const t of ["public.missions", "public.crew_members", "public.mission_memberships", "public.mission_events", "observation_sync", "p37_", "p36_", "p615_"]) {
      expect(sql).not.toContain(t);
    }
  });

  test("append-only triggers and synthetic provenance are enforced", () => {
    expect(sql).toContain("before update or delete on public.%I for each row execute function public.p69_demo_reject_mutation()");
    expect(sql).toContain("before truncate on public.%I");
    expect(sql).toContain("check (provenance = 'synthetic')");
    expect(sql).toContain("check (simulated)");
  });

  test("browser code never carries privileged credentials or passwords", () => {
    const files = ["src/components/public-demo", "src/domain/public-demo", "src/components/shared-mission-context-panel.tsx"];
    const all: string[] = [];
    const walk = (p: string) => {
      const abs = join(root, p);
      if (statSync(abs).isDirectory()) for (const f of readdirSync(abs)) walk(join(p, f));
      else if (/\.tsx?$/.test(p)) all.push(read(p));
    };
    files.forEach(walk);
    const text = all.join("\n");
    expect(text).not.toMatch(/service_role|SERVICE_ROLE|client\.server|signInWithPassword|password\s*[:=]\s*["']/);
    const fns = read("src/lib/p69-public-demo.functions.ts");
    expect(fns.indexOf('await import("@/integrations/supabase/client.server")')).toBeGreaterThan(fns.indexOf("isPublicDemoConfigured(enabledFlag, salt)"));
    expect(fns).not.toMatch(/^import .*client\.server/m);
    expect(fns.match(/requireSupabaseAuth\]/g)?.length).toBe(5);
  });

  test("tab storage holds only the synthetic join code, role and expiry", () => {
    expect(parseStoredDemoWorkspace(JSON.stringify({ joinCode: "ABCD-1234-EF56", role: "medical", expiresAt: "x" }))).not.toBeNull();
    expect(parseStoredDemoWorkspace(JSON.stringify({ joinCode: "ABCD-1234-EF56", role: "medical", expiresAt: "x", note: "hr 62" }))).toBeNull();
    expect(parseStoredDemoWorkspace(JSON.stringify({ joinCode: "x", role: "medical", expiresAt: "x" }))).toBeNull();
  });
});
