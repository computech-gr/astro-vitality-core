/**
 * P71 display-only Researcher wording (pure, browser-safe).
 *
 * The visible application never shows the scientific reviewer's personal name
 * (Latin or Greek forms); it shows the role "Researcher" instead. Stored data,
 * source handbooks, provenance, hashes, status identifiers (for example the
 * internal gate PENDING_NIKOLAS_REVIEW) and history are never rewritten — only
 * the text handed to the screen or an export changes. Generated health reports
 * keep their own redaction in health-intelligence/report-identity-redaction.ts.
 */
const NAME = "(?:nikolaos|nikolas|nickolas|nicholas|νικόλαος|νικολαος|νικόλας|νικολας)";
const ANY = new RegExp(NAME, "iu");
const STATUS = /PENDING_NIKOLAS_REVIEW/g;
const DISPLAY_STATUS = "PENDING_SCIENTIFIC_REVIEW";
const POSSESSIVE = new RegExp(`(?<![\\p{L}\\d])${NAME}(?:'s|’s|'|’)(?![\\p{L}\\d])`, "giu");
const IDENT = new RegExp(`(?<=[-_./:])${NAME}|${NAME}(?=[-_./:][\\p{L}\\d])`, "giu");
const WORD = new RegExp(`(?<![\\p{L}\\d])${NAME}(?![\\p{L}\\d])`, "giu");

export function containsReviewerName(text: string): boolean {
  return ANY.test(text);
}

function sentenceStart(text: string, offset: number): boolean {
  const before = text.slice(0, offset).trimEnd();
  return before === "" || /[.!?:]$/.test(before);
}

/** Replaces the personal name with Researcher wording for display only. */
export function researcherDisplayText(text: string): string {
  if (!ANY.test(text)) return text;
  return text
    .replace(STATUS, DISPLAY_STATUS)
    .replace(POSSESSIVE, (_m, offset: number, whole: string) => (sentenceStart(whole, offset) ? "The Researcher's" : "the Researcher's"))
    .replace(IDENT, (m) => (m === m.toUpperCase() ? "RESEARCHER" : "researcher"))
    .replace(WORD, "Researcher");
}

/** Display form of a scientific status identifier; the stored identifier is unchanged. */
export function researcherDisplayStatus(status: string): string {
  return status.replace(STATUS, DISPLAY_STATUS);
}
