import { validateSyntheticSnapshot } from "@/domain/health-intelligence/synthetic-review-export";
import {
  researchStatus,
  reserveResearch,
  dispatchResearch,
  finishResearch,
} from "./synthetic-research-guard.server";
import {
  classifyProviderFailure,
  providerFailureMessages,
} from "@/domain/health-intelligence/synthetic-research-policy";
import { assertProductionSyntheticRequest } from "@/domain/health-intelligence/production-synthetic-demo";
import {
  boundedSyntheticPayload,
  syntheticUsageMicrousd,
  SYNTHETIC_GUARD_VERSION,
} from "@/domain/health-intelligence/synthetic-activation-policy";
import {
  assertSyntheticTokenBudget,
  assertSyntheticOutputBudget,
} from "./synthetic-token-budget.server";
import {
  reserveSyntheticAttempt,
  permitSyntheticTransmission,
  finishSyntheticAttempt,
  syntheticProviderModel,
} from "./synthetic-activation-guard.server";
import {
  QA_INSTRUCTIONS,
  QA_SCHEMA,
  validateSyntheticAnswer,
  validateSyntheticQuestion,
} from "@/domain/health-intelligence/synthetic-evidence-qa";
import {
  MEDICAL_OPENAI_RESPONSES_URL,
  MEDICAL_OPENAI_DEFAULT_MODEL,
  MEDICAL_OPENAI_OUTPUT_TOKENS,
} from "@/domain/health-intelligence/medical-openai-contract";
import {
  createProviderDiagnostics,
  defaultDiagnosticLog,
  type ProviderDiagnosticEvent,
} from "./synthetic-provider-diagnostics.server";

export interface QaDependencies {
  enabled: boolean;
  productionSynthetic?: boolean;
  permanentResearch?: boolean;
  apiKey: string | undefined;
  model?: string | undefined;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  providerFetch: typeof fetch;
  now: () => string;
  /** Sanitized structured diagnostics sink; defaults to server console. */
  diagnosticLog?: (event: ProviderDiagnosticEvent) => void;
  correlationId?: () => string;
  clock?: () => number;
}
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
/** Called only after authentication. Injected RPC is the caller's RLS client, never admin. */
export async function answerSyntheticQuestion(
  input: unknown,
  deps: QaDependencies,
): Promise<Response> {
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (!deps.enabled)
    return fail("Synthetic Q&A disabled pending separate production authorization.", 503);
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail("Invalid question", 400);
  const data = input as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (k) => !["question", "consent", "provenance", "missionId", "crewMemberId"].includes(k),
    ) ||
    data["consent"] !== true ||
    data["provenance"] !== "synthetic"
  )
    return fail("Explicit synthetic-only consent required", 403);
  let question: string;
  try {
    question = validateSyntheticQuestion(data["question"]);
  } catch {
    return fail("Invalid or out-of-scope question", 400);
  }
  if (deps.productionSynthetic) {
    try {
      assertProductionSyntheticRequest(data["missionId"], data["crewMemberId"], question);
    } catch {
      return fail("Only the approved scope and predefined synthetic questions are allowed", 403);
    }
    try {
      if (deps.permanentResearch) {
        if (!(await researchStatus(deps.rpc)).eligible)
          return fail(
            "Permanent research policy paused, budget exhausted or unavailable; no data sent",
            503,
          );
      } else {
        const guard = await deps.rpc("medical_demo_status", {});
        const status = guard.data as { version?: string; eligible?: boolean } | null;
        if (guard.error || status?.version !== SYNTHETIC_GUARD_VERSION || status.eligible !== true)
          return fail(
            "Synthetic guard absent, disabled, expired or unavailable; no data sent",
            503,
          );
      }
    } catch {
      return fail("Synthetic guard unavailable; no data sent", 503);
    }
  }
  if (!deps.apiKey) return fail("Existing OpenAI provider is not configured; no data sent", 503);
  const source = await deps.rpc("medical_v3_fixture_snapshot", {});
  if (source.error || !source.data)
    return fail("Authoritative evidence unavailable or access denied", 403);
  let snapshot;
  try {
    snapshot = await validateSyntheticSnapshot(source.data);
  } catch {
    return fail("Invalid authoritative evidence; no data sent", 503);
  }
  if (snapshot.missionId !== data["missionId"] || snapshot.crewMemberId !== data["crewMemberId"])
    return fail("Synthetic scope mismatch", 403);
  if (
    deps.productionSynthetic &&
    (snapshot.evidence.length !== 2 ||
      snapshot.evidence.some(
        (o, i) =>
          o.id !== `synthetic-v3-hr-00${i + 1}` ||
          o.metric !== "cv-001" ||
          o.domain !== "cardiovascular" ||
          o.unit !== "bpm" ||
          o.value !== (i === 0 ? "62" : "66") ||
          o.time !== `2026-10-0${i + 1}T10:00:00Z`,
      ))
  )
    return fail("Approved synthetic fixture changed; no data sent", 422);
  const verified = await deps.rpc("medical_v3_ai_evidence", {
    p_mission: snapshot.missionId,
    p_crew: snapshot.crewMemberId,
  });
  // Compare all exact fields independent of PostgreSQL JSON key ordering.
  if (
    verified.error ||
    !Array.isArray(verified.data) ||
    verified.data.length !== snapshot.evidence.length ||
    verified.data.some(
      (o, index) =>
        !o ||
        typeof o !== "object" ||
        Object.entries(snapshot.evidence[index] ?? {}).some(
          ([key, value]) => (o as Record<string, unknown>)[key] !== value,
        ),
    )
  )
    return fail("Stale evidence; no data sent", 422);
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const payload = {
    model: deps.productionSynthetic
      ? syntheticProviderModel
      : deps.model || MEDICAL_OPENAI_DEFAULT_MODEL,
    store: false,
    max_output_tokens: MEDICAL_OPENAI_OUTPUT_TOKENS,
    instructions: QA_INSTRUCTIONS,
    input: JSON.stringify({ question, provenance: "synthetic", evidence: snapshot.evidence }),
    text: {
      format: {
        type: "json_schema",
        name: "synthetic_evidence_answer",
        strict: true,
        schema: QA_SCHEMA,
      },
    },
  };
  let providerBody: string;
  try {
    providerBody = deps.productionSynthetic
      ? boundedSyntheticPayload(payload)
      : JSON.stringify(payload);
    if (deps.productionSynthetic) assertSyntheticTokenBudget(providerBody);
  } catch {
    return fail("Input exceeds reserved spending bounds; no data sent", 413);
  }
  if (deps.productionSynthetic && deps.model && deps.model !== syntheticProviderModel)
    return fail("Configured model does not match the pinned spending policy", 503);
  let attempt: string | null = null;
  try {
    if (deps.productionSynthetic)
      attempt = deps.permanentResearch
        ? await reserveResearch(deps.rpc, snapshot.sha256, nonce)
        : await reserveSyntheticAttempt(deps.rpc, snapshot.sha256, nonce);
  } catch {
    return fail("Synthetic authorization, quota or spending cap denied; no data sent", 429);
  }
  const lease = attempt
    ? { data: { allowed: true, reservationId: attempt }, error: null }
    : await deps.rpc("medical_v3_reserve_ai", {
        p_mission: snapshot.missionId,
        p_crew: snapshot.crewMemberId,
      });
  const quota = lease.data as { allowed?: boolean; reservationId?: string } | null;
  if (lease.error || !quota) return fail("Atomic quota unavailable", 503);
  if (quota.allowed !== true || !quota.reservationId)
    return Response.json(
      { error: "AI request quota exhausted" },
      { status: 429, headers: { ...headers, "Retry-After": "60" } },
    );
  let result: Response;
  let usage: number | null = null;
  let tokens: { input: number; output: number } | null = null;
  let outcome = "unknown";
  let providerRequest: string | null = null;
  const correlationId = deps.correlationId?.() ?? crypto.randomUUID();
  const diag = createProviderDiagnostics(correlationId, attempt, deps.clock);
  const failWithId = (error: string, status: number) =>
    Response.json({ error, correlationId }, { status, headers });
  try {
    // SQL disable denies later permits. A prior permit may transmit after disable commits.
    if (attempt) {
      if (deps.permanentResearch) await dispatchResearch(deps.rpc, attempt, snapshot.sha256, nonce);
      else await permitSyntheticTransmission(deps.rpc, attempt, snapshot.sha256, nonce);
    }
    diag.stage("provider_transmit");
    // Invoke with the global receiver: workerd rejects fetch called as a method of another
    // object ("Illegal invocation") before any network transmission.
    const upstream = await Reflect.apply(deps.providerFetch, globalThis, [
      MEDICAL_OPENAI_RESPONSES_URL,
      {
        method: "POST",
        signal: AbortSignal.timeout(25_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.apiKey}` },
        body: providerBody,
      },
    ]);
    diag.stage("provider_status");
    providerRequest = upstream.headers.get("x-request-id");
    diag.response(upstream.status, providerRequest);
    if (!upstream.ok) {
      diag.stage("provider_error_body");
      const errorBody = (await upstream.json().catch(() => null)) as {
        error?: { code?: unknown };
      } | null;
      diag.providerError(errorBody);
      diag.fail("provider_status");
      if (deps.permanentResearch) {
        const condition = classifyProviderFailure(upstream.status, errorBody?.error?.code);
        outcome = condition;
        result = failWithId(
          providerFailureMessages[condition],
          condition === "credit_exhausted" || condition === "spend_limit"
            ? 402
            : condition === "rate_limit"
              ? 429
              : 502,
        );
      } else
        result = failWithId(
          "OpenAI provider request failed; no answer accepted",
          upstream.status === 429 ? 429 : upstream.status === 403 ? 403 : 502,
        );
    } else {
      diag.stage("provider_response_parse");
      const body = (await upstream.json()) as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        usage?: unknown;
        model?: string;
      };
      diag.stage("usage_validation");
      usage = syntheticUsageMicrousd(body.usage);
      if (usage !== null) {
        const u = body.usage as { input_tokens: number; output_tokens: number };
        tokens = { input: u.input_tokens, output: u.output_tokens };
        outcome = "invalid_answer";
      }
      if (attempt && (usage === null || body.model !== syntheticProviderModel)) {
        usage = null;
        throw new Error("Pinned model or bounded usage could not be confirmed");
      }
      const raw =
        body.output
          ?.flatMap((o) => o.content ?? [])
          .filter((c) => c.type === "output_text")
          .map((c) => c.text ?? "")
          .join("") ?? "";
      diag.stage("output_budget");
      if (attempt) assertSyntheticOutputBudget(raw);
      try {
        diag.stage("answer_validation");
        const generatedAt = deps.now();
        if (!/(?:Z|\+00:00)$/.test(generatedAt) || !Number.isFinite(Date.parse(generatedAt)))
          throw new Error("Invalid server UTC timestamp");
        const answer = validateSyntheticAnswer(JSON.parse(raw), snapshot.evidence);
        // Re-read authority after the provider returns; source/receipt changes invalidate the answer.
        diag.stage("evidence_recheck");
        const current = await deps.rpc("medical_v3_fixture_snapshot", {});
        const fresh = current.error ? null : await validateSyntheticSnapshot(current.data);
        if (!fresh || fresh.sha256 !== snapshot.sha256) {
          diag.fail();
          result = failWithId("Evidence changed during generation; answer rejected", 422);
        } else {
          outcome = "success";
          diag.stage("complete");
          result = Response.json(
            {
              ...answer,
              evidence_sha256: snapshot.sha256,
              generated_at: generatedAt,
              warning: "Unverified synthetic research answer; not clinical advice.",
            },
            { headers },
          );
        }
      } catch (error) {
        diag.exception(error);
        result = failWithId("Invalid citations or unsupported answer; rejected", 422);
      }
    }
  } catch (error) {
    diag.exception(error);
    outcome = "provider_outage";
    result = failWithId("OpenAI request failed; no answer accepted", 502);
  } finally {
    if (attempt) {
      try {
        if (deps.permanentResearch)
          await finishResearch(deps.rpc, attempt, usage, tokens, outcome, providerRequest, nonce);
        else await finishSyntheticAttempt(deps.rpc, attempt, usage, nonce);
      } catch (error) {
        diag.stage("finish");
        diag.exception(error);
        result = failWithId(
          "Spending reconciliation unconfirmed; answer withheld and hold retained",
          503,
        );
      }
    } else {
      const released = await deps.rpc("medical_v3_release_ai", {
        p_reservation: quota.reservationId,
      });
      if (released.error)
        result = failWithId("Quota release could not be confirmed; answer withheld", 503);
    }
    try {
      (deps.diagnosticLog ?? defaultDiagnosticLog)(diag.event(outcome));
    } catch {
      // Diagnostics must never change spending, hold or answer outcomes.
    }
  }
  return result;
}
