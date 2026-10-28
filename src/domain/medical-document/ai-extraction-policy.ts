/** P36 shared hybrid-extraction policy. Browser-safe; no secrets, no provider calls. */
import type { MeasurementDomainId } from "@/domain/health-measurements/profiles";

export const P36_AI_ENDPOINT = "/api/medical-document-extraction";
/** Bounded representation sent to the server; never the original file. */
export const P36_AI_TEXT_LIMIT = 20_000;
export const P36_AI_PAGE_LIMIT = 12;

export type AiExtractionRequest = {
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
  domain: MeasurementDomainId;
  text: string;
  pageCount: number;
  localSummary: { matched: number; held: number; rejected: number };
};

/** Local parsing is incomplete, uncertain or empty → automatic AI assistance. */
export function needsAiAssistance(summary: { matched: number; held: number; rejected: number }): boolean {
  return summary.matched === 0 || summary.held > 0 || summary.rejected > 0;
}

/** Client-side request bounds, mirrored exactly by the server endpoint. */
export function aiExtractionRequestIssue(input: AiExtractionRequest): string | null {
  if (!input.missionId.trim() || !input.crewMemberId.trim()) return "Mission and crew scope are required.";
  if (input.provenance !== "synthetic" && input.provenance !== "real") return "Provenance must be explicit.";
  if (!["bone", "immune", "cardiovascular", "behavioral"].includes(input.domain)) return "Unknown health domain.";
  if (!input.text.trim()) return "No extracted text to analyze.";
  if (input.text.length > P36_AI_TEXT_LIMIT) return `Extracted text exceeds ${P36_AI_TEXT_LIMIT} characters.`;
  if (!Number.isInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > P36_AI_PAGE_LIMIT)
    return `Page count must be 1–${P36_AI_PAGE_LIMIT}.`;
  return null;
}
