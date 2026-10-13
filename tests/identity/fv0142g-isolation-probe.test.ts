import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

import { classifyProbe, outcomeMatchesExpectation, FV0142G_EXPECTED } from "@/components/diagnostics/fv0142g-isolation-probe";

const probe = readFileSync("src/components/diagnostics/fv0142g-isolation-probe.tsx", "utf8");
const route = readFileSync("src/routes/diag.fv0142g-isolation.tsx", "utf8");

describe("FV-01.4.2G temporary isolation probe guardrails", () => {
  test("uses only the browser session client, never privileged access", () => {
    expect(probe).toContain('from "@/integrations/supabase/client"');
    for (const banned of ["client.server", "supabaseAdmin", "service_role", "SERVICE_ROLE", "sandbox_exec", ".rpc(", "createServerFn"]) {
      expect(probe).not.toContain(banned);
      expect(route).not.toContain(banned);
    }
    expect(probe).toContain("supabase.auth.getUser()");
  });

  test("performs count-only HEAD reads and no mutations", () => {
    expect(probe).toContain('count: "exact", head: true');
    for (const banned of [".insert(", ".update(", ".upsert(", ".delete("]) expect(probe).not.toContain(banned);
  });

  test("never runs automatically", () => {
    expect(probe).not.toContain("useEffect");
    expect(probe).toContain("onClick={() => void run()}");
  });

  test("errors and missing counts never count as a match", () => {
    expect(classifyProbe("audit_events", 0, { message: "denied" })).toEqual({ table: "audit_events", kind: "ERROR" });
    expect(classifyProbe("audit_events", null, null)).toEqual({ table: "audit_events", kind: "UNSUPPORTED" });
    expect(outcomeMatchesExpectation(classifyProbe("audit_events", 0, { message: "x" }))).toBe(false);
    expect(outcomeMatchesExpectation(classifyProbe("audit_events", null, null))).toBe(false);
    expect(outcomeMatchesExpectation(classifyProbe("audit_events", 0, null))).toBe(true);
    expect(outcomeMatchesExpectation(classifyProbe("missions", 2, null))).toBe(false);
    expect(FV0142G_EXPECTED).toEqual({ missions: 1, mission_memberships: 1, crew_members: 1, mission_events: 0, audit_events: 0 });
  });

  test("does not render raw errors or identifiers", () => {
    expect(probe).not.toContain("error.message");
    expect(probe).not.toContain("readError.message");
    expect(probe).not.toContain("user.email");
    expect(probe).not.toContain("user.id");
    expect(probe).not.toContain("access_token");
  });

  test("route is absent from ordinary navigation and other components", () => {
    const files = readdirSync("src/components", { recursive: true }).map(String).filter((f) => /\.(tsx?|ts)$/.test(f) && !f.includes("diagnostics"));
    for (const file of files) expect(readFileSync(`src/components/${file}`, "utf8")).not.toContain("fv0142g");
    expect(route).toContain("noindex");
  });
});
