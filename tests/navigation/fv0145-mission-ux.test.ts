import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { MISSION_WORKFLOWS, workflowsForRole } from "../../src/domain/mission-experience/workflows";
import { orderConsoleMemberships } from "../../src/domain/mission-access/role-compatibility";
import ledger from "../../data/validation/p34-real-device-acceptance.v1.json";
import type { MissionMembershipContext } from "../../src/infrastructure/mission-identity";

const routeFile = (path: string) => `src/routes/${path.replace(/^\//, "").replaceAll("/", ".")}.tsx`;
const has = (role: Parameters<typeof workflowsForRole>[0], id: string) => workflowsForRole(role).some((w) => w.id === id);

describe("FV-01.4.5 role-aware mission workspace", () => {
  it("shows Ground & Research only to Ground Medical and Researcher", () => {
    expect(has("ground_medical", "ground")).toBe(true);
    expect(has("researcher", "ground")).toBe(true);
    expect(has("mission_operator", "ground")).toBe(false);
    expect(has("crew_self", "ground")).toBe(false);
  });
  it("keeps operator-only crew administration", () => {
    expect(has("mission_operator", "operations")).toBe(true);
    for (const r of ["crew_self", "ground_medical", "researcher"] as const) expect(has(r, "operations")).toBe(false);
  });
  it("multi-role user regains access when selecting an authorized membership", () => {
    const base = { missionId: "m1", missionCode: "M1" };
    const memberships: MissionMembershipContext[] = [{ ...base, role: "mission_operator" }, { ...base, role: "researcher" }];
    expect(workflowsForRole(memberships[0]!.role).some((w) => w.id === "ground")).toBe(false);
    expect(workflowsForRole(memberships[1]!.role).some((w) => w.id === "ground")).toBe(true);
    expect(orderConsoleMemberships(memberships).map((m) => m.role)).toEqual(["researcher"]);
  });
  it("every workflow points to a registered route", () => {
    for (const w of MISSION_WORKFLOWS) expect(existsSync(routeFile(w.href))).toBe(true);
  });
  it("every P34 acceptance route is registered; SCIENCE-01 uses Health Intelligence", () => {
    for (const c of ledger.cases) expect(existsSync(routeFile(c.route))).toBe(true);
    expect(ledger.cases.find((c) => c.id === "SCIENCE-01")?.route).toBe("/mission/intelligence");
  });
  it("FV-01.4.3 docs reference the registered console route and record deployment", () => {
    const doc = readFileSync("docs/FV01_4_3_MULTIROLE_HARDENING.md", "utf8");
    expect(doc).not.toContain("/project/ground-research");
    expect(doc).toContain("APPLIED and PUBLISHED");
    expect(doc).toContain("FV-01-13 remains OPEN");
  });
  it("applied migration 12 remains byte-identical", async () => {
    const buf = readFileSync("supabase/migrations/20261015000000_fv0143_multirole_hardening.sql");
    const hash = new Bun.CryptoHasher("sha256").update(buf).digest("hex");
    expect(hash).toBe("4103442ad4cfad19daf747c3ebe2f3920a4d8e72761805bc9a8d24a408b6eb5f");
  });
});
