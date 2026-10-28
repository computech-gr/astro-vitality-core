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

/** A single explicitly labelled specimen collection timestamp may prefill the
 * editable observation field for measurements belonging to that specimen.
 * Never use issued/reported/printed dates, ambiguous times or the current time. */
export function explicitSharedCollectionTimestamp(text: string): string | null {
  const dates = [...text.matchAll(/\b(?:SPECIMEN\s+)?COLLECTION\s+DATE\s*[:-]?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/gi)];
  const times = [...text.matchAll(/\bCOLLECTION\s+TIME\s*[:-]?\s*([01]?\d|2[0-3]):([0-5]\d)\s*(UTC|GMT)\b/gi)];
  if (dates.length !== 1 || times.length !== 1) return null;
  const date = dates[0]!; const time = times[0]!;
  const month = ["january","february","march","april","may","june","july","august","september","october","november","december"].indexOf(date[2]!.toLowerCase());
  const day = Number(date[1]); const year = Number(date[3]);
  const candidate = new Date(Date.UTC(year, month, day, Number(time[1]), Number(time[2])));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month || candidate.getUTCDate() !== day) return null;
  return candidate.toISOString().replace(".000Z", "Z");
}

/** PDF geometry reconstruction is optimized for analyte rows, not two-column
 * header metadata. Read the original selectable PDF text items independently,
 * locally, if the reconstructed review text lost the collection header. No
 * provider call, no upload, no persistence. */
export async function sourceCollectionTimestamp(file: File, reviewText: string, signal: AbortSignal): Promise<string | null> {
  const geometryTimestamp = explicitSharedCollectionTimestamp(reviewText);
  if (!/\.pdf$/i.test(file.name)) return geometryTimestamp;
  try {
    signal.throwIfAborted();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await file.arrayBuffer();
    signal.throwIfAborted();
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
    try {
      const document = await task.promise;
      if (document.numPages > 12) return null;
      const parts: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
        signal.throwIfAborted();
        const content = await (await document.getPage(pageNumber)).getTextContent();
        parts.push(content.items.filter((item): item is typeof item & {str: string} => "str" in item).map(item => item.str).join(" "));
      }
      const rawTimestamp = explicitSharedCollectionTimestamp(parts.join("\n"));
      // A conflicting interpretation must not be silently promoted to a measurement date.
      if (geometryTimestamp && rawTimestamp && geometryTimestamp !== rawTimestamp) return null;
      return rawTimestamp ?? geometryTimestamp;
    } finally { await task.destroy(); }
  } catch (error) {
    if (signal.aborted) throw error;
    return geometryTimestamp;
  }
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

/** Apply one unambiguous source collection instant to eligible AI suggestions.
 * This is an editable proposal, not a verified clinical observation or save.
 * A row with a conflicting explicit date or AI uncertainty is never modified. */
export function prefillSharedCollectionDate(
  added: ReviewRow[], checked: CheckedSuggestion[], sharedCollection: string | null,
): ReviewRow[] {
  if (!sharedCollection || !isBoneSharedObservationTimestamp(sharedCollection)) return added;
  const byId = new Map<string, CheckedSuggestion[]>();
  for (const suggestion of checked) {
    const list = byId.get(suggestion.catalogId) ?? [];
    list.push(suggestion);
    byId.set(suggestion.catalogId, list);
  }
  return added.map(row => {
    if (row.observedAt || row.saved || row.provenance !== "ai") return row;
    const candidates = (byId.get(row.variableId) ?? []).filter(s => s.value === row.value && s.reportedUnit === row.unit);
    if (candidates.length !== 1) return row;
    const candidate = candidates[0]!;
    if (candidate.uncertainty.length || candidate.reasons.some(reason => reason !== "Observation date requires manual confirmation")) return row;
    if (candidate.observedAt && candidate.observedAt !== sharedCollection) return row;
    return {
      ...row, observedAt: sharedCollection, selected: false,
      notes: `${row.notes} Editable observation time proposed from the report's explicitly labelled shared specimen collection timestamp (${sharedCollection}); verify applicability before saving.`,
    };
  });
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
    return { ...review, aiStatus: `AI-assisted extraction unavailable: ${ai.reason} Deployment administrator: check P36_DOCUMENT_AI_ENABLED, P36_AI_PROVIDER and server-side provider credentials. Local results and held rows retained.` };
  const merge = mergeAiSuggestions(review.rows, ai.rows, profile, file.name);
  const sharedCollection = await sourceCollectionTimestamp(file, review.text, signal);
  // P36.3: use independently verified source-document metadata rather than
  // trusting the AI provider to assign dateKind="collection" to every analyte.
  // Explicit conflicting row timestamps remain untouched; no report/issue dates
  // or unlabelled timestamps can supply this fallback.
  const datedRows = prefillSharedCollectionDate(merge.added, ai.rows, sharedCollection);
  const parts = [
    `AI-assisted extraction (${ai.provider}/${ai.model}): ${merge.added.length} unchecked suggestion(s) added`,
    merge.duplicates ? `${merge.duplicates} duplicate(s) skipped` : "",
    merge.heldMessages.length ? `${merge.heldMessages.length} held for manual review` : "",
  ].filter(Boolean).join(", ");
  return {
    ...review,
    rows: [...review.rows, ...datedRows],
    errors: [...review.errors, ...ai.errors, ...merge.heldMessages],
    aiStatus: `${parts}. AI output is never saved automatically; verify every value, unit, date and source against the original report.`,
  };
}
