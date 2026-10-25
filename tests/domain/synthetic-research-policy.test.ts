import { test, expect } from "bun:test";
import {
  budgetAlerts,
  classifyProviderFailure,
  researchStatusSchema,
} from "../../src/domain/health-intelligence/synthetic-research-policy";
import { readOpenAIOrganizationTotals } from "../../src/lib/openai-organization-costs.server";
import { answerSyntheticQuestion } from "../../src/lib/synthetic-evidence-qa.server";
import {
  canonicalSyntheticJson,
  syntheticSha256,
} from "../../src/domain/health-intelligence/synthetic-evidence";
import {
  PRODUCTION_SYNTHETIC_MISSION as mission,
  PRODUCTION_SYNTHETIC_CREW as crew,
  SYNTHETIC_DEMO_QUESTIONS,
} from "../../src/domain/health-intelligence/production-synthetic-demo";
const status = {
  version: "synthetic-research-v2",
  owner: true,
  enabled: true,
  eligible: true,
  attempts: 0,
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
test("budget alerts trigger exactly at 50, 80, 90 and 100 percent", () => {
  for (const threshold of [50, 80, 90, 100]) {
    expect(budgetAlerts(10000, 10000 - threshold * 100)).toContain(threshold);
    expect(budgetAlerts(10000, 10001 - threshold * 100)).not.toContain(threshold);
  }
});
test("billing exhaustion, spend limit, throttling and outages stay distinct", () => {
  expect(classifyProviderFailure(429, "credit_balance_exhausted")).toBe("credit_exhausted");
  expect(classifyProviderFailure(429, "project_spend_limit_exceeded")).toBe("spend_limit");
  expect(classifyProviderFailure(429, "rate_limit_exceeded")).toBe("rate_limit");
  expect(classifyProviderFailure(503, null)).toBe("provider_outage");
});
test("v1 status cannot substitute for v2 authorization", () =>
  expect(() =>
    researchStatusSchema.parse({ ...status, version: "synthetic-practical-v1" }),
  ).toThrow());
test("complete provider reports remain recorded dollars, separate from estimates", async () => {
  let calls = 0;
  const totals = await readOpenAIOrganizationTotals(
    "mock-admin",
    "proj_test",
    new Date("2026-10-25T00:00:00Z"),
    (async (url) => {
      calls++;
      const cost = String(url).includes("/costs");
      return Response.json({
        data: [
          {
            results: [
              cost
                ? { project_id: "proj_test", amount: { currency: "usd", value: 0.012345 } }
                : {
                    project_id: "proj_test",
                    input_tokens: 100,
                    output_tokens: 20,
                    num_model_requests: 2,
                  },
            ],
          },
        ],
        has_more: false,
      });
    }) as typeof fetch,
  );
  expect(calls).toBe(2);
  expect(totals.costMicrousd).toBe(12345);
  expect(totals.requests).toBe(2);
  expect(totals.inputTokens).toBe(100);
});
test("reporting attribution mismatch never records organization costs as app costs", async () => {
  await expect(
    readOpenAIOrganizationTotals("mock", "proj_test", new Date(), (async () =>
      Response.json({
        data: [{ results: [{ project_id: "proj_other", amount: { currency: "usd", value: 1 } }] }],
        has_more: false,
      })) as typeof fetch),
  ).rejects.toThrow("attribution");
});
test("pagination repeats fail closed without partial totals", async () => {
  await expect(
    readOpenAIOrganizationTotals("mock", "proj_test", new Date(), (async () =>
      Response.json({ data: [], has_more: true, next_page: "repeat" })) as typeof fetch),
  ).rejects.toThrow("pagination");
});
async function setup() {
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
  return {
    evidence,
    snapshot: {
      missionId: mission,
      crewMemberId: crew,
      canonical,
      sha256: await syntheticSha256(canonical),
      evidence,
    },
  };
}
const input = {
  missionId: mission,
  crewMemberId: crew,
  question: SYNTHETIC_DEMO_QUESTIONS[0],
  consent: true,
  provenance: "synthetic",
};
test("permanent policy missing never falls back to lifetime or unguarded quota", async () => {
  let sends = 0;
  const calls: string[] = [];
  const response = await answerSyntheticQuestion(input, {
    enabled: true,
    productionSynthetic: true,
    permanentResearch: true,
    apiKey: "mock",
    rpc: async (name) => {
      calls.push(name);
      return { data: null, error: "absent" };
    },
    providerFetch: (async () => {
      sends++;
      return Response.json({});
    }) as typeof fetch,
    now: () => new Date().toISOString(),
  });
  expect(response.status).toBe(503);
  expect(calls).toEqual(["medical_research_status"]);
  expect(sends).toBe(0);
});
test("permanent policy invokes one existing provider request and exact synthetic citations", async () => {
  const { evidence, snapshot } = await setup();
  let sends = 0;
  const calls: string[] = [];
  let finish: Record<string, unknown> = {};
  const response = await answerSyntheticQuestion(input, {
    enabled: true,
    productionSynthetic: true,
    permanentResearch: true,
    apiKey: "mock",
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "medical_research_status") return { data: status, error: null };
      if (name === "medical_v3_fixture_snapshot") return { data: snapshot, error: null };
      if (name === "medical_v3_ai_evidence") return { data: evidence, error: null };
      if (name === "medical_research_reserve")
        return { data: { allowed: true, attemptId: "attempt" }, error: null };
      if (name === "medical_research_finish") finish = args;
      return { data: true, error: null };
    },
    providerFetch: (async () => {
      sends++;
      return Response.json({
        model: "gpt-4.1-mini-2025-04-14",
        usage: { input_tokens: 100, output_tokens: 100 },
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  statements: evidence.map((o) => ({
                    observationId: o.id,
                    text: `${o.metric} recorded ${o.value} ${o.unit} at ${o.time}.`,
                  })),
                }),
              },
            ],
          },
        ],
      });
    }) as typeof fetch,
    now: () => "2026-10-25T06:00:00Z",
  });
  expect(response.status).toBe(200);
  expect(sends).toBe(1);
  expect(finish["p_usage"]).toBe(2000);
  expect(finish["p_outcome"]).toBe("success");
  expect(calls.some((n) => n.startsWith("medical_demo_"))).toBe(false);
});
test("billing errors never retry and finish with irreversible unknown hold", async () => {
  const { evidence, snapshot } = await setup();
  let sends = 0;
  let finish: Record<string, unknown> = {};
  const response = await answerSyntheticQuestion(input, {
    enabled: true,
    productionSynthetic: true,
    permanentResearch: true,
    apiKey: "mock",
    rpc: async (name, args) => {
      if (name === "medical_research_status") return { data: status, error: null };
      if (name === "medical_v3_fixture_snapshot") return { data: snapshot, error: null };
      if (name === "medical_v3_ai_evidence") return { data: evidence, error: null };
      if (name === "medical_research_reserve")
        return { data: { allowed: true, attemptId: "attempt" }, error: null };
      if (name === "medical_research_finish") finish = args;
      return { data: true, error: null };
    },
    providerFetch: (async () => {
      sends++;
      return Response.json({ error: { code: "credit_balance_exhausted" } }, { status: 429 });
    }) as typeof fetch,
    now: () => new Date().toISOString(),
  });
  expect(response.status).toBe(402);
  expect(sends).toBe(1);
  expect(finish["p_usage"]).toBeNull();
  expect(finish["p_outcome"]).toBe("credit_exhausted");
});
