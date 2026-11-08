/**
 * P56 — report identity redaction (pure).
 *
 * The scientific reviewer's personal name (Greek "Νικόλας"/"Νικόλαος" and its
 * English transliterations) must never appear in generated health-report text
 * or exported report files. Governance status codes keep their meaning
 * ("PENDING_NIKOLAS_REVIEW" is displayed as "PENDING_SCIENTIFIC_REVIEW");
 * stored records and audit history are never rewritten — this only changes
 * the text that is rendered or exported.
 */
const NAME = "(?:nikolaos|nikolas|nickolas|nicholas|nikola|νικόλαος|νικολαος|νικόλας|νικολας|νικόλα)";
const EMAIL = new RegExp(`[\\p{L}\\d._%+-]*${NAME}[\\p{L}\\d._%+-]*@[\\p{L}\\d.-]+`, "giu");
const IDENT = new RegExp(`(?<=[-_./])${NAME}|${NAME}(?=[-_./])`, "giu");
const WORD = new RegExp(`(?<![\\p{L}\\d])${NAME}(?![\\p{L}\\d])`, "giu");
const ANY = new RegExp(NAME, "iu");

export function containsProhibitedName(text: string): boolean {
  return ANY.test(text);
}

/** Display-only replacement of the prohibited name in report text. */
export function redactProhibitedNames(text: string): string {
  if (!ANY.test(text)) return text;
  return text
    .replace(/PENDING_NIKOLAS_REVIEW/g, "PENDING_SCIENTIFIC_REVIEW")
    .replace(EMAIL, "[reviewer e-mail withheld]")
    .replace(new RegExp(`\\s*\\(${NAME}\\)`, "giu"), "")
    .replace(new RegExp(`${NAME}-governed`, "giu"), "Governed")
    .replace(IDENT, (m) => (m === m.toUpperCase() ? "SCIENTIFIC" : "scientific"))
    .replace(WORD, "the scientific reviewer");
}

/**
 * Astronaut identity for the report header: only the selected crew member's
 * authorized display name. A display name that itself contains the prohibited
 * name is withheld rather than altered.
 */
export function reportAstronautName(crewDisplayName: string | null | undefined): string {
  const name = crewDisplayName?.trim();
  if (!name) return "Crew identity unavailable";
  return containsProhibitedName(name) ? "Crew member (display name withheld)" : name;
}
