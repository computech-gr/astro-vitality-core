/**
 * P58 server core: AI-assisted elaboration of the deterministic preliminary
 * clinical assessment.
 *
 * Default-off (P58_CLINICAL_REASONING_AI_ENABLED must equal "true"), synthetic
 * provenance only, de-identified packet only. The packet's concerns must be
 * patterns of the bundled concern library and cite only that pattern's exact
 * catalog IDs. The AI may only elaborate those concerns; its output is
 * re-validated with the same pure validator the browser uses and can never
 * change criteria status, priority or classification. Nothing is stored.
 */
import {
  CLINICAL_AI_SCHEMA_VERSION,
  bundledConcernLibrary,
  clinicalPacketPrivacyProblem,
  validateClinicalAi,
  type ClinicalAiOutput,
  type ClinicalPacket,
} from "@/domain/health-intelligence/p58-clinical-reasoning";
import { RECOMMENDATION_CATEGORIES } from "@/domain/health-intelligence/p56-pattern-library";

export interface ClinicalAiDeps {
  env: (name: string) => string | undefined;
  /** Injected network function; always invoked with the global receiver (workerd). */
  fetch: typeof fetch;
  userId: string;
  audit?: (event: Record<string, unknown>) => void;
}
export type ClinicalAiFail = { ok: false; code: "unavailable" | "forbidden" | "invalid" | "integrity" | "rate_limited" | "provider_error"; message: string };
export type ClinicalAiResult = { ok: true; output: ClinicalAiOutput; rejected: { section: string; text: string; reason: string }[]; model: string } | ClinicalAiFail;

const fail = (code: ClinicalAiFail["code"], message: string): ClinicalAiFail => ({ ok: false, code, message });
const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const AI_MODEL = "openai/gpt-6-astra";
const TIMEOUT_MS = 60_000;
const PER_HOUR = 10;
const usage = new Map<string, number[]>();
function allow(userId: string, now: number) {
  const list = (usage.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= PER_HOUR) return false;
  list.push(now);
  usage.set(userId, list);
  return true;
}

const strs = { type: "array", items: { type: "string" } };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "concerns", "crossDomain", "lifestyle", "uncertainties"],
  properties: {
    schemaVersion: { type: "string", enum: [CLINICAL_AI_SCHEMA_VERSION] },
    concerns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["concernId", "explanation", "supporting", "contradicting", "alternatives", "missingInformation", "confirmationSteps"],
        properties: { concernId: { type: "string" }, explanation: { type: "string" }, supporting: strs, contradicting: strs, alternatives: strs, missingInformation: strs, confirmationSteps: strs },
      },
    },
    crossDomain: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "observationRefs"], properties: { text: { type: "string" }, observationRefs: strs } } },
    lifestyle: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["concernId", "category", "text"], properties: { concernId: { type: "string" }, category: { type: "string", enum: RECOMMENDATION_CATEGORIES.filter((c) => c !== "ground_medical" && c !== "further_examination") }, text: { type: "string" } } },
    },
    uncertainties: strs,
  },
};

const INSTRUCTIONS = `You assist a Ground Medical clinician by elaborating a PRELIMINARY clinical assessment from a de-identified SYNTHETIC evidence packet. It is NOT a diagnosis.
Rules:
- Elaborate only the concerns listed in the packet (use their exact concernId). Do not add new concerns.
- Use only the packet: the series values, review flags, criteria status and missing information. Never invent history, symptoms, medication, examinations, measurements, numbers or sources. Only use numbers that appear in the packet.
- Explain the physiology in clear English for a clinician: what happened, why it matters, how markers relate, what could explain it otherwise, which information is missing and how it can be confirmed.
- Never state a confirmed diagnosis, a probability, a likelihood percentage or a confidence score. Use "may", "could be consistent with", "consider".
- Never change or reinterpret the criteria status: a criterion marked "Not evaluable" was not applied.
- No treatment, medication, supplements, doses or prescriptions.
- crossDomain statements must cite observation refs (e.g. "O1") from at least two different domains and describe co-occurrence, never causation.
- lifestyle notes are general wellness guidance only, linked to a listed concern. For electrolyte concerns give no hydration or diet advice.
- schemaVersion must be "${CLINICAL_AI_SCHEMA_VERSION}".`;

/** Structural integrity: concerns must be library patterns citing only their own exact catalog IDs. */
export function clinicalPacketIntegrityProblem(p: ClinicalPacket): string | null {
  const lib = bundledConcernLibrary();
  const items = new Map(p.items.map((i) => [i.ref, i]));
  if (items.size !== p.items.length) return "duplicate observation refs";
  if (!p.concerns.length) return "no concern to elaborate";
  for (const c of p.concerns) {
    const pattern = lib.concerns.find((x) => x.id === c.id);
    if (!pattern) return `concern ${c.id} is not in the governed library`;
    for (const ref of c.observationRefs) {
      const item = items.get(ref);
      if (!item) return `concern ${c.id} cites an unknown observation`;
      if (!pattern.markers.includes(item.catalogId)) return `concern ${c.id} cites ${item.catalogId}, which is not one of its markers`;
    }
  }
  return null;
}

export async function elaborateClinicalAssessmentCore(input: { packet: ClinicalPacket }, deps: ClinicalAiDeps): Promise<ClinicalAiResult> {
  const p = input.packet;
  if (deps.env("P58_CLINICAL_REASONING_AI_ENABLED") !== "true")
    return fail("unavailable", "AI-assisted clinical reasoning is switched off for this deployment. The deterministic clinical reasoning engine produced the assessment.");
  if (p.provenance !== "synthetic") return fail("forbidden", "Real crew measurements are never sent to an external AI service.");
  const privacy = clinicalPacketPrivacyProblem(p);
  if (privacy) return fail("invalid", `The evidence packet was refused (${privacy}). Nothing was sent.`);
  const integrity = clinicalPacketIntegrityProblem(p);
  if (integrity) return fail("integrity", `The evidence packet was refused (${integrity}). Nothing was sent.`);
  if (!allow(deps.userId, Date.now())) return fail("rate_limited", "Hourly AI limit reached; the deterministic assessment remains available.");
  const apiKey = deps.env("LOVABLE_API_KEY");
  if (!apiKey) return fail("unavailable", "The AI service is not configured; the deterministic assessment remains available.");
  const payload = {
    model: AI_MODEL,
    input: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: JSON.stringify(p) },
    ],
    text: { format: { type: "json_schema", name: "p58_clinical_reasoning", strict: true, schema: SCHEMA } },
    reasoning: { effort: "low" },
    store: false,
    max_output_tokens: 8000,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let text: string;
  try {
    const res: Response = await Reflect.apply(deps.fetch, globalThis, [
      RESPONSES_URL,
      { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "X-Lovable-AIG-SDK": "fetch" }, body: JSON.stringify(payload) },
    ]);
    text = await res.text();
    if (!res.ok) {
      deps.audit?.({ feature: "p58-clinical", outcome: "provider_error", status: res.status, userId: deps.userId });
      return fail(res.status === 429 ? "rate_limited" : res.status === 402 ? "unavailable" : "provider_error", res.status === 402 ? "AI credits are exhausted; the deterministic assessment remains available." : "The AI service did not answer; the deterministic assessment remains available.");
    }
  } catch {
    deps.audit?.({ feature: "p58-clinical", outcome: "network_error", userId: deps.userId });
    return fail("provider_error", "The AI service could not be reached; the deterministic assessment remains available.");
  } finally {
    clearTimeout(timer);
  }
  let parsed: unknown;
  let model = AI_MODEL;
  try {
    const body = JSON.parse(text) as { model?: string; output?: { content?: { type?: string; text?: string }[] }[] };
    model = body.model ?? AI_MODEL;
    parsed = JSON.parse((body.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "");
  } catch {
    return fail("integrity", "The AI response was malformed and was rejected.");
  }
  const result = validateClinicalAi(parsed, p);
  if (!result.ok) return fail("integrity", result.reason);
  deps.audit?.({ feature: "p58-clinical", outcome: "ok", userId: deps.userId, model, concerns: p.concerns.length, rejected: result.rejected.length });
  return { ok: true, output: result.output, rejected: result.rejected, model };
}
