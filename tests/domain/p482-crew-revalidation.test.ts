import { describe, expect, it } from "bun:test";
import {
  allowedCrewScopes,
  createCrewEvidenceController,
  CREW_STATUS,
  resolveAuthorization,
  restoreTrendSelection,
  type CrewEvidenceResult,
  type CrewMissionContext,
  type CrewPhase,
  type CrewScope,
} from "@/domain/companion/crew-revalidation";
import type { ScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";

const A = { missionId: "m1", crewMemberId: "crew-a" };
const B = { missionId: "m1", crewMemberId: "crew-b" };
const member = (s: CrewScope, role = "crew_self") => ({ ...s, role });
const ctx = (
  memberships: CrewMissionContext["memberships"],
  extra: Partial<CrewMissionContext> = {},
): CrewMissionContext => ({ signedIn: true, userId: "u1", memberships, ...extra });

const report = (s: CrewScope, value = 70, source = "dev-1"): ScientificEvidenceReport =>
  ({
    mission: s,
    generatedAt: "2026-10-31T00:00:00Z",
    observations: [
      {
        id: `${s.crewMemberId}-${value}`,
        missionId: s.missionId,
        crewMemberId: s.crewMemberId,
        metricCode: "hr",
        unit: "bpm",
        value,
        observedAt: "2026-10-30T00:00:00Z",
        quality: "good",
        sourceId: source,
      },
    ],
    metrics: [{ metricCode: "hr", unit: "bpm" }],
    patterns: [],
    warnings: [],
  }) as unknown as ScientificEvidenceReport;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

function harness() {
  const contexts: ReturnType<typeof deferred<CrewMissionContext>>[] = [];
  const evidence: Array<{ scope: CrewScope; d: ReturnType<typeof deferred<CrewEvidenceResult>> }> =
    [];
  const state = {
    phase: "checking" as CrewPhase,
    status: "",
    scopes: [] as CrewScope[],
    selected: "",
    report: null as ScientificEvidenceReport | null,
    preserve: false,
    log: [] as string[],
  };
  const controller = createCrewEvidenceController({
    role: "crew_self",
    loadContext: () => {
      const d = deferred<CrewMissionContext>();
      contexts.push(d);
      return d.promise;
    },
    loadEvidence: (missionId, crewMemberId) => {
      const d = deferred<CrewEvidenceResult>();
      evidence.push({ scope: { missionId, crewMemberId }, d });
      return d.promise;
    },
    sink: {
      setPhase: (p, s) => {
        state.phase = p;
        state.status = s;
        state.log.push(p);
      },
      setScopes: (scopes, key) => {
        state.scopes = scopes;
        state.selected = key;
      },
      setReport: (r, preserve) => {
        state.report = r;
        state.preserve = preserve;
      },
    },
  });
  return { controller, contexts, evidence, state };
}

async function authorizeA(h: ReturnType<typeof harness>) {
  void h.controller.revalidate("initial");
  h.contexts.at(-1)!.resolve(ctx([member(A)]));
  await flush();
  h.evidence.at(-1)!.d.resolve({ report: report(A) });
  await flush();
}

describe("P48.2 scope resolution", () => {
  it("keeps only crew_self memberships with a crew member id", () => {
    expect(
      allowedCrewScopes([member(A), member(B, "mission_operator"), { missionId: "m2", role: "crew_self" }]),
    ).toEqual([A]);
  });
  it("restores a still-authorized previous scope and flags revocation otherwise", () => {
    expect(resolveAuthorization(ctx([member(A), member(B)]), "m1|crew-b")).toMatchObject({
      kind: "authorized",
      selected: "m1|crew-b",
      sameScope: true,
    });
    expect(resolveAuthorization(ctx([member(B)]), "m1|crew-a")).toMatchObject({ kind: "revoked" });
    expect(resolveAuthorization(ctx([]), "m1|crew-a")).toEqual({
      kind: "none",
      status: CREW_STATUS.unauthorized,
    });
  });
  it("treats a context error as failure, never as cached authorization", () => {
    expect(resolveAuthorization(ctx([member(A)], { error: "offline" }), "m1|crew-a").kind).toBe(
      "error",
    );
  });
  it("restores filters only when still valid in the fresh report", () => {
    const r = report(A, 70, "dev-1");
    expect(restoreTrendSelection(r, { metric: "hr|bpm", window: "7", source: "dev-1" })).toEqual({
      metric: "hr|bpm",
      window: "7",
      source: "dev-1",
    });
    expect(restoreTrendSelection(r, { metric: "hr|bpm", window: "30", source: "gone" })).toEqual({
      metric: "hr|bpm",
      window: "30",
      source: "all",
    });
    expect(restoreTrendSelection(r, { metric: "x|y", window: "7", source: "dev-1" })).toEqual({
      metric: "hr|bpm",
      window: "all",
      source: "all",
    });
  });
});

describe("P48.2 focused revalidation controller", () => {
  it("authorized return hides evidence before the request, then reloads the same scope", async () => {
    const h = harness();
    await authorizeA(h);
    expect(h.state.report?.mission).toEqual(A);
    h.controller.suspend();
    expect(h.state.report).toBeNull();
    expect(h.state.phase).toBe("hidden");
    void h.controller.revalidate("return");
    expect(h.state.report).toBeNull(); // synchronously hidden before any async result
    expect(h.state.phase).toBe("checking");
    h.contexts.at(-1)!.resolve(ctx([member(A)]));
    await flush();
    h.evidence.at(-1)!.d.resolve({ report: report(A, 72) });
    await flush();
    expect(h.state.phase).toBe("ready");
    expect(h.state.preserve).toBe(true);
    expect(h.state.report?.observations[0]?.value).toBe(72);
  });

  it("revocation while hidden clears scope and requests no evidence", async () => {
    const h = harness();
    await authorizeA(h);
    const evidenceCalls = h.evidence.length;
    h.controller.suspend();
    void h.controller.revalidate("return");
    h.contexts.at(-1)!.resolve(ctx([]));
    await flush();
    expect(h.state.phase).toBe("none");
    expect(h.state.status).toBe(CREW_STATUS.unauthorized);
    expect(h.state.report).toBeNull();
    expect(h.state.selected).toBe("");
    expect(h.evidence.length).toBe(evidenceCalls);
  });

  it("revoking only the shown scope clears it and waits for an explicit choice", async () => {
    const h = harness();
    await authorizeA(h);
    const evidenceCalls = h.evidence.length;
    h.controller.suspend();
    void h.controller.revalidate("return");
    h.contexts.at(-1)!.resolve(ctx([member(B)]));
    await flush();
    expect(h.state.phase).toBe("revoked");
    expect(h.state.status).toBe(CREW_STATUS.revoked);
    expect(h.state.selected).toBe("");
    expect(h.state.scopes).toEqual([B]);
    expect(h.state.report).toBeNull();
    expect(h.evidence.length).toBe(evidenceCalls);
  });

  it("a stale evidence response never repopulates after revocation", async () => {
    const h = harness();
    void h.controller.revalidate("initial");
    h.contexts[0]!.resolve(ctx([member(A)]));
    await flush();
    const slowA = h.evidence[0]!.d; // still in flight
    h.controller.suspend();
    void h.controller.revalidate("return");
    h.contexts[1]!.resolve(ctx([]));
    await flush();
    slowA.resolve({ report: report(A, 99) });
    await flush();
    expect(h.state.report).toBeNull();
    expect(h.state.phase).toBe("none");
  });

  it("a stale mission context response is ignored after a newer revalidation", async () => {
    const h = harness();
    void h.controller.revalidate("initial");
    void h.controller.revalidate("return");
    h.contexts[1]!.resolve(ctx([]));
    await flush();
    h.contexts[0]!.resolve(ctx([member(A)])); // late, older authorization
    await flush();
    expect(h.evidence.length).toBe(0);
    expect(h.state.phase).toBe("none");
  });

  it("rapid A/B switching with delayed responses never shows the wrong crew", async () => {
    const h = harness();
    void h.controller.revalidate("initial");
    h.contexts[0]!.resolve(ctx([member(A), member(B)]));
    await flush();
    void h.controller.select("m1|crew-b");
    void h.controller.select("m1|crew-a");
    const [first, second, third] = h.evidence;
    third!.d.resolve({ report: report(A, 70) });
    await flush();
    second!.d.resolve({ report: report(B, 55) });
    first!.d.resolve({ report: report(A, 1) });
    await flush();
    expect(h.state.selected).toBe("m1|crew-a");
    expect(h.state.report?.mission).toEqual(A);
    expect(h.state.report?.observations[0]?.value).toBe(70);
    expect(h.state.preserve).toBe(false);
  });

  it("rejects an evidence report whose scope does not match the request", async () => {
    const h = harness();
    void h.controller.revalidate("initial");
    h.contexts[0]!.resolve(ctx([member(A)]));
    await flush();
    h.evidence[0]!.d.resolve({ report: report(B) });
    await flush();
    expect(h.state.report).toBeNull();
    expect(h.state.phase).toBe("error");
  });

  it("network failures keep private data hidden and allow an explicit retry", async () => {
    const h = harness();
    await authorizeA(h);
    h.controller.suspend();
    void h.controller.revalidate("return");
    h.contexts.at(-1)!.reject(new Error("offline"));
    await flush();
    expect(h.state.phase).toBe("error");
    expect(h.state.status).toBe(CREW_STATUS.authError);
    expect(h.state.report).toBeNull();

    void h.controller.revalidate("retry");
    h.contexts.at(-1)!.resolve(ctx([member(A)], { error: "fetch failed" }));
    await flush();
    expect(h.state.phase).toBe("error");

    void h.controller.revalidate("retry");
    h.contexts.at(-1)!.resolve(ctx([member(A)]));
    await flush();
    h.evidence.at(-1)!.d.reject(new Error("offline"));
    await flush();
    expect(h.state.phase).toBe("error");
    expect(h.state.status).toBe(CREW_STATUS.evidenceError);
    expect(h.state.report).toBeNull();
  });

  it("signed-out and operator-only contexts never request evidence", async () => {
    for (const c of [
      { signedIn: false, memberships: [] } as CrewMissionContext,
      ctx([member(A, "mission_operator")]),
    ]) {
      const h = harness();
      void h.controller.revalidate("initial");
      h.contexts[0]!.resolve(c);
      await flush();
      expect(h.evidence.length).toBe(0);
      expect(h.state.report).toBeNull();
      expect(h.state.phase).toBe("none");
    }
  });

  it("a different signed-in user never inherits the previous scope or filters", async () => {
    const h = harness();
    await authorizeA(h);
    void h.controller.revalidate("auth");
    h.contexts.at(-1)!.resolve(ctx([member(A)], { userId: "u2" }));
    await flush();
    expect(h.evidence.at(-1)!.scope).toEqual(A);
    h.evidence.at(-1)!.d.resolve({ report: report(A) });
    await flush();
    expect(h.state.preserve).toBe(false);
  });

  it("disposal drops in-flight results", async () => {
    const h = harness();
    void h.controller.revalidate("initial");
    h.controller.dispose();
    h.contexts[0]!.resolve(ctx([member(A)]));
    await flush();
    expect(h.evidence.length).toBe(0);
    expect(h.state.report).toBeNull();
  });
});
