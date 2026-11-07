/**
 * P54 server core for the AI-assisted preliminary medical assessment.
 *
 * Default-off (P54_PRELIMINARY_ASSESSMENT_AI_ENABLED must equal "true"),
 * synthetic provenance only, de-identified packet only. The server re-derives
 * every packet status from the bundled verified-reference registry before any
 * provider call, asks the AI only when a verified finding or an approved cited
 * interpretation exists, and re-validates the structured output with the same
 * pure validator the browser uses. Nothing is stored; the result is a
 * preliminary draft that only a Ground Medical clinician can review.
 */
import { classifyMeasurement } from "@/domain/health-intelligence/biomarker-health-assessment";
import {
  ASSESSMENT_SCHEMA_VERSION,
  buildDeterministicAssessment,
  packetPrivacyProblem,
  packetSupportsAiAssessment,
  validateAiAssessment,
  type AssessmentPacket,
  type PreliminaryAssessment,
} from "@/domain/health-intelligence/preliminary-medical-assessment";

export interface AssessmentDeps {
  env: (name: string) => string | undefined;
  /** Injected network function; always invoked with the global receiver (workerd). */
  fetch: typeof fetch;
  now: () => Date;
  userId: string;
  audit?: (event: Record<string, unknown>) => void;
}
export type AssessmentFail = { ok: false; code: "unavailable" | "forbidden" | "invalid" | "integrity" | "rate_limited" | "provider_error"; message: string };
export type AssessmentResult = { ok: true; assessment: PreliminaryAssessment; aiCalled: boolean } | AssessmentFail;

const fail = (code: AssessmentFail["code"], message: string): AssessmentFail => ({ ok: false, code, message });
const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const AI_MODEL = "openai/gpt-6-astra";
const TIMEOUT_MS = 45_000;
const PER_HOUR = 10;
const usage = new Map<string, number[]>();
function allow(userId: string, now: number) {
  const list = (usage.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= PER_HOUR) return false;
  list.push(now);
  usage.set(userId, list);
  return true;
}

const statement = {
  type: "object",
  additionalProperties: false,
  required: ["text", "observationRefs", "citationIds"],
  properties: { text: { type: "string" }, observationRefs: { type: "array", items: { type: "string" } }, citationIds: { type: "array", items: { type: "string" } } },
};
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "abnormalFindings", "physiologicalExplanations", "differentialConsiderations", "crossDomainRelationships", "monitoringRecommendations", "reviewPriorities", "uncertainties", "missingTests"],
  properties: {
    schemaVersion: { type: "string", enum: [ASSESSMENT_SCHEMA_VERSION] },
    abnormalFindings: { type: "array", items: statement },
    physiologicalExplanations: { type: "array", items: statement },
    differentialConsiderations: { type: "array", items: statement },
    crossDomainRelationships: { type: "array", items: statement },
    monitoringRecommendations: { type: "array", items: statement },
    reviewPriorities: { type: "array", items: statement },
    uncertainties: { type: "array", items: { type: "string" } },
    missingTests: { type: "array", items: { type: "string" } },
  },
};

const INSTRUCTIONS = `You prepare a structured PRELIMINARY assessment for a Ground Medical clinician from a de-identified SYNTHETIC evidence packet. It is NOT a diagnosis.
Rules:
- Use only the packet. Never invent patient history, symptoms, medication, specimen, assay method, measurements, numbers or sources.
- Every statement cites the packet observation refs it is based on (observationRefs, e.g. "O1") and, for explanations, differentials and monitoring, the packet citation IDs that support it (citationIds). If no packet citation supports a statement, omit the statement.
- abnormalFindings may list only items whose severity is "red" or "amber". Never call a neutral item abnormal, harmful or concerning, and never treat a numerical increase or decrease as harmful.
- differentialConsiderations are hypotheses only: phrase as "may be consistent with" or "consider", never "confirms", "diagnosed with" or "the astronaut has".
- crossDomainRelationships must cite observations from at least two different domains and describe co-observation, never causation.
- No treatment, dosing or prescriptions. English only.
- If evidence is insufficient, leave sections empty and state the gaps under uncertainties and missingTests.
- schemaVersion must be "${ASSESSMENT_SCHEMA_VERSION}".`;

/** Re-derive every status from the bundled registry; any disagreement fails closed. */
export function packetIntegrityProblem(p: AssessmentPacket, missionId: string): string | null {
  for (const i of p.items) {
    const c = classifyMeasurement({ metricId: i.catalogId, unit: i.unit, domain: i.domain, value: i.value, provenance: p.provenance, missionId });
    const sameNeutral = c.severity === "neutral" && i.severity === "neutral" && c.status === "insufficient_evidence" && i.status === "insufficient_evidence";
    if (!sameNeutral && (c.status !== i.status || c.severity !== i.severity)) return `status of ${i.ref} does not match the verified reference registry`;
  }
  return null;
}

export async function draftPreliminaryAssessmentCore(input: { missionId: string; packet: AssessmentPacket }, deps: AssessmentDeps): Promise<AssessmentResult> {
  const p = input.packet;
  if (deps.env("P54_PRELIMINARY_ASSESSMENT_AI_ENABLED") !== "true")
    return fail("unavailable", "AI-assisted assessment is switched off for this deployment. The offline deterministic assessment remains available.");
  if (p.provenance !== "synthetic")
    return fail("forbidden", "Real crew measurements are never sent to an external AI service: no privacy-preserving workflow is authorized.");
  const privacy = packetPrivacyProblem(p);
  if (privacy) return fail("invalid", `The evidence packet was refused (${privacy}). Nothing was sent.`);
  const integrity = packetIntegrityProblem(p, input.missionId);
  if (integrity) return fail("integrity", `The evidence packet was refused (${integrity}). Nothing was sent.`);
  if (!packetSupportsAiAssessment(p)) {
    deps.audit?.({ feature: "p54-assessment", outcome: "insufficient_evidence", userId: deps.userId, items: p.items.length });
    return { ok: true, assessment: buildDeterministicAssessment(p), aiCalled: false };
  }
  if (!allow(deps.userId, Date.now())) return fail("rate_limited", "Hourly AI assessment limit reached; the offline assessment remains available.");
  const apiKey = deps.env("LOVABLE_API_KEY");
  if (!apiKey) return fail("unavailable", "The AI service is not configured; the offline assessment remains available.");
  const payload = {
    model: AI_MODEL,
    input: [
      { role: "system", content: INSTRUCTIONS },
      { role: "user", content: JSON.stringify(p) },
    ],
    text: { format: { type: "json_schema", name: "p54_preliminary_assessment", strict: true, schema: SCHEMA } },
    reasoning: { effort: "low" },
    store: false,
    max_output_tokens: 6000,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let text: string;
  let status = 0;
  try {
    const res: Response = await Reflect.apply(deps.fetch, globalThis, [
      RESPONSES_URL,
      { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "X-Lovable-AIG-SDK": "fetch" }, body: JSON.stringify(payload) },
    ]);
    status = res.status;
    text = await res.text();
    if (!res.ok) {
      deps.audit?.({ feature: "p54-assessment", outcome: "provider_error", status, userId: deps.userId });
      return fail(status === 429 ? "rate_limited" : status === 402 ? "unavailable" : "provider_error", status === 402 ? "AI credits are exhausted; the offline assessment remains available." : "The AI service did not answer; the offline assessment remains available.");
    }
  } catch {
    deps.audit?.({ feature: "p54-assessment", outcome: "network_error", userId: deps.userId });
    return fail("provider_error", "The AI service could not be reached; the offline assessment remains available.");
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
    return fail("integrity", "The AI response was malformed and was rejected; nothing was drafted.");
  }
  const result = validateAiAssessment(parsed, p, model);
  if ("invalid" in result) return fail("integrity", result.invalid);
  deps.audit?.({ feature: "p54-assessment", outcome: "ok", userId: deps.userId, model, items: p.items.length, rejected: result.rejected.length });
  return { ok: true, assessment: result, aiCalled: true };
}
