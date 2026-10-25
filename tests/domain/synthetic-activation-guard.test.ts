import { expect, test } from "bun:test";
import { answerSyntheticQuestion } from "../../src/lib/synthetic-evidence-qa.server";
import {
  PRODUCTION_SYNTHETIC_MISSION,
  PRODUCTION_SYNTHETIC_CREW,
  SYNTHETIC_DEMO_QUESTIONS,
} from "../../src/domain/health-intelligence/production-synthetic-demo";
import {
  boundedSyntheticPayload,
  syntheticUsageMicrousd,
  SYNTHETIC_ACTIVATION_POLICY as p,
} from "../../src/domain/health-intelligence/synthetic-activation-policy";
import {
  reserveSyntheticAttempt,
  permitSyntheticTransmission,
  finishSyntheticAttempt,
} from "../../src/lib/synthetic-activation-guard.server";

test("ten nonrefundable USD 0.10 holds cannot exceed USD 1.00", () => {
  expect(p.attempts).toBe(10);
  expect(p.budgetMicrousd).toBe(1_000_000);
  expect(p.attempts * p.holdMicrousd).toBe(p.budgetMicrousd);
});
test("authorization window is exactly thirty minutes", () => {
  expect(p.windowSeconds).toBe(1800);
});
test("text input bound includes UTF8 not JS character count", () => {
  expect(() => boundedSyntheticPayload({ input: "é".repeat(2048) })).toThrow();
  expect(() => boundedSyntheticPayload({ input: "a".repeat(1000) })).not.toThrow();
});
test("worst-case bounded token cost is below the full hold", () => {
  expect(syntheticUsageMicrousd({ input_tokens: 6144, output_tokens: 1500 })).toBe(76440);
  expect(76440).toBeLessThan(p.holdMicrousd);
});
test("missing oversized negative or fractional usage is never refunded", () => {
  for (const u of [
    null,
    {},
    { input_tokens: 6145, output_tokens: 1 },
    { input_tokens: 1, output_tokens: 1501 },
    { input_tokens: -1, output_tokens: 0 },
    { input_tokens: 1.5, output_tokens: 0 },
  ])
    expect(syntheticUsageMicrousd(u)).toBeNull();
});
test("unavailable or denied authorization never yields a permit", async () => {
  for (const reply of [
    { data: null, error: "offline" },
    { data: { allowed: false }, error: null },
    { data: { allowed: true }, error: null },
  ])
    await expect(reserveSyntheticAttempt(async () => reply, "sha", "nonce")).rejects.toThrow();
});
test("expiry or emergency disable at last dispatch check rejects transmission", async () => {
  await expect(
    permitSyntheticTransmission(async () => ({ data: false, error: null }), "id", "sha", "nonce"),
  ).rejects.toThrow();
});
test("unknown completion retains its hold and propagates recovery failure", async () => {
  let args: Record<string, unknown> = {};
  await finishSyntheticAttempt(
    async (_, a) => {
      args = a;
      return { data: true, error: null };
    },
    "id",
    null,
    "nonce",
  );
  expect(args["p_usage"]).toBeNull();
  await expect(
    finishSyntheticAttempt(async () => ({ data: null, error: "offline" }), "id", 100, "nonce"),
  ).rejects.toThrow();
});

test("unavailable billing or serialized transport denies before every RPC and HTTP call", async () => {
  let rpcCalls = 0,
    transmissions = 0;
  const request = {
    missionId: PRODUCTION_SYNTHETIC_MISSION,
    crewMemberId: PRODUCTION_SYNTHETIC_CREW,
    question: SYNTHETIC_DEMO_QUESTIONS[0],
    consent: true,
    provenance: "synthetic",
  };
  for (let retry = 0; retry < 11; retry++) {
    const response = await answerSyntheticQuestion(request, {
      enabled: true,
      productionSynthetic: true,
      apiKey: "simulated-only",
      model: p.model,
      rpc: async () => {
        rpcCalls++;
        throw Error("must not run");
      },
      providerFetch: (async () => {
        transmissions++;
        throw new DOMException("timeout", "TimeoutError");
      }) as typeof fetch,
      now: () => new Date().toISOString(),
    });
    expect(response.status).toBe(503);
  }
  expect(rpcCalls).toBe(0);
  expect(transmissions).toBe(0);
});
