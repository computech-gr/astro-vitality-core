/** P36 hybrid extraction: deterministic local parsing first, automatic server-side
 * AI assistance when local results are incomplete, uncertain or empty. AI output is
 * an untrusted suggestion layer: every row is re-validated against the domain
 * catalog, merged without overwriting deterministic results, and stays unchecked
 * until a human verifies and explicitly saves. Nothing here persists anything. */
import { MEASUREMENT_PROFILES, type MeasurementProfile } from "@/domain/health-measurements/profiles";
import { processBoneFile, type FileReview, type ReviewRow } from "@/domain/bone-health/file-queue";
import { isBoneSharedObservationTimestamp } from "@/domain/bone-health/review-selection";
import {
  validateExtractionEnvelope,
  type CheckedSuggestion,
} from "./ai-extraction-contract";
import {
  P36_AI_ENDPOINT,
  P36_AI_TEXT_LIMIT,
  aiExtractionRequestIssue,
  needsAiAssistance,
  type AiExtractionRequest,
} from "./ai-extraction-policy";

export type AiAssistResult =
  | { status: "ok"; rows: CheckedSuggestion[]; errors: string[]; provider: string; model: string }
  | { status: "unavailable"; reason: string }
  | { status: "denied"; reason: string };

export type AiAssistInput = {
  text: string;
  pageCount: number;
  localSummary: { matched: number; held: number; rejected: number };
  signal: AbortSignal;
};
export type AiAssist = (input: AiAssistInput) => Promise<AiAssistResult>;

/** Calls the authenticated server endpoint. The server re-validates; the client
 * validates again here because provider output never becomes trusted by transit. */
export async function requestAiExtraction(
  request: AiExtractionRequest,
  deps: { accessToken: string; signal?: AbortSignal; fetchImpl?: typeof fetch },
): Promise<AiAssistResult> {
  const issue = aiExtractionRequestIssue(request);
  if (issue) return { status: "unavailable", reason: issue };
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await Reflect.apply(fetchImpl, globalThis, [
      P36_AI_ENDPOINT,
      {
        method: "POST",
        signal: deps.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deps.accessToken}`,
        },
        body: JSON.stringify(request),
      },
    ]);
  } catch (error) {
    if (deps.signal?.aborted) throw error;
    return { status: "unavailable", reason: "Network or offline; AI extraction endpoint unreachable." };
  }
  let body: { rows?: unknown; errors?: unknown; provider?: unknown; model?: unknown; error?: unknown };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { status: "unavailable", reason: `Endpoint returned an invalid response (HTTP ${response.status}).` };
  }
  if (response.status === 401 || response.status === 403)
    return { status: "denied", reason: typeof body.error === "string" ? body.error : "Not authorized for AI extraction." };
  if (!response.ok)
    return { status: "unavailable", reason: typeof body.error === "string" ? body.error : `HTTP ${response.status}.` };
  // Re-validate the server response against this domain's catalog before any merge.
  const profile = requestProfile(request);
  const checked = validateExtractionEnvelope(
    { schemaVersion: "p36.1", provider: body.provider, model: body.model, suggestions: body.rows, warnings: [] },
    profile,
    request.pageCount,
  );
  return {
    status: "ok",
    rows: checked.rows,
    errors: [...(Array.isArray(body.errors) ? body.errors.filter((e): e is string => typeof e === "string") : []), ...checked.errors],
    provider: typeof body.provider === "string" ? body.provider : "unknown",
    model: typeof body.model === "string" ? body.model : "unknown",
  };
}

function requestProfile(request: AiExtractionRequest): MeasurementProfile {
  return MEASUREMENT_PROFILES[request.domain];
}

export type AiMerge = { added: ReviewRow[]; heldMessages: string[]; duplicates: number };

/** Merge validated AI suggestions into local review rows. Evidence-keyed dedupe;
 * conflicts with deterministic results are held, never overwritten. */
export function mergeAiSuggestions(
  localRows: ReviewRow[],
  checked: CheckedSuggestion[],
  profile: MeasurementProfile,
  sourceName: string,
): AiMerge {
  const added: ReviewRow[] = [];
  const heldMessages: string[] = [];
  let duplicates = 0;
  const keyOf = (variableId: string, value: number, unit: string) =>
    `${variableId.toLowerCase()}|${value}|${unit.trim().toLowerCase()}`;
  const localKeys = new Map(localRows.map(row => [keyOf(row.variableId, row.value, row.unit), row]));
  const localByVariable = new Map<string, ReviewRow[]>();
  for (const row of localRows) {
    const list = localByVariable.get(row.variableId.toLowerCase()) ?? [];
    list.push(row);
    localByVariable.set(row.variableId.toLowerCase(), list);
  }
  const seenAi = new Set<string>();
  for (const row of checked) {
    const label = `AI suggestion "${row.reportedAnalyte}" (${row.catalogId}, page ${row.sourcePage})`;
    // A missing observation date is the normal review state (deterministic rows
    // also arrive without dates; humans confirm them). Only other hold reasons
    // keep the row out of the review table.
    const dateOnlyHold = row.reasons.length === 1 && row.reasons[0] === "Observation date requires manual confirmation";
    if (row.status === "held" && !dateOnlyHold) {
      heldMessages.push(`Held for manual review (${label}): ${row.reasons.join("; ")} — "${row.evidenceSnippet.slice(0, 120)}"`);
      continue;
    }
    const key = keyOf(row.catalogId, row.value, row.reportedUnit);
    if (seenAi.has(key) || localKeys.has(key)) { duplicates++; continue; }
    seenAi.add(key);
    const siblings = localByVariable.get(row.catalogId.toLowerCase()) ?? [];
    if (siblings.some(local => local.value !== row.value || local.unit.trim().toLowerCase() !== row.reportedUnit.trim().toLowerCase())) {
      heldMessages.push(`Held for manual review (${label}): conflicts with a deterministic result for ${row.catalogId}; the local value was kept — "${row.evidenceSnippet.slice(0, 120)}"`);
      continue;
    }
    // A collection/report date is never promoted to an observation instant.
    const observedAt = row.dateKind === "observation" && row.observedAt && isBoneSharedObservationTimestamp(row.observedAt)
      ? row.observedAt
      : "";
    const caveats: string[] = [];
    if (row.dateKind === "collection" && row.observedAt)
      caveats.push(`Reported collection time ${row.observedAt} is document metadata, not a confirmed observation time.`);
    if (row.dateKind !== "observation") caveats.push("Observation date requires manual confirmation.");
    added.push({
      id: crypto.randomUUID(),
      variableId: row.catalogId,
      value: row.value,
      unit: row.reportedUnit,
      observedAt,
      sourceLabel: sourceName,
      specimen: "",
      assayMethod: "",
      notes: [`AI-assisted suggestion; verify against the original report. Evidence (page ${row.sourcePage}): "${row.evidenceSnippet.slice(0, 300)}"`, ...caveats].join(" "),
      selected: false,
      rawLine: row.evidenceSnippet,
      reviewRequired: true,
      page: row.sourcePage,
      provenance: "ai",
    });
  }
  return { added, heldMessages, duplicates };
}

/** Shared one-pass pipeline for all four domains: local parse, then automatic AI
 * assistance when incomplete. AI failure never fails the file or discards local
 * results; it is reported visibly instead. */
export async function processBoneFileWithAi(
  file: File,
  signal: AbortSignal,
  profile: MeasurementProfile,
  aiAssist?: AiAssist,
): Promise<FileReview> {
  const review = await processBoneFile(file, signal, profile);
  const localSummary = {
    matched: review.rows.length,
    held: review.diagnostics?.held ?? 0,
    rejected: review.diagnostics?.rejected ?? 0,
  };
  if (!aiAssist || !needsAiAssistance(localSummary)) return review;
  signal.throwIfAborted();
  let ai: AiAssistResult;
  try {
    ai = await aiAssist({ text: review.text.slice(0, P36_AI_TEXT_LIMIT), pageCount: review.diagnostics?.pages ?? 1, localSummary, signal });
  } catch (error) {
    if (signal.aborted) throw error;
    return { ...review, aiStatus: "AI-assisted extraction failed; local results and held rows retained." };
  }
  signal.throwIfAborted();
  if (ai.status === "denied")
    return { ...review, aiStatus: `AI-assisted extraction not authorized: ${ai.reason} Local results and held rows retained.` };
  if (ai.status === "unavailable")
    return { ...review, aiStatus: `AI-assisted extraction unavailable: ${ai.reason} Local results and held rows retained.` };
  const merge = mergeAiSuggestions(review.rows, ai.rows, profile, file.name);
  const parts = [
    `AI-assisted extraction (${ai.provider}/${ai.model}): ${merge.added.length} unchecked suggestion(s) added`,
    merge.duplicates ? `${merge.duplicates} duplicate(s) skipped` : "",
    merge.heldMessages.length ? `${merge.heldMessages.length} held for manual review` : "",
  ].filter(Boolean).join(", ");
  return {
    ...review,
    rows: [...review.rows, ...merge.added],
    errors: [...review.errors, ...ai.errors, ...merge.heldMessages],
    aiStatus: `${parts}. AI output is never saved automatically; verify every value, unit, date and source against the original report.`,
  };
}
