/**
 * P41.1 — scientific relevance of retrieved literature (pure, browser-safe).
 *
 * Three separate questions are kept apart:
 *  1. Bibliographic existence — did the provider confirm the record? (EvidenceReference.existence)
 *  2. Scientific relevance — does the inspected title/abstract actually study
 *     THIS biomarker, measured, in a relevant population? (this module)
 *  3. Claim-level support — does a quoted excerpt support one draft claim?
 *     (verifyDraftClaims + Researcher review; never decided here)
 *
 * Relevance is deterministic and conservative. A provider keyword hit, a
 * partial abbreviation (e.g. "CSF" for "G-CSF") or the keyword "spaceflight"
 * tag never establishes relevance. Only "relevant" references may enter
 * automatic (batch) AI drafting; "potentially relevant" ones need an explicit
 * Researcher selection; "irrelevant" and "insufficient information" ones are
 * never sent to the AI. Nothing here approves an interpretation.
 */
import type { EvidenceReference, LiteratureConcept } from "./interpretation-evidence";

export type RelevanceClass = "relevant" | "potentially_relevant" | "irrelevant" | "insufficient_information";
export type StudyPopulation = "human" | "animal" | "in_vitro" | "unstated";

export interface RelevanceAssessment {
  refId: string;
  classification: RelevanceClass;
  /** Short reason grounded in the inspected title/abstract (quotes source text where possible). */
  reason: string;
  signals: {
    /** Exact biomarker terms (label, aliases or a long form defined in the text) found. */
    identityTerms: string[];
    inTitle: boolean;
    mentionSentences: number;
    measuredInSource: boolean;
    administeredAsIntervention: boolean;
    population: StudyPopulation[];
    specimen: string[];
    assay: string[];
    /** A spaceflight/analog keyword occurs — reported only, never used as relevance. */
    spaceflightKeyword: boolean;
  };
}

export const RELEVANCE_LABELS: Record<RelevanceClass, string> = {
  relevant: "Relevant",
  potentially_relevant: "Potentially relevant — manual review required",
  irrelevant: "Irrelevant",
  insufficient_information: "Insufficient information",
};

export const INSUFFICIENT_RELEVANT_EVIDENCE = "Insufficient relevant scientific evidence";

// ------------------------------------------------------------ text helpers

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const looseForm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\u2010-\u2015-]/g, " ").replace(/\s+/g, " ").trim();
const clip = (s: string, n = 170) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** Abbreviation-like terms (G-CSF, IL-6, CRP) are matched case-sensitively; names case-insensitively. */
function termRegex(term: string): RegExp {
  const t = term.trim();
  const upper = (t.match(/[A-Z]/g) ?? []).length;
  const abbreviation = t.length <= 10 && upper >= 2 && !/\s/.test(t);
  const body = abbreviation ? escapeRe(t) : escapeRe(t).replace(/[\s-]+/g, "[\\s\\u2010-\\u2015-]+");
  return new RegExp(`(?<![\\p{L}\\p{N}-])${body}(?![\\p{L}\\p{N}])`, abbreviation ? "gu" : "giu");
}

/** Long forms defined in the text itself: "granulocyte colony-stimulating factor (G-CSF)" or "G-CSF (granulocyte …)". */
export function definedLongForms(abbreviation: string, text: string): string[] {
  const letters = abbreviation.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
  if (letters.length < 2 || letters.length > 8) return [];
  const out = new Set<string>();
  const fits = (words: string[]) => words.length === letters.length && words.every((w, i) => w[0]!.toLowerCase() === letters[i]);
  const abbr = escapeRe(abbreviation);
  for (const m of text.matchAll(new RegExp(`([\\p{L}][\\p{L}\\s-]{2,120}?)\\s*\\(\\s*${abbr}\\s*[:;,)]`, "gu"))) {
    const words = m[1]!.split(/[\s-]+/).filter(Boolean);
    const tail = words.slice(-letters.length);
    if (fits(tail)) out.add(tail.join(" "));
  }
  for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}-])${abbr}\\s*\\(([\\p{L}\\s-]{3,120})\\)`, "gu"))) {
    const words = m[1]!.split(/[\s-]+/).filter(Boolean);
    if (fits(words)) out.add(words.join(" "));
  }
  return [...out];
}

const splitSentences = (text: string) => text.split(/(?<=[.;!?])\s+(?=[\p{Lu}(["\d])/u).map((s) => s.trim()).filter(Boolean);

// ------------------------------------------------------------ context cues (exported for tests)

const MEASUREMENT_CUE =
  /\b(?:serum|plasma|circulating|urinary|urine|salivary|saliva|whole blood|blood|concentrations?|levels?|measured|measurements?|quantified|assay(?:s|ed)?|ELISA|immunoassay|multiplex|biomarkers?|markers?|secreted|secretion|produced|production|expression|expressed)\b/i;
const INTERVENTION_CUE =
  /\b(?:treated with|treatment|administ\w*|received|receiving|randomi[sz]ed|injection|injected|subcutaneous\w*|doses?|dosing|therap\w*|add-ons?|filgrastim|pegfilgrastim|lenograstim|recombinant|use of|supplement\w*|mobili[sz]\w*)\b/i;
const HUMAN = /\b(?:patients?|participants?|subjects?|volunteers?|crew ?members?|crewmembers?|astronauts?|cosmonauts?|women|men|adults?|children|humans?|individuals?|winterover)\b/i;
const ANIMAL = /\b(?:mice|mouse|murine|rats?|rodents?|primates?|monkeys?|pigs?|dogs?|rabbits?)\b/i;
const IN_VITRO = /\b(?:in vitro|ex vivo|co-?cultures?|cultured|cell lines?)\b/i;
const SPECIMEN = /\b(serum|plasma|whole blood|urine|saliva|cerebrospinal fluid|bone marrow|splenocytes)\b/gi;
const ASSAY = /\b(ELISA|immunoassay|multiplex|Luminex|bead array|flow cytometry|mass spectrometry|LC-MS(?:\/MS)?|chemiluminescen\w*|radioimmunoassay)\b/gi;
const BIOMEDICAL = /\b(?:cells?|cytokines?|proteins?|blood|serum|plasma|patients?|clinical|mice|tissues?|immune|infections?|genes?|hormones?|receptors?|leukocyt\w*|neutrophil\w*|hematopoie\w*|marrow|diseases?|physiolog\w*|biomarkers?)\b/i;
const SPACEFLIGHT = /\b(?:space ?flights?|microgravity|astronauts?|cosmonauts?|international space station|weightlessness|head-down tilt|head-down bed rest|spaceflight analog)\b/i;

/** A list of analytes followed by a change verb ("G-CSF, GRO-a, VEGF increased") reports a measurement of the analyte itself. */
function listedChange(term: string, sentence: string): boolean {
  const t = termRegex(term).source;
  const re = new RegExp(`${t}(?:\\s*,?\\s*(?:and\\s+)?[\\p{L}\\p{N}][\\p{L}\\p{N}-]*){0,12}\\s*,?\\s+(?:(?:were|was|are|is)\\s+)?(?:significantly\\s+)?(?:increased|decreased|elevated|reduced|higher|lower)\\b`, "iu");
  return re.test(sentence);
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase()))];

/** Assess the scientific relevance of one retrieved reference to one biomarker concept. */
export function assessRelevance(ref: EvidenceReference, concept: LiteratureConcept): RelevanceAssessment {
  const label = concept.label.trim();
  const text = ref.inspectedText ?? "";
  const whole = `${ref.title}. ${text}`;
  const baseTerms = [...new Set([label, ...concept.aliases].map((s) => s.trim()).filter((s) => s.length >= 2))];
  const longForms = baseTerms.flatMap((t) => definedLongForms(t, whole));
  const terms = [...new Set([...baseTerms, ...longForms])];
  const hits = (s: string) => terms.filter((t) => termRegex(t).test(s) || (longForms.includes(t) && looseForm(s).includes(looseForm(t))));
  const inTitle = hits(ref.title).length > 0;
  const sentences = splitSentences(text);
  const mention = sentences.filter((s) => hits(s).length > 0);
  const identityTerms = [...new Set([...hits(ref.title), ...mention.flatMap(hits)])];
  const measured = mention.filter((s) => !INTERVENTION_CUE.test(s) && (MEASUREMENT_CUE.test(s) || terms.some((t) => listedChange(t, s))));
  const intervention = mention.filter((s) => INTERVENTION_CUE.test(s));
  const population: StudyPopulation[] = [];
  if (HUMAN.test(whole)) population.push("human");
  if (ANIMAL.test(whole)) population.push("animal");
  if (IN_VITRO.test(whole)) population.push("in_vitro");
  if (!population.length) population.push("unstated");
  const signals: RelevanceAssessment["signals"] = {
    identityTerms,
    inTitle,
    mentionSentences: mention.length,
    measuredInSource: measured.length > 0,
    administeredAsIntervention: intervention.length > 0,
    population,
    specimen: uniq([...whole.matchAll(SPECIMEN)].map((m) => m[1]!)),
    assay: uniq([...whole.matchAll(ASSAY)].map((m) => m[1]!)),
    spaceflightKeyword: SPACEFLIGHT.test(whole),
  };
  const out = (classification: RelevanceClass, reason: string): RelevanceAssessment => ({ refId: ref.refId, classification, reason, signals });
  const name = `“${label}”`;

  if (ref.existence !== "verified_by_provider") return out("insufficient_information", "The provider did not confirm this record exists; relevance cannot be assessed.");
  if (!text) {
    return inTitle
      ? out("insufficient_information", `Only bibliographic metadata was retrieved; the title names ${name} but no abstract was available to assess study purpose, population or measurement.`)
      : out("insufficient_information", `Only bibliographic metadata was retrieved and the title does not name ${name}; relevance cannot be assessed.`);
  }
  if (!identityTerms.length) {
    const partials = [...new Set(baseTerms.flatMap((t) => t.split(/[-\s/]+/)).filter((p) => p.length >= 3 && /\p{L}/u.test(p) && !baseTerms.includes(p)))].filter((p) => termRegex(p).test(whole));
    const biomedical = BIOMEDICAL.test(whole);
    if (partials.length) {
      const p = partials[0]!;
      const meaning = definedLongForms(p, whole)[0];
      return out("irrelevant", `${name} does not occur in the title or abstract; only the different term “${p}”${meaning ? ` (defined here as “${meaning}”)` : ""} appears${biomedical ? "" : ", in a non-biomedical context"}. A partial keyword match is not relevance.`);
    }
    return out("irrelevant", `${name} and its aliases do not occur in the title or inspected abstract${biomedical ? "" : ", which has no biological or clinical content"}; the provider's search match is not evidence of relevance.`);
  }
  const human = population.includes("human");
  if (measured.length) {
    const quote = `“${clip(measured[0]!)}”`;
    if (human) return out("relevant", `${label} is measured in human participants${signals.specimen.length ? ` (${signals.specimen.join(", ")})` : ""}: ${quote}`);
    if (population.includes("animal") || population.includes("in_vitro"))
      return out("potentially_relevant", `${label} is measured only in an ${population.includes("animal") ? "animal" : "in vitro / ex vivo"} study, not in humans: ${quote}`);
    return out("potentially_relevant", `${label} is measured but the study population is not stated in the abstract: ${quote}`);
  }
  if (inTitle) {
    if (intervention.length) return out("potentially_relevant", `The study concerns ${label} as an administered intervention, not a measurement of the biomarker: “${clip(intervention[0]!)}”`);
    return out("potentially_relevant", `The title names ${label}, but the abstract does not describe measuring it: “${clip(ref.title)}”`);
  }
  const first = mention[0] ?? ref.title;
  return out(
    "irrelevant",
    intervention.length
      ? `${label} is mentioned only as an administered intervention, in a study about another topic (“${clip(ref.title, 110)}”): “${clip(first)}”`
      : `${label} is mentioned only in passing; the study (“${clip(ref.title, 110)}”) does not measure or study it: “${clip(first)}”`,
  );
}

export type DraftSelectionMode = "researcher_explicit" | "automatic_batch";

/**
 * Which references may be sent to the AI. Irrelevant and insufficient-information
 * references never are; potentially relevant ones only after an explicit
 * Researcher selection; automatic batch processing uses relevant ones only.
 */
export function relevanceGate(references: readonly EvidenceReference[], concept: LiteratureConcept, mode: DraftSelectionMode) {
  const used: EvidenceReference[] = [];
  const excluded: { refId: string; classification: RelevanceClass; reason: string }[] = [];
  for (const r of references) {
    const a = assessRelevance(r, concept);
    const ok = !!r.inspectedText && (a.classification === "relevant" || (a.classification === "potentially_relevant" && mode === "researcher_explicit"));
    if (ok) used.push(r);
    else excluded.push({ refId: r.refId, classification: a.classification, reason: a.classification === "potentially_relevant" ? `Not used: potentially relevant references require explicit Researcher selection. ${a.reason}` : a.reason });
  }
  return { used, excluded };
}

/** Reference IDs that automatic batch processing may draft from (relevant only). */
export const automaticDraftRefIds = (references: readonly EvidenceReference[], concept: LiteratureConcept) =>
  relevanceGate(references, concept, "automatic_batch").used.map((r) => r.refId);

/** True when the Researcher may tick this reference for drafting. */
export const selectableForDraft = (a: RelevanceAssessment, r: EvidenceReference) =>
  !!r.inspectedText && (a.classification === "relevant" || a.classification === "potentially_relevant");
