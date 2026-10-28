import { describe, expect, it, beforeEach } from "bun:test";
import { handleMedicalDocumentExtraction, type ExtractionDeps } from "@/lib/medical-document-extraction.server";

const MISSION = "mission-".padEnd(39, "a");
const CREW = "crew-".padEnd(37, "b");
const request = {
  missionId: MISSION,
  crewMemberId: CREW,
  provenance: "synthetic" as const,
  domain: "immune" as const,
  text: "6.7 x10^9/L Total leukocytes / WBC",
  pageCount: 1,
  localSummary: { matched: 0, held: 0, rejected: 1 },
};
const envelope = {
  schemaVersion: "p36.1", provider: "lovable", model: "openai/gpt-6-astra", warnings: [],
  suggestions: [{ catalogId: "IMM-001", reportedAnalyte: "Total leukocytes / WBC", value: 6.7, reportedUnit: "10^9/L", observedAt: null, dateKind: "collection", sourcePage: 1, evidenceSnippet: "6.7 x10^9/L Total leukocytes / WBC", uncertainty: [] }],
};
const sse = (obj: unknown) =>
  `data: ${JSON.stringify({ type: "response.output_text.delta", delta: JSON.stringify(obj) })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { usage: { input_tokens: 100, output_tokens: 50 }, model: "openai/gpt-6-astra" } })}\n\ndata: [DONE]\n\n`;

function deps(overrides: Partial<ExtractionDeps> & { env?: Record<string, string> } = {}): ExtractionDeps {
  const { env: envMap, ...rest } = overrides;
  return {
    env: (name) => envMap?.[name],
    userId: "user-1",
    isAuthorizedScope: async () => true,
    providerFetch: (async () => new Response(sse(envelope), { status: 200 })) as typeof fetch,
    ...rest,
  };
}
const on = { P36_DOCUMENT_AI_ENABLED: "true", LOVABLE_API_KEY: "test-key" };

describe("P36 document extraction endpoint", () => {
  beforeEach(() => {
    // Reset the module's best-effort rate limiter between tests via unique users.
  });
  it("denies by default when the feature flag is absent", async () => {
    const res = await handleMedicalDocumentExtraction(request, deps({ env: {} }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("not enabled");
  });
  it("denies real provenance without the separate real-data authorization", async () => {
    const res = await handleMedicalDocumentExtraction({ ...request, provenance: "real" }, deps({ env: on }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Real medical document AI transfer is not authorized");
  });
  it("allows real provenance only when explicitly configured", async () => {
    const res = await handleMedicalDocumentExtraction({ ...request, provenance: "real" }, deps({ env: { ...on, P36_REAL_DOCUMENT_AI_ENABLED: "true" }, userId: "user-real" }));
    expect(res.status).toBe(200);
  });
  it("rejects invalid input and unknown domains", async () => {
    expect((await handleMedicalDocumentExtraction(null, deps({ env: on }))).status).toBe(400);
    expect((await handleMedicalDocumentExtraction({ ...request, domain: "sleep" }, deps({ env: on }))).status).toBe(400);
    expect((await handleMedicalDocumentExtraction({ ...request, text: "x".repeat(20001) }, deps({ env: on }))).status).toBe(400);
    expect((await handleMedicalDocumentExtraction({ ...request, missionId: "other" }, deps({ env: on }))).status).toBe(400);
    expect((await handleMedicalDocumentExtraction({ ...request, approved: true }, deps({ env: on }))).status).toBe(400);
  });
  it("denies unauthorized mission/crew scopes", async () => {
    const res = await handleMedicalDocumentExtraction(request, deps({ env: on, isAuthorizedScope: async () => false }));
    expect(res.status).toBe(403);
  });
  it("fails closed when authorization lookup fails", async () => {
    const res = await handleMedicalDocumentExtraction(request, deps({ env: on, isAuthorizedScope: async () => { throw new Error("down"); } }));
    expect(res.status).toBe(503);
  });
  it("rejects models outside the approved allowlist", async () => {
    const res = await handleMedicalDocumentExtraction(request, deps({ env: { ...on, P36_AI_MODEL: "gpt-9000" } }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("allowlist");
  });
  it("maps provider outages to 502 without retrying", async () => {
    let calls = 0;
    const res = await handleMedicalDocumentExtraction(request, deps({
      env: on, userId: "user-outage",
      providerFetch: (async () => { calls++; return new Response("upstream down", { status: 500 }); }) as typeof fetch,
    }));
    expect(res.status).toBe(502);
    expect(calls).toBe(1);
  });
  it("rejects invalid provider envelopes with 422", async () => {
    const res = await handleMedicalDocumentExtraction(request, deps({
      env: on, userId: "user-bad-envelope",
      providerFetch: (async () => new Response(sse({ schemaVersion: "wrong" }), { status: 200 })) as typeof fetch,
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.errors[0]).toContain("Invalid extraction schema");
  });
  it("returns validated rows on success and audits without contents", async () => {
    const events: Record<string, unknown>[] = [];
    const res = await handleMedicalDocumentExtraction(request, deps({ env: on, userId: "user-ok", audit: e => events.push(e) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("lovable");
    expect(body.model).toBe("openai/gpt-6-astra");
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].catalogId).toBe("IMM-001");
    expect(body.rows[0].status).toBe("held"); // collection date → manual confirmation
    expect(events).toHaveLength(1);
    expect(events[0]!["outcome"]).toBe("ok");
    expect(JSON.stringify(events[0])).not.toContain("leukocytes");
    expect(JSON.stringify(events[0])).not.toContain(request.text);
  });
  it("rate-limits repeated requests from the same user", async () => {
    const d = deps({ env: { ...on, P36_AI_RATE_PER_HOUR: "2" }, userId: "user-rate" });
    expect((await handleMedicalDocumentExtraction(request, d)).status).toBe(200);
    expect((await handleMedicalDocumentExtraction(request, d)).status).toBe(200);
    const third = await handleMedicalDocumentExtraction(request, d);
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toBe("600");
  });
});
