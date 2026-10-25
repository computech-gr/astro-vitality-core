import { validateSyntheticSnapshot } from "@/domain/health-intelligence/synthetic-review-export";
import { assertProductionSyntheticRequest } from "@/domain/health-intelligence/production-synthetic-demo";
import {
  boundedSyntheticPayload,
  syntheticUsageMicrousd,
  SYNTHETIC_PRODUCTION_TRANSPORT_BLOCKER,
} from "@/domain/health-intelligence/synthetic-activation-policy";
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

export interface QaDependencies {
  enabled: boolean;
  productionSynthetic?: boolean;
  apiKey: string | undefined;
  model?: string | undefined;
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  providerFetch: typeof fetch;
  now: () => string;
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
    // A database permit and external fetch cannot share a transaction here.
    // Deny before evidence reads, reservation or transmission; flags/owner acknowledgment
    // cannot override absent hard billing and outbound serialization guarantees.
    return fail(SYNTHETIC_PRODUCTION_TRANSPORT_BLOCKER, 503);
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
  } catch {
    return fail("Input exceeds reserved spending bounds; no data sent", 413);
  }
  if (deps.productionSynthetic && deps.model && deps.model !== syntheticProviderModel)
    return fail("Configured model does not match the pinned spending policy", 503);
  let attempt: string | null = null;
  try {
    if (deps.productionSynthetic)
      attempt = await reserveSyntheticAttempt(deps.rpc, snapshot.sha256, nonce);
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
  try {
    if (attempt) await permitSyntheticTransmission(deps.rpc, attempt, snapshot.sha256, nonce);
    const upstream = await deps.providerFetch(MEDICAL_OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${deps.apiKey}` },
      body: providerBody,
    });
    if (!upstream.ok)
      result = fail(
        "OpenAI provider request failed; no answer accepted",
        upstream.status === 429 ? 429 : upstream.status === 403 ? 403 : 502,
      );
    else {
      const body = (await upstream.json()) as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        usage?: unknown;
        model?: string;
      };
      usage = syntheticUsageMicrousd(body.usage);
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
      try {
        const generatedAt = deps.now();
        if (!/(?:Z|\+00:00)$/.test(generatedAt) || !Number.isFinite(Date.parse(generatedAt)))
          throw new Error("Invalid server UTC timestamp");
        const answer = validateSyntheticAnswer(JSON.parse(raw), snapshot.evidence);
        // Re-read authority after the provider returns; source/receipt changes invalidate the answer.
        const current = await deps.rpc("medical_v3_fixture_snapshot", {});
        const fresh = current.error ? null : await validateSyntheticSnapshot(current.data);
        if (!fresh || fresh.sha256 !== snapshot.sha256)
          result = fail("Evidence changed during generation; answer rejected", 422);
        else
          result = Response.json(
            {
              ...answer,
              evidence_sha256: snapshot.sha256,
              generated_at: generatedAt,
              warning: "Unverified synthetic research answer; not clinical advice.",
            },
            { headers },
          );
      } catch {
        result = fail("Invalid citations or unsupported answer; rejected", 422);
      }
    }
  } catch {
    result = fail("OpenAI request failed; no answer accepted", 502);
  } finally {
    if (attempt) {
      try {
        await finishSyntheticAttempt(deps.rpc, attempt, usage, nonce);
      } catch {
        result = fail(
          "Spending reconciliation unconfirmed; answer withheld and hold retained",
          503,
        );
      }
    } else {
      const released = await deps.rpc("medical_v3_release_ai", {
        p_reservation: quota.reservationId,
      });
      if (released.error)
        result = fail("Quota release could not be confirmed; answer withheld", 503);
    }
  }
  return result;
}
