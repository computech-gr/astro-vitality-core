import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  globalResearchAllows,
  globalResearchSelections,
  parseGlobalResearchScope,
  readGlobalResearchSelection,
  reportScopeAuthorized,
  writeGlobalResearchSelection,
} from "@/domain/mission-access/global-research-scope";
import { pullObservationEventsCore, pushObservationEventsCore, type SyncDeps } from "@/lib/observation-sync.server";
import { runObservationSync } from "@/domain/health-intelligence/observation-sync-runner";
import { obs } from "../domain/fixtures-v9-observations";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => (i * 7 + 3) & 255)).toString("base64");
const ENV: Record<string, string> = { MITO_OBSERVATION_SYNC_ENABLED: "true", MITO_OBSERVATION_SYNC_KEY_V1: KEY, MITO_OBSERVATION_SYNC_REAL_ENABLED: "true" };

const RPC_SCOPE = {
  granted: true,
  provenance: ["synthetic"],
  missions: [
    { mission_id: "M-DEMO", code: "MITO_DEMO_2026", name: "Synthetic Demonstration", status: "planning", crew: [{ crew_member_id: "C-ALEX", display_name: "Alex Morgan", external_ref: "DEMO-ASTRO-001" }] },
    { mission_id: "M-B", code: "FV01-TEST-B", name: "Security Test B", status: "planning", crew: [] },
    { mission_id: "M-FUTURE", code: "FUTURE", name: "Future", status: "planning", crew: [{ crew_member_id: "C-2" }] },
  ],
};

describe("P72.6 global Researcher read scope (pure)", () => {
  const scope = parseGlobalResearchScope(RPC_SCOPE)!;

  it("lists all missions returned by the server, including future ones and missions without crew", () => {
    expect(scope.missions.map((m) => m.code)).toEqual(["MITO_DEMO_2026", "FV01-TEST-B", "FUTURE"]);
    expect(globalResearchSelections(scope).map((s) => s.key)).toEqual(["M-DEMO|C-ALEX", "M-FUTURE|C-2"]);
    expect(globalResearchSelections(scope)[0]!.label).toBe("Synthetic Demonstration — Alex Morgan");
  });

  it("reads MITO_DEMO_2026 / Alex Morgan without membership, synthetic only", () => {
    expect(globalResearchAllows(scope, "M-DEMO", "C-ALEX", "synthetic")).toBe(true);
    expect(globalResearchAllows(scope, "M-DEMO", "C-ALEX", "real")).toBe(false);
    expect(globalResearchAllows(scope, "M-DEMO", "C-OTHER", "synthetic")).toBe(false);
    expect(globalResearchAllows(scope, "M-B", "C-ALEX", "synthetic")).toBe(false);
    expect(globalResearchAllows(null, "M-DEMO", "C-ALEX", "synthetic")).toBe(false);
  });

  it("fails closed on anything other than an explicit synthetic-only grant", () => {
    expect(parseGlobalResearchScope(null)).toBeNull();
    expect(parseGlobalResearchScope({ ...RPC_SCOPE, granted: false })).toBeNull();
    expect(parseGlobalResearchScope({ granted: false, provenance: [], missions: [] })).toBeNull();
    expect(parseGlobalResearchScope({ ...RPC_SCOPE, provenance: ["synthetic", "real"] })).toBeNull();
    expect(parseGlobalResearchScope({ ...RPC_SCOPE, provenance: ["real"] })).toBeNull();
    expect(parseGlobalResearchScope({ ...RPC_SCOPE, missions: [{ code: "x", crew: [] }] })).toBeNull();
    expect(parseGlobalResearchScope({ ...RPC_SCOPE, missions: "all" })).toBeNull();
  });

  it("report export: Researcher read scope authorizes synthetic only; memberships unchanged", () => {
    const researcher = { memberships: [{ missionId: "M-B", role: "researcher" }], globalResearch: scope };
    expect(reportScopeAuthorized(researcher, { missionId: "M-DEMO", crewMemberId: "C-ALEX" }, "synthetic")).toBe(true);
    expect(reportScopeAuthorized(researcher, { missionId: "M-DEMO", crewMemberId: "C-ALEX" }, "real")).toBe(false);
    const astronaut = { memberships: [{ missionId: "M-DEMO", crewMemberId: "C-ALEX", role: "crew_self" }] };
    expect(reportScopeAuthorized(astronaut, { missionId: "M-DEMO", crewMemberId: "C-ALEX" }, "real")).toBe(true);
    expect(reportScopeAuthorized(astronaut, { missionId: "M-FUTURE", crewMemberId: "C-2" }, "synthetic")).toBe(false);
    const gm = { memberships: [{ missionId: "M-DEMO", crewMemberId: "C-ALEX", role: "ground_medical" }] };
    expect(reportScopeAuthorized(gm, { missionId: "M-DEMO", crewMemberId: "C-ALEX" }, "real")).toBe(true);
    expect(reportScopeAuthorized({ memberships: [{ missionId: "M-DEMO", role: "researcher" }] }, { missionId: "M-DEMO", crewMemberId: "C-ALEX" }, "synthetic")).toBe(false);
  });

  it("selection memory stores only a mission|crew pair per account", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    writeGlobalResearchSelection(storage, "u1", "M-DEMO|C-ALEX");
    expect(readGlobalResearchSelection(storage, "u1")).toBe("M-DEMO|C-ALEX");
    expect(readGlobalResearchSelection(storage, "u2")).toBe("");
    writeGlobalResearchSelection(storage, "u1", "not-a-pair");
    expect(readGlobalResearchSelection(storage, "u1")).toBe("");
  });
});

describe("P72.6 server: global Researcher may download, never upload", () => {
  const SCOPE = { missionId: "mission-a", crewMemberId: "crew-a", provenance: "synthetic" as const };
  function deps(globalRead: SyncDeps["globalResearchRead"]) {
    const calls: string[] = [];
    const d: SyncDeps = {
      env: (n) => ENV[n],
      memberships: async () => [{ role: "researcher", crew_member_id: null, active: true }],
      rpc: async (fn) => {
        calls.push(fn);
        return { data: fn === "observation_sync_list_v1" ? [] : null, error: null };
      },
      ...(globalRead ? { globalResearchRead: globalRead } : {}),
    };
    return { d, calls };
  }

  it("downloads a synthetic scope with the server-verified read grant", async () => {
    const { d, calls } = deps(async () => true);
    const r = await pullObservationEventsCore({ scope: SCOPE, afterSeq: 0, limit: 10 }, d);
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["observation_sync_list_v1"]);
  });

  it("is refused without the grant, on error, and for REAL provenance", async () => {
    for (const g of [undefined, async () => false, async () => { throw new Error("boom"); }]) {
      const { d, calls } = deps(g as SyncDeps["globalResearchRead"]);
      const r = await pullObservationEventsCore({ scope: SCOPE, afterSeq: 0, limit: 10 }, d);
      expect(r.ok ? "ok" : r.code).toBe("forbidden");
      expect(calls).toEqual([]);
    }
    let asked = false;
    const { d } = deps(async () => ((asked = true), true));
    const real = await pullObservationEventsCore({ scope: { ...SCOPE, provenance: "real" }, afterSeq: 0, limit: 10 }, d);
    expect(real.ok ? "ok" : real.code).toBe("forbidden");
    expect(asked).toBe(false);
  });

  it("uploads are refused even with the read grant (Medical/crew write paths unchanged)", async () => {
    const { d, calls } = deps(async () => true);
    const r = await pushObservationEventsCore({ scope: SCOPE, events: [{ eventId: "obs-x:entry", eventKind: "entry", observation: obs() }], realDataConfirmed: false }, d);
    expect(r.ok ? "ok" : r.code).toBe("forbidden");
    expect(calls).not.toContain("observation_sync_append_v1");
  });

  it("the read-only run never calls upload even with local records", async () => {
    let pushed = false;
    const o = obs();
    const r = await runObservationSync(
      { scope: SCOPE, canUpload: false, realDataConfirmed: false },
      {
        listLocal: async () => [{ eventId: `${o.id}:entry`, eventKind: "entry", observation: o }],
        listReceipts: async () => [],
        appendReceipts: async () => undefined,
        importEvent: async () => "inserted",
        push: async () => ((pushed = true), { ok: true, results: [] }),
        pull: async () => ({ ok: true, events: [], problems: [], lastSeq: 0, hasMore: false }),
        now: () => "2026-11-15T00:00:00.000Z",
      },
    );
    expect(pushed).toBe(false);
    expect(r.uploaded.inserted).toBe(0);
  });
});

describe("P72.6 wiring", () => {
  it("the all-missions view is download-only and never uploads, attests or corrects", () => {
    const src = read("src/components/mission-access/global-research-access.tsx");
    expect(src).toContain("canUpload: false");
    expect(src).toContain("canPush: false");
    for (const forbidden of ["pushObservationEvents", "pushReviewEvents", "appendAttestationEvents", "saveUnifiedObservation", "markUnifiedObservationErroneous", "saveBoneEntry"])
      expect(src).not.toContain(forbidden);
  });

  it("the identity loader keeps the global scope separate from memberships", () => {
    const src = read("src/infrastructure/mission-identity.ts");
    expect(src).toContain('rpc<unknown>("p726_global_research_scope_v1")');
    expect(src).toContain("...(globalResearch ? { globalResearch } : {})");
    expect(src).not.toMatch(/memberships\s*=.*globalResearch/);
  });

  it("pending SQL widens only read RPCs and creates no memberships", () => {
    const sql = read("supabase/pending/20261115000000_p726_global_researcher_read.sql").replace(/^--.*$/gm, "");
    const replaced = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)/g)].map((m) => m[1]).sort();
    expect(replaced).toEqual(["observation_sync_list_v1", "p37_demo_catalog_snapshot_v1", "p615_demo_alias_snapshot_v1", "review_sync_list_v1"]);
    expect(sql).not.toMatch(/insert into public\.mission_memberships|create policy|disable row level security|to anon/i);
    const auth = read("supabase/pending/20261115000001_p726_global_researcher_read.authorize.sql").replace(/^--.*$/gm, "");
    expect(auth).toMatch(/insert into public\.p726_global_research_readers/);
    expect(auth).not.toMatch(/mission_memberships/);
  });
});
