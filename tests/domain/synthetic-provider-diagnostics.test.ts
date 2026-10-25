import { test, expect } from "bun:test";
import { answerSyntheticQuestion } from "../../src/lib/synthetic-evidence-qa.server";
import {
  classifyException,
  sanitizeProviderToken,
  transmissionAfterException,
  type ProviderDiagnosticEvent,
} from "../../src/lib/synthetic-provider-diagnostics.server";
import {
  canonicalSyntheticJson,
  syntheticSha256,
} from "../../src/domain/health-intelligence/synthetic-evidence";
import {
  PRODUCTION_SYNTHETIC_MISSION as mission,
  PRODUCTION_SYNTHETIC_CREW as crew,
  SYNTHETIC_DEMO_QUESTIONS,
} from "../../src/domain/health-intelligence/production-synthetic-demo";

const API_KEY = "sk-test-secret-value-never-logged";
const status = {
  version: "synthetic-research-v2",
  owner: true,
  enabled: true,
  eligible: true,
  attempts: 0,
  dispatchedRequests: 0,
  providerRequests: null,
  estimatedUsageMicrousd: 0,
  heldMicrousd: 0,
  budgetMicrousd: 1000000,
  remainingMicrousd: 1000000,
  recordedMicrousd: null,
  synchronizedAt: null,
  inputTokens: 0,
  outputTokens: 0,
  failures: 0,
  rollingLimit: 10,
  rollingSeconds: 1800,
  providerProject: null,
  syncRequired: false,
  activeAttempt: null,
  revision: 1,
  month: "2026-10-01",
};
const input = {
  missionId: mission,
  crewMemberId: crew,
  question: SYNTHETIC_DEMO_QUESTIONS[0],
  consent: true,
  provenance: "synthetic",
};

async function run(providerFetch: typeof fetch) {
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
  const events: ProviderDiagnosticEvent[] = [];
  const calls: string[] = [];
  let finish: Record<string, unknown> = {};
  let sends = 0;
  const response = await answerSyntheticQuestion(input, {
    enabled: true,
    productionSynthetic: true,
    permanentResearch: true,
    apiKey: API_KEY,
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "medical_research_status") return { data: status, error: null };
      if (name === "medical_v3_fixture_snapshot") return { data: snapshot, error: null };
      if (name === "medical_v3_ai_evidence") return { data: evidence, error: null };
      if (name === "medical_research_reserve")
        return { data: { allowed: true, attemptId: "attempt-1" }, error: null };
      if (name === "medical_research_finish") finish = args;
      return { data: true, error: null };
    },
    providerFetch: function (this: unknown, ...args: Parameters<typeof fetch>) {
      sends++;
      return providerFetch.apply(this, args);
    } as typeof fetch,
    now: () => "2026-10-25T06:00:00Z",
    diagnosticLog: (e) => events.push(e),
    correlationId: () => "corr-1",
    clock: () => 1000,
  });
  return { response, body: await response.json(), events, finish, calls, sends: () => sends };
}

function assertNoSensitiveContent(events: ProviderDiagnosticEvent[]) {
  const text = JSON.stringify(events);
  for (const forbidden of [API_KEY, "Bearer", "bpm", "cv-001", "synthetic-v3-hr", input.question])
    expect(text).not.toContain(forbidden);
}

test("provider HTTP error records status, request ID and sanitized code/type only", async () => {
  const r = await run((async () =>
    Response.json(
      { error: { code: "server_error", type: "api_error", message: "echo: 62 bpm Bearer x" } },
      { status: 500, headers: { "x-request-id": "req_abc123" } },
    )) as typeof fetch);
  expect(r.response.status).toBe(502);
  expect(r.body.correlationId).toBe("corr-1");
  expect(r.sends()).toBe(1);
  const e = r.events[0]!;
  expect(r.events.length).toBe(1);
  expect(e.attemptId).toBe("attempt-1");
  expect(e.providerStatus).toBe(500);
  expect(e.providerRequestId).toBe("req_abc123");
  expect(e.providerErrorCode).toBe("server_error");
  expect(e.providerErrorType).toBe("api_error");
  expect(e.failureStage).toBe("provider_status");
  expect(e.transmission).toBe("responded");
  expect(r.finish["p_request"]).toBe("req_abc123");
  expect(r.finish["p_usage"]).toBeNull();
  assertNoSensitiveContent(r.events);
});

test("connection failure is classified as network with unknown transmission and hold retained", async () => {
  const r = await run((async () => {
    throw new TypeError("Network connection lost.");
  }) as typeof fetch);
  expect(r.response.status).toBe(502);
  const e = r.events[0]!;
  expect(e.failureStage).toBe("provider_transmit");
  expect(e.exceptionClass).toBe("network");
  expect(e.exceptionName).toBe("TypeError");
  expect(e.transmission).toBe("unknown");
  expect(e.providerStatus).toBeNull();
  expect(r.finish["p_outcome"]).toBe("provider_outage");
  expect(r.finish["p_usage"]).toBeNull();
  assertNoSensitiveContent(r.events);
});

test("provider fetch is invoked with the global receiver, avoiding workerd illegal invocation", async () => {
  // Mirrors workerd: fetch rejects any receiver other than the global object.
  const strictFetch = function (this: unknown) {
    if (this !== globalThis && this !== undefined)
      throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
    return Promise.resolve(Response.json({}, { status: 503 }));
  } as unknown as typeof fetch;
  const r = await run(strictFetch);
  expect(r.events[0]!.exceptionClass).toBeNull();
  expect(r.events[0]!.providerStatus).toBe(503);
});

test("illegal invocation is classified as provably not transmitted", () => {
  const err = new TypeError("Illegal invocation: function called with incorrect `this` reference.");
  expect(classifyException(err, "provider_transmit")).toBe("illegal_invocation");
  expect(transmissionAfterException("provider_transmit", "illegal_invocation")).toBe(
    "not_transmitted",
  );
  expect(transmissionAfterException("provider_transmit", "network")).toBe("unknown");
  expect(transmissionAfterException("dispatch_permit", "runtime")).toBe("not_attempted");
});

test("malformed provider JSON fails at the parse stage without logging the body", async () => {
  const r = await run((async () =>
    new Response("not json 62 bpm", {
      status: 200,
      headers: { "x-request-id": "req_parse" },
    })) as typeof fetch);
  expect(r.response.status).toBe(502);
  const e = r.events[0]!;
  expect(e.failureStage).toBe("provider_response_parse");
  expect(e.exceptionClass).toBe("json_parse");
  expect(e.providerRequestId).toBe("req_parse");
  expect(r.finish["p_usage"]).toBeNull();
  assertNoSensitiveContent(r.events);
});

test("missing provider receipt (no request ID, usage or model) fails closed", async () => {
  const r = await run((async () => Response.json({ output: [] })) as typeof fetch);
  expect(r.response.status).toBe(502);
  const e = r.events[0]!;
  expect(e.providerRequestId).toBeNull();
  expect(e.failureStage).toBe("usage_validation");
  expect(e.exceptionClass).toBe("validation");
  expect(r.finish["p_request"]).toBeNull();
  expect(r.finish["p_usage"]).toBeNull();
  expect(r.finish["p_outcome"]).toBe("provider_outage");
  expect(r.sends()).toBe(1);
});

test("unsafe provider codes are dropped rather than logged", () => {
  expect(sanitizeProviderToken("insufficient_quota")).toBe("insufficient_quota");
  expect(sanitizeProviderToken("has spaces and 62 bpm")).toBeNull();
  expect(sanitizeProviderToken({ nested: true })).toBeNull();
  expect(sanitizeProviderToken("x".repeat(81))).toBeNull();
});
