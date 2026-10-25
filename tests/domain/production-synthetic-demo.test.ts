import { expect, test } from "bun:test";
import {
  syntheticDemoMode,
  assertProductionSyntheticRequest,
  PRODUCTION_SYNTHETIC_MISSION as mission,
  PRODUCTION_SYNTHETIC_CREW as crew,
  SYNTHETIC_DEMO_QUESTIONS as questions,
} from "../../src/domain/health-intelligence/production-synthetic-demo";
import { answerSyntheticQuestion } from "../../src/lib/synthetic-evidence-qa.server";
import {
  canonicalSyntheticJson,
  syntheticSha256,
} from "../../src/domain/health-intelligence/synthetic-evidence";

test("production synthetic capability is default off and independent of disposable flags", () => {
  expect(syntheticDemoMode({})).toBe("disabled");
  expect(syntheticDemoMode({ isolated: "true" })).toBe("disabled");
  expect(syntheticDemoMode({ production: "true" })).toBe("production-synthetic");
  expect(syntheticDemoMode({ isolated: "true", environment: "disposable" })).toBe("disposable");
});
test("only exact existing mission/crew and predefined questions pass production gate", () => {
  expect(() => assertProductionSyntheticRequest(mission, crew, questions[0])).not.toThrow();
  expect(() => assertProductionSyntheticRequest("other", crew, questions[0])).toThrow();
  expect(() => assertProductionSyntheticRequest(mission, "other", questions[0])).toThrow();
  expect(() =>
    assertProductionSyntheticRequest(mission, crew, "My private medical history"),
  ).toThrow();
});
test("production refuses sensitive free text before any RPC or provider call", async () => {
  let calls = 0;
  const response = await answerSyntheticQuestion(
    {
      missionId: mission,
      crewMemberId: crew,
      provenance: "synthetic",
      consent: true,
      question: "My pulse was 180",
    },
    {
      enabled: true,
      productionSynthetic: true,
      apiKey: "test-only",
      rpc: async () => {
        calls++;
        return { data: null, error: null };
      },
      providerFetch: (async () => {
        calls++;
        return Response.json({});
      }) as typeof fetch,
      now: () => new Date().toISOString(),
    },
  );
  expect(response.status).toBe(403);
  expect(calls).toBe(0);
});
test("production uses the approved guard for exact 62/66 evidence and handles timeout without retry", async () => {
  const evidence = [62, 66].map((n, i) => ({
    id: `synthetic-v3-hr-00${i + 1}`,
    metric: "cv-001",
    domain: "cardiovascular",
    value: String(n),
    unit: "bpm",
    time: `2026-10-0${i + 1}T10:00:00Z`,
  }));
  const canonical = canonicalSyntheticJson({
    schema: "mitochondria.synthetic-evidence.v2",
    missionId: mission,
    crewMemberId: crew,
    provenance: "synthetic",
    observations: evidence,
  });
  const snapshot = {
    missionId: mission,
    crewMemberId: crew,
    canonical,
    sha256: await syntheticSha256(canonical),
    evidence,
  };
  let sent = 0,
    released = 0;
  const deps = {
    enabled: true,
    productionSynthetic: true,
    apiKey: "test-only",
    now: () => "2026-10-25T00:00:00Z",
    rpc: async (name: string) => {
      if (name === "medical_demo_status")
        return { data: { version: "synthetic-practical-v1", eligible: true }, error: null };
      if (name === "medical_v3_fixture_snapshot") return { data: snapshot, error: null };
      if (name === "medical_v3_ai_evidence") return { data: evidence, error: null };
      if (name === "medical_demo_reserve")
        return { data: { allowed: true, attemptId: "lease" }, error: null };
      if (name === "medical_demo_dispatch") return { data: true, error: null };
      released++;
      return { data: true, error: null };
    },
    providerFetch: (async (_url: unknown, init?: RequestInit) => {
      sent++;
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json({
        model: "gpt-4.1-mini-2025-04-14",
        usage: { input_tokens: 1000, output_tokens: 500 },
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  statements: evidence.map((o) => ({
                    text: `${o.metric} recorded ${o.value} ${o.unit} at ${o.time}.`,
                    observationId: o.id,
                  })),
                }),
              },
            ],
          },
        ],
      });
    }) as typeof fetch,
  };
  const input = {
    missionId: mission,
    crewMemberId: crew,
    provenance: "synthetic",
    consent: true,
    question: questions[0],
  };
  const response = await answerSyntheticQuestion(input, deps);
  expect(response.status).toBe(200);
  expect((await response.json()).citedIds).toEqual(["synthetic-v3-hr-001", "synthetic-v3-hr-002"]);
  expect(sent).toBe(1);
  expect(released).toBe(1);
  const timeout = await answerSyntheticQuestion(input, {
    ...deps,
    providerFetch: (async () => {
      throw new DOMException("Timeout", "TimeoutError");
    }) as typeof fetch,
  });
  expect(timeout.status).toBe(502);
  expect(released).toBe(2);
  for (const eligible of [false, true]) {
    let dispatches = 0,
      sends = 0;
    const denied = await answerSyntheticQuestion(input, {
      ...deps,
      rpc: async (name: string) => {
        if (name === "medical_demo_status")
          return { data: { version: "synthetic-practical-v1", eligible }, error: null };
        if (name === "medical_demo_dispatch") {
          dispatches++;
          return { data: false, error: null };
        }
        return deps.rpc(name);
      },
      providerFetch: (async () => {
        sends++;
        return Response.json({});
      }) as typeof fetch,
    });
    expect(denied.status).toBe(eligible ? 502 : 503);
    expect(dispatches).toBe(eligible ? 1 : 0);
    expect(sends).toBe(0);
  }
  // A permit committed before disable may still start HTTP; this is accepted, not cancellation.
  let disabled = false,
    sendsAfterDisable = 0;
  const raced = await answerSyntheticQuestion(input, {
    ...deps,
    rpc: async (name: string) => {
      if (name === "medical_demo_dispatch") {
        disabled = true;
        return { data: true, error: null };
      }
      return deps.rpc(name);
    },
    providerFetch: (async (url, init) => {
      if (disabled) sendsAfterDisable++;
      return deps.providerFetch(url, init);
    }) as typeof fetch,
  });
  expect(raced.status).toBe(200);
  expect(sendsAfterDisable).toBe(1);
  let completionUsage: unknown = "unset",
    retryCalls = 0;
  const failed = await answerSyntheticQuestion(input, {
    ...deps,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "medical_demo_finish") {
        completionUsage = args["p_usage"];
        return { data: true, error: null };
      }
      return deps.rpc(name);
    },
    providerFetch: (async () => {
      retryCalls++;
      return Response.json({}, { status: 429 });
    }) as typeof fetch,
  });
  expect(failed.status).toBe(429);
  expect(retryCalls).toBe(1);
  expect(completionUsage).toBeNull();
  const unconfirmed = await answerSyntheticQuestion(input, {
    ...deps,
    rpc: async (name: string) =>
      name === "medical_demo_finish" ? { data: false, error: null } : deps.rpc(name),
  });
  expect(unconfirmed.status).toBe(503);
});
