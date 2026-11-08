/**
 * P57.1 — additional guard for AI explanatory text (pure).
 *
 * Complements validateClinicalAi (p58-clinical-reasoning.ts), which already rejects new numbers,
 * confirmed diagnoses, probabilities, invented history and treatment language. This guard adds:
 *   - citations (DOI, PMID, URL, "et al.", "(2019)") not present in the evidence packet,
 *   - reference-range / threshold / abnormality language when no approved criterion was applied,
 *   - colour or status words that would contradict the deterministic classification,
 *   - any claim to approve, validate or activate a criterion.
 * Failing statements are dropped with a reason; nothing is rewritten.
 */

export interface ClaimContext {
  /** Citation strings present in the packet (DOIs, URLs, source titles) — the only ones the AI may repeat. */
  allowedCitations: readonly string[];
  /** True only when at least one Researcher-approved criterion was used for a classification in this packet. */
  approvedCriterionApplied: boolean;
  /** Deterministic clinical classes present in the packet. */
  clinicalClasses: readonly ("RED" | "AMBER" | "NORMAL" | "NEUTRAL")[];
}

const DOI = /\b10\.\d{4,9}\/[^\s"'<>]+/gi;
const URL = /\bhttps?:\/\/[^\s"'<>]+/gi;
const PMID = /\bPMID:?\s*\d{5,9}\b/i;
const ETAL = /\bet al\.?/i;
const YEAR_CITE = /\(\s*(?:19|20)\d{2}[a-z]?\s*\)/;
const THRESHOLD = /\b(?:reference (?:range|interval)|normal (?:range|limits?|values?)|upper limit of normal|lower limit of normal|cut-?off|threshold|out of range|outside (?:the )?(?:normal|reference)|abnormal(?:ly)?|elevated above normal|below normal)\b/i;
// Status wording only ("is red", "classified as critical"), so "red blood cells" is not caught.
const STATUS_WORDS = /\b(?:is|are|marked|classified|flagged|shown)\s+(?:as\s+)?(?:red|amber|critical)\b|\bpanic value\b|\balarming\b|\bdangerous(?:ly)?\b/i;
const APPROVAL = /\b(?:i|we|this (?:analysis|assessment|ai))\s+(?:approve|validate|activate|certif(?:y|ies))\b|\bcriteri(?:on|a) (?:is|are|has been|have been) (?:now )?(?:approved|validated|activated)\b/i;
const DIAGNOSIS = /\b(?:has|have|is suffering from|diagnosed with|diagnosis of|confirms?|confirmed)\s+(?:a |an )?(?:hyper|hypo|diabetes|anaemia|anemia|osteoporosis|infection|sepsis|kidney disease|ckd|hypertension)/i;

export function aiClaimProblem(text: string, ctx: ClaimContext): string | null {
  const t = text.trim();
  const allowed = ctx.allowedCitations.map((x) => x.toLowerCase());
  const cites = [...(t.match(DOI) ?? []), ...(t.match(URL) ?? [])].map((x) => x.replace(/[).,;]+$/, "").toLowerCase());
  if (cites.some((c) => !allowed.some((a) => a.includes(c) || c.includes(a)))) return "cites a source that is not in the evidence packet";
  if (PMID.test(t) || ETAL.test(t) || YEAR_CITE.test(t)) return "uses citation formatting not backed by the evidence packet";
  if (APPROVAL.test(t)) return "claims to approve, validate or activate a criterion";
  if (DIAGNOSIS.test(t)) return "states or implies a definitive diagnosis";
  if (!ctx.approvedCriterionApplied && THRESHOLD.test(t)) return "uses reference-range or threshold language although no approved criterion was applied";
  if (STATUS_WORDS.test(t) && !ctx.clinicalClasses.some((c) => c === "RED" || c === "AMBER")) return "uses clinical status or alarm wording that contradicts the deterministic classification";
  return null;
}

/** Filter a list of AI statements; returns kept statements and rejections with reasons. */
export function guardAiStatements(texts: readonly string[], ctx: ClaimContext): { kept: string[]; rejected: { text: string; reason: string }[] } {
  const kept: string[] = [];
  const rejected: { text: string; reason: string }[] = [];
  for (const t of texts) {
    const why = aiClaimProblem(t, ctx);
    if (why) rejected.push({ text: t.slice(0, 240), reason: why });
    else kept.push(t);
  }
  return { kept, rejected };
}
