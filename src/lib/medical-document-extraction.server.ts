/** P36 server-side AI document extraction. Authenticated, mission/crew-scoped,
 * default-deny, bounded and audited without raw medical contents. Provider output
 * is validated against the domain catalog before it leaves the server and again
 * on the client; it is a suggestion layer, never a persistence API. */
import { MEASUREMENT_PROFILES } from "@/domain/health-measurements/profiles";
import { validateExtractionEnvelope } from "@/domain/medical-document/ai-extraction-contract";
import {
  P36_AI_PAGE_LIMIT,
  P36_AI_TEXT_LIMIT,
  aiExtractionRequestIssue,
  type AiExtractionRequest,
} from "@/domain/medical-document/ai-extraction-policy";
import {
  MEDICAL_OPENAI_DEFAULT_MODEL,
  MEDICAL_OPENAI_RESPONSES_URL,
} from "@/domain/health-intelligence/medical-openai-contract";

const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const LOVABLE_RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const LOVABLE_DEFAULT_MODEL = "openai/gpt-6-astra";
const PROVIDERS = {
  lovable: { url: LOVABLE_RESPONSES_URL, keyEnv: "LOVABLE_API_KEY", models: [LOVABLE_DEFAULT_MODEL] },
  openai: { url: MEDICAL_OPENAI_RESPONSES_URL, keyEnv: "OPENAI_API_KEY", models: [MEDICAL_OPENAI_DEFAULT_MODEL] },
} as const;
type ProviderId = keyof typeof PROVIDERS;
const MAX_OUTPUT_TOKENS = 4000;
const PROVIDER_TIMEOUT_MS = 25_000;
const DEFAULT_RATE_PER_HOUR = 10;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MISSION_ID = new RegExp(`^(mission-[0-9a-f]{32}|${UUID})$`, "i");
const CREW_ID = new RegExp(`^(crew-[0-9a-f]{32}|${UUID})$`, "i");

export interface ExtractionDeps {
  env: (name: string) => string | undefined;
  userId: string;
  /** Existing mission/crew access policy, implemented by the route as the caller (RLS). */
  isAuthorizedScope: (missionId: string, crewMemberId: string) => Promise<boolean>;
  providerFetch: typeof fetch;
  now?: () => number;
  /** Sanitized audit sink; receives no document contents. */
  audit?: (event: Record<string, unknown>) => void;
}

// Best-effort per-isolate sliding-window limiter; not a cross-instance guarantee.
const requestsByUser = new Map<string, number[]>();

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "provider", "model", "suggestions", "warnings"],
  properties: {
    schemaVersion: { type: "string", enum: ["p36.1"] },
    provider: { type: "string" },
    model: { type: "string" },
    warnings: { type: "array", items: { type: "string" }, maxItems: 50 },
    suggestions: {
      type: "array",
      maxItems: 150,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["catalogId", "reportedAnalyte", "value", "reportedUnit", "observedAt", "dateKind", "sourcePage", "evidenceSnippet", "uncertainty"],
        properties: {
          catalogId: { type: "string" },
          reportedAnalyte: { type: "string" },
          value: { type: "number" },
          reportedUnit: { type: "string" },
          observedAt: { type: ["string", "null"] },
          dateKind: { type: "string", enum: ["observation", "collection", "unknown"] },
          sourcePage: { type: "integer" },
          evidenceSnippet: { type: "string" },
          uncertainty: { type: "array", items: { type: "string" }, maxItems: 20 },
        },
      },
    },
  },
} as const;

const INSTRUCTIONS = `You are a medical document extraction assistant for a research prototype. Extract laboratory/health measurements from the supplied document text, produced by a deterministic parser that may be incomplete.
Rules:
- Use ONLY catalog IDs from the supplied catalog list for catalogId; never invent IDs. If an analyte has no exact catalog entry, omit it and explain in warnings.
- value is a single finite number; reportedUnit exactly as printed. Never convert units.
- observedAt: an explicit per-row observation timestamp as strict UTC ISO 8601, otherwise null. A report-level collection date is dateKind "collection" with observedAt null unless a row explicitly carries it. Report dates, accession numbers and reference intervals are never observation times.
- dateKind: "observation" only when the document explicitly states that measurement's observation time; "collection" for specimen collection metadata; otherwise "unknown".
- sourcePage: 1-based page where the evidence appears. evidenceSnippet: exact source text, 3-700 characters.
- uncertainty: list anything ambiguous (identity, units, dates). When unsure, add uncertainty entries instead of guessing.
- Reference intervals, instrument identifiers and report metadata are not results.
- schemaVersion must be "p36.1"; echo your provider and model names.`;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/** Consume a Responses SSE stream server-side; returns assembled text, usage and model. */
async function consumeResponsesStream(
  upstream: Response,
): Promise<{ text: string; usage: unknown; model: string | undefined }> {
  if (!upstream.body) throw new Error("Provider stream unavailable");
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let usage: unknown;
  let model: string | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trim()).join("");
      if (!data || data === "[DONE]") continue;
      let event: { type?: string; delta?: string; response?: { usage?: unknown; model?: string } };
      try { event = JSON.parse(data) as typeof event; } catch { continue; }
      if (event.type === "response.output_text.delta" && typeof event.delta === "string") text += event.delta;
      if (event.type === "response.completed" && event.response) { usage = event.response.usage; model = event.response.model; }
      if (event.type === "response.failed" || event.type === "error") throw new Error("Provider stream failed");
    }
  }
  return { text, usage, model };
}

export async function handleMedicalDocumentExtraction(input: unknown, deps: ExtractionDeps): Promise<Response> {
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers: HEADERS });
  const started = (deps.now ?? Date.now)();
  const audit = (event: Record<string, unknown>) => {
    try { deps.audit?.({ feature: "p36-document-extraction", ...event }); } catch { /* audit never changes outcomes */ }
  };
  // Central configuration gate: default deny when absent.
  if (deps.env("P36_DOCUMENT_AI_ENABLED") !== "true")
    return fail("Document AI extraction is not enabled for this deployment; no data sent", 503);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail("Invalid request", 400);
  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !["missionId", "crewMemberId", "provenance", "domain", "text", "pageCount", "localSummary"].includes(key)))
    return fail("Invalid request", 400);
  const request = input as AiExtractionRequest;
  if (typeof request.missionId !== "string" || !MISSION_ID.test(request.missionId) ||
      typeof request.crewMemberId !== "string" || !CREW_ID.test(request.crewMemberId))
    return fail("Invalid mission or crew scope", 400);
  const issue = aiExtractionRequestIssue(request);
  if (issue) return fail(issue, 400);
  // Real medical documents require a separate, centrally configured authorization.
  if (request.provenance === "real" && deps.env("P36_REAL_DOCUMENT_AI_ENABLED") !== "true")
    return fail("Real medical document AI transfer is not authorized for this deployment; no data sent", 403);
  let authorized = false;
  try {
    authorized = await deps.isAuthorizedScope(request.missionId, request.crewMemberId);
  } catch {
    return fail("Authorization service unavailable; no data sent", 503);
  }
  if (!authorized) return fail("Mission/crew authorization required", 403);
  const nowMs = (deps.now ?? Date.now)();
  const windowStart = nowMs - 3_600_000;
  const limit = Number(deps.env("P36_AI_RATE_PER_HOUR") ?? DEFAULT_RATE_PER_HOUR);
  const recent = (requestsByUser.get(deps.userId) ?? []).filter(at => at > windowStart);
  if (recent.length >= limit) {
    audit({ outcome: "rate_limited", userId: deps.userId, domain: request.domain });
    return Response.json({ error: "AI extraction request rate exhausted; retry later" }, { status: 429, headers: { ...HEADERS, "Retry-After": "600" } });
  }
  recent.push(nowMs);
  requestsByUser.set(deps.userId, recent);
  // Provider allowlist: only approved endpoints/models, credentials server-side only.
  const configured = deps.env("P36_AI_PROVIDER");
  const providerId: ProviderId | null =
    configured === "lovable" || configured === "openai" ? configured
    : configured ? null
    : deps.env("LOVABLE_API_KEY") ? "lovable"
    : deps.env("OPENAI_API_KEY") ? "openai"
    : null;
  if (!providerId) return fail("AI provider is not configured; no data sent", 503);
  const provider = PROVIDERS[providerId];
  const model = deps.env("P36_AI_MODEL") || provider.models[0];
  if (!(provider.models as readonly string[]).includes(model))
    return fail("Configured model is not on the approved allowlist; no data sent", 503);
  const apiKey = deps.env(provider.keyEnv);
  if (!apiKey) return fail("AI provider credentials are not configured; no data sent", 503);
  const profile = MEASUREMENT_PROFILES[request.domain];
  const textSha256 = await sha256Hex(request.text);
  const payload: Record<string, unknown> = {
    model,
    store: false,
    stream: true,
    max_output_tokens: MAX_OUTPUT_TOKENS,
    instructions: INSTRUCTIONS,
    input: JSON.stringify({
      domain: request.domain,
      pageCount: request.pageCount,
      catalog: profile.variables.map(variable => ({ id: variable.id, name: variable.name })),
      localParserSummary: request.localSummary,
      documentText: request.text,
    }),
    text: { format: { type: "json_schema", name: "p36_extraction", strict: true, schema: EXTRACTION_SCHEMA } },
  };
  if (providerId === "lovable") payload["reasoning"] = { effort: "low" };
  try {
    // Invoke with the global receiver: workerd rejects fetch called as a method.
    const upstream = await Reflect.apply(deps.providerFetch, globalThis, [
      provider.url,
      {
        method: "POST",
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      },
    ]);
    if (!upstream.ok) {
      audit({ outcome: "provider_error", status: upstream.status, userId: deps.userId, domain: request.domain, provenance: request.provenance, textSha256, provider: providerId, model, durationMs: (deps.now ?? Date.now)() - started });
      return fail("AI provider request failed; local results retained", upstream.status === 429 ? 429 : 502);
    }
    const assembled = await consumeResponsesStream(upstream);
    let envelope: unknown;
    try {
      envelope = JSON.parse(assembled.text);
    } catch {
      audit({ outcome: "invalid_envelope", userId: deps.userId, domain: request.domain, textSha256, provider: providerId, model });
      return fail("AI response was not valid structured output; rejected", 422);
    }
    const checked = validateExtractionEnvelope(envelope, profile, request.pageCount);
    audit({ outcome: "ok", userId: deps.userId, domain: request.domain, provenance: request.provenance, textSha256, textLength: request.text.length, pageCount: request.pageCount, provider: providerId, model: assembled.model ?? model, suggestions: checked.rows.length, held: checked.rows.filter(row => row.status === "held").length, usage: assembled.usage, durationMs: (deps.now ?? Date.now)() - started });
    return Response.json(
      { rows: checked.rows, errors: checked.errors, provider: providerId, model: assembled.model ?? model },
      { headers: HEADERS },
    );
  } catch {
    audit({ outcome: "provider_outage", userId: deps.userId, domain: request.domain, textSha256, provider: providerId, model, durationMs: (deps.now ?? Date.now)() - started });
    return fail("AI provider unavailable or timed out; local results retained", 502);
  }
}
