/**
 * P41 — evidence governance for interpretation drafts (pure, browser-safe).
 *
 * Separates, explicitly and in data:
 *  1. bibliographic metadata retrieved from a provider (existence verified by the provider),
 *  2. source text actually inspected (abstract or handbook text, never full text unless retrieved),
 *  3. excerpts quoted verbatim from that inspected text and linked to a claim,
 *  4. model-generated synthesis (the claim wording), and
 *  5. Researcher-verified conclusions (only through the P40 approval + P41 attestation).
 *
 * A claim survives validation only when every cited excerpt is found verbatim
 * in the inspected text of a provider-verified reference; otherwise it is kept
 * visibly as "unresolved". Threshold, diagnostic, causal, recommendation and
 * value-judgement language is rejected. Nothing here approves anything.
 *
 * Privacy: literature queries are built only from catalog concepts (label,
 * aliases, domain) and are refused when they look like values, dates,
 * identifiers or contact details. No observation, value or crew identity is
 * ever part of a query.
 */
import {
  EMPTY_CONTENT,
  THRESHOLD_LANGUAGE,
  type Citation,
  type Claim,
  type InterpretationContent,
  type InterpretationDomain,
  type InterpretationDraft,
} from "./biomarker-interpretation";

export const EVIDENCE_BUNDLE_SCHEMA = "mitochondria.interpretation-evidence-bundle.v1" as const;
export const AI_DRAFT_SCHEMA_VERSION = "p41.1" as const;

export type EvidenceProvider = "pubmed" | "nasa_ntrs" | "crossref" | "governed_handbook";
export type InspectionLevel = "metadata_only" | "abstract" | "handbook_text";
export type PopulationTag = "spaceflight_or_analog" | "terrestrial_or_unspecified";

export interface EvidenceReference {
  /** Stable reference ID, e.g. "pmid:31975181", "ntrs:20150001900", "doi:10.1002/x". */
  refId: string;
  provider: EvidenceProvider;
  identifiers: { pmid: string | null; pmcid: string | null; doi: string | null; ntrsId: string | null; url: string };
  title: string;
  source: string | null;
  year: string | null;
  publicationTypes: string[];
  retrievedAt: string;
  /** Provider record version/revision date when supplied. */
  sourceVersion: string | null;
  inspected: InspectionLevel;
  /** Text actually inspected (bounded); null for metadata-only references. */
  inspectedText: string | null;
  existence: "verified_by_provider" | "not_found";
  /** Keyword-derived tag (spaceflight, microgravity, astronaut, bed rest …); not a reviewed classification. */
  population: PopulationTag;
}

export interface LiteratureConcept {
  label: string;
  aliases: string[];
  domain: InterpretationDomain | null;
}

export const DRAFT_FIELDS = ["function", "increaseContext", "decreaseContext", "generalContext", "spaceflightRelevance", "limitation"] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];
export const DRAFT_FIELD_LABELS: Record<DraftField, string> = {
  function: "Biological function",
  increaseContext: "Context for higher values",
  decreaseContext: "Context for lower values",
  generalContext: "General context",
  spaceflightRelevance: "Spaceflight relevance",
  limitation: "Limitation / confounder / evidence gap",
};

export interface ClaimSupport {
  refId: string;
  excerpt: string;
}
export interface RawDraftClaim {
  field: DraftField;
  text: string;
  evidenceScope: "general_biomedical" | "spaceflight_specific";
  support: ClaimSupport[];
}
export interface VerifiedDraftClaim extends RawDraftClaim {
  verification: "excerpt_found_in_inspected_text" | "unresolved";
  problems: string[];
}
export interface DraftContradiction {
  summary: string;
  refIds: string[];
  verified: boolean;
}
export interface EvidenceDraft {
  generatedBy: { kind: "ai_synthesis"; provider: string; model: string; generatedAt: string };
  claims: VerifiedDraftClaim[];
  rejected: { field: string; text: string; reason: string }[];
  contradictions: DraftContradiction[];
  gaps: string[];
  status: "draft_with_verified_excerpts" | "insufficient_evidence";
}
export type BundleStatus = "evidence_retrieved" | "no_evidence_found" | "retrieval_unavailable" | "draft_ready" | "insufficient_evidence";
export interface ProviderOutcome {
  provider: EvidenceProvider;
  status: "ok" | "unavailable" | "error";
  count: number;
  detail: string | null;
}
export interface EvidenceBundle {
  schema: typeof EVIDENCE_BUNDLE_SCHEMA;
  /** Interpretation key or research-candidate key ("candidate|irc-…"). */
  key: string;
  concept: LiteratureConcept;
  queries: string[];
  retrievedAt: string;
  references: EvidenceReference[];
  providerOutcomes: ProviderOutcome[];
  draft: EvidenceDraft | null;
  status: BundleStatus;
  gaps: string[];
}

// ------------------------------------------------------------ privacy-safe concept queries

const UNSAFE: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/, "contains an email address"],
  [/https?:\/\//i, "contains a URL"],
  [/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/, "contains a date"],
  // Measured values (e.g. "32.5", "18,2"), but not chemical locants such as "1,25(OH)2" or "1,25-dihydroxy".
  [/(?<![\w,.-])\d+[.,]\d+(?![\w(,.-])/, "contains a decimal value"],
  [/\d{5,}/, "contains a long number (possible identifier)"],
  [/\b(?:patient|astronaut|crew)\s*(?:id|name|#)/i, "contains a person identifier field"],
];

/** Null when the concept text is safe to send to an external literature service. */
export function conceptPrivacyProblem(c: LiteratureConcept): string | null {
  const parts = [c.label, ...c.aliases];
  if (!c.label.trim()) return "A biomarker label is required.";
  if (c.aliases.length > 6) return "At most six aliases are sent.";
  for (const p of parts) {
    if (p.length > 120) return "Concept text is too long to be a biomarker name.";
    for (const [re, why] of UNSAFE) if (re.test(p)) return `Concept text ${why}; only biomarker concepts are sent to literature services.`;
  }
  return null;
}

const queryTerm = (s: string) => s.replace(/["[\]{}<>\\]/g, " ").replace(/\s+/g, " ").trim();

/** Two PubMed queries: spaceflight/analog-specific and general reviews. Concept terms only. */
export function pubmedQueries(c: LiteratureConcept): string[] {
  const names = [...new Set([c.label, ...c.aliases].map(queryTerm).filter((x) => x.length >= 2))].slice(0, 6);
  const any = `(${names.map((n) => `"${n}"[tiab]`).join(" OR ")})`;
  return [
    `${any} AND (spaceflight[tiab] OR "space flight"[tiab] OR microgravity[tiab] OR astronaut*[tiab] OR "bed rest"[tiab] OR "head-down tilt"[tiab])`,
    `${any} AND review[pt]`,
  ];
}
export const ntrsQuery = (c: LiteratureConcept) => queryTerm(c.label);

const SPACEFLIGHT_WORDS = /\b(space ?flights?|microgravity|astronauts?|cosmonauts?|international space station|\bISS\b|bed rest|head-down tilt|weightlessness|spaceflight analog)/i;
export const populationTag = (text: string): PopulationTag => (SPACEFLIGHT_WORDS.test(text) ? "spaceflight_or_analog" : "terrestrial_or_unspecified");

// ------------------------------------------------------------ identifiers

export type ParsedIdentifier = { kind: "pmid" | "doi" | "ntrs" | "pmcid"; value: string };
/** Extract one verifiable identifier from citation text (PMID, DOI, NASA NTRS ID or PMCID). */
export function parseIdentifier(text: string): ParsedIdentifier | null {
  const t = text.trim();
  const doi = t.match(/\b(10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;)])/);
  if (doi) return { kind: "doi", value: doi[1]!.toLowerCase() };
  const pmc = t.match(/\bPMC(\d{3,9})\b/i);
  if (pmc) return { kind: "pmcid", value: `PMC${pmc[1]}` };
  const pmid = t.match(/\bPMID[:\s]*(\d{1,9})\b/i) ?? t.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i);
  if (pmid) return { kind: "pmid", value: pmid[1]! };
  const ntrs = t.match(/ntrs\.nasa\.gov\/(?:api\/)?citations\/(\d{11})/i) ?? t.match(/\bNTRS[:\s]*(\d{11})\b/i);
  if (ntrs) return { kind: "ntrs", value: ntrs[1]! };
  if (/^\d{1,9}$/.test(t)) return { kind: "pmid", value: t };
  if (/^\d{11}$/.test(t)) return { kind: "ntrs", value: t };
  return null;
}
export const isValidIdentifier = (p: ParsedIdentifier) =>
  p.kind === "pmid" ? /^\d{1,9}$/.test(p.value) : p.kind === "doi" ? /^10\.\d{4,9}\/\S+$/.test(p.value) : p.kind === "ntrs" ? /^\d{11}$/.test(p.value) : /^PMC\d{3,9}$/.test(p.value);

// ------------------------------------------------------------ claim validation

const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** True when `excerpt` occurs verbatim (whitespace/quote-normalized) in `text`. */
export const excerptFound = (excerpt: string, text: string | null) => !!text && normalize(text).includes(normalize(excerpt));

const PROHIBITED: [RegExp, string][] = [
  [THRESHOLD_LANGUAGE, "mentions a reference interval or threshold (needs a separately validated assay-specific rule)"],
  [/\b(?:below|above|under|over|less than|greater than|more than|exceed\w*|at least|at most)\s*\d|[<>\u2264\u2265]\s*\d/i, "compares a value with a numeric cut-off"],
  [/\b(?:deficien\w*|insufficien\w*|abnormal\w*|normal range|optimal|sufficient level)/i, "classifies a value as normal, abnormal, deficient or optimal"],
  [/\bdiagnos\w*|\bdisease state\b|\bpatholog\w* (?:is|are) (?:present|confirmed)/i, "states or implies a diagnosis"],
  [/\balways\b|\bnecessarily\b|\bproves?\b|\bdefinitively\b/i, "states certainty the evidence cannot support"],
  [/\b(?:improv\w*|deteriorat\w*|worsen\w*|healthier|unhealthy|better|worse)\b/i, "judges a change as improvement or deterioration"],
  [/\b(?:causes?|caused by|leads? to|results? in)\b/i, "asserts causality"],
  [/\b(?:recommend\w*|should (?:take|receive|start|stop|increase|decrease)|treat(?:ment)? with|prescrib\w*|dose of)\b/i, "gives a medical recommendation"],
];

export function prohibitedLanguage(text: string): string | null {
  for (const [re, why] of PROHIBITED) if (re.test(text)) return why;
  return null;
}

/**
 * Validate AI (or Researcher) claims against the references the SERVER
 * retrieved. Unsupported claims stay visible as unresolved; prohibited
 * language is rejected outright. Never upgrades anything to approved.
 */
export function verifyDraftClaims(raw: unknown, references: readonly EvidenceReference[]): Pick<EvidenceDraft, "claims" | "rejected"> {
  const claims: VerifiedDraftClaim[] = [];
  const rejected: EvidenceDraft["rejected"] = [];
  const byId = new Map(references.map((r) => [r.refId, r]));
  for (const item of Array.isArray(raw) ? raw.slice(0, 40) : []) {
    const c = item as Partial<RawDraftClaim> | null;
    const field = c?.field;
    const text = typeof c?.text === "string" ? c.text.trim() : "";
    if (!field || !(DRAFT_FIELDS as readonly string[]).includes(field) || text.length < 3 || text.length > 800) {
      rejected.push({ field: String(field ?? "?"), text: text.slice(0, 200), reason: "malformed claim" });
      continue;
    }
    const bad = prohibitedLanguage(text);
    if (bad) {
      rejected.push({ field, text, reason: `rejected: ${bad}` });
      continue;
    }
    const scope = c?.evidenceScope === "spaceflight_specific" ? "spaceflight_specific" : "general_biomedical";
    const support = (Array.isArray(c?.support) ? c!.support : [])
      .filter((s): s is ClaimSupport => !!s && typeof s.refId === "string" && typeof s.excerpt === "string")
      .slice(0, 4)
      .map((s) => ({ refId: s.refId, excerpt: s.excerpt.trim().slice(0, 600) }));
    const problems: string[] = [];
    if (!support.length) problems.push("No supporting excerpt is linked to this claim.");
    for (const s of support) {
      const ref = byId.get(s.refId);
      if (!ref) problems.push(`Cites ${s.refId}, which was not retrieved (possible fabricated citation).`);
      else if (ref.existence !== "verified_by_provider") problems.push(`${s.refId} was not confirmed by its provider.`);
      else if (ref.inspected === "metadata_only" || !ref.inspectedText) problems.push(`${s.refId}: only bibliographic metadata was retrieved; no source text was inspected.`);
      else if (s.excerpt.length < 20) problems.push(`${s.refId}: excerpt too short to verify.`);
      else if (!excerptFound(s.excerpt, ref.inspectedText)) problems.push(`${s.refId}: excerpt not found verbatim in the inspected ${ref.inspected === "abstract" ? "abstract" : "text"}.`);
    }
    if (scope === "spaceflight_specific" && !support.some((s) => byId.get(s.refId)?.population === "spaceflight_or_analog"))
      problems.push("Labelled spaceflight-specific but no cited source is a spaceflight or analog study (terrestrial evidence is not astronaut-specific evidence).");
    claims.push({ field, text, evidenceScope: scope, support, verification: problems.length ? "unresolved" : "excerpt_found_in_inspected_text", problems });
  }
  return { claims, rejected };
}

/** Contradictions are kept only when every cited reference was actually retrieved. */
export function verifyContradictions(raw: unknown, references: readonly EvidenceReference[]): DraftContradiction[] {
  const ids = new Set(references.map((r) => r.refId));
  return (Array.isArray(raw) ? raw.slice(0, 10) : []).flatMap((x) => {
    const c = x as Partial<DraftContradiction> | null;
    if (!c || typeof c.summary !== "string" || c.summary.trim().length < 5 || !Array.isArray(c.refIds)) return [];
    const refIds = c.refIds.filter((r): r is string => typeof r === "string").slice(0, 6);
    return [{ summary: c.summary.trim().slice(0, 600), refIds, verified: refIds.length >= 2 && refIds.every((r) => ids.has(r)) }];
  });
}

/** Deterministic gap list: which fields have no excerpt-verified support. */
export function evidenceGaps(claims: readonly VerifiedDraftClaim[], references: readonly EvidenceReference[]): string[] {
  const gaps: string[] = [];
  if (!references.length) gaps.push("No literature was retrieved for this biomarker concept.");
  if (references.length && references.every((r) => r.inspected === "metadata_only")) gaps.push("Only bibliographic metadata was available; no source text could be inspected.");
  for (const f of DRAFT_FIELDS) {
    if (f === "limitation" || f === "generalContext") continue;
    if (!claims.some((c) => c.field === f && c.verification === "excerpt_found_in_inspected_text"))
      gaps.push(`${DRAFT_FIELD_LABELS[f]}: no claim with an excerpt verified in retrieved source text.`);
  }
  if (!references.some((r) => r.population === "spaceflight_or_analog")) gaps.push("No spaceflight or analog study was retrieved; spaceflight relevance is unresolved.");
  if (references.length && references.every((r) => r.inspected !== "handbook_text")) gaps.push("Full text was not inspected (abstracts only); claims needing full-text evidence remain unverified.");
  gaps.push("Specimen, assay method and collection protocol are not documented by this draft; the Researcher must record them from the sources.");
  return gaps;
}

export function draftStatus(claims: readonly VerifiedDraftClaim[]): EvidenceDraft["status"] {
  return claims.some((c) => c.field === "function" && c.verification === "excerpt_found_in_inspected_text") ? "draft_with_verified_excerpts" : "insufficient_evidence";
}

// ------------------------------------------------------------ conversion to the P40 editor draft

function citationFor(r: EvidenceReference): Citation {
  const ids = [r.identifiers.pmid && `PMID ${r.identifiers.pmid}`, r.identifiers.pmcid, r.identifiers.doi && `DOI ${r.identifiers.doi}`, r.identifiers.ntrsId && `NASA NTRS ${r.identifiers.ntrsId}`].filter(Boolean);
  return {
    id: r.refId,
    kind: r.provider === "nasa_ntrs" ? "agency_document" : r.provider === "governed_handbook" ? "governed_handbook" : "peer_reviewed",
    title: `${r.title}${r.source ? ` — ${r.source}` : ""}${r.year ? ` (${r.year})` : ""}`,
    locator: `${ids.join("; ")}; ${r.inspected === "abstract" ? "abstract inspected (full text not inspected)" : r.inspected === "handbook_text" ? "handbook text" : "metadata only"}; retrieved ${r.retrievedAt.slice(0, 10)}`,
    url: r.identifiers.url,
  };
}

/**
 * Only excerpt-verified claims enter the editable P40 draft, each citing exactly
 * its supporting references. Evidence strength stays "not assessed" with an
 * empty basis so the Researcher must appraise it; approval is never implied.
 */
export function toInterpretationDraft(bundle: EvidenceBundle): InterpretationDraft {
  const verified = (bundle.draft?.claims ?? []).filter((c) => c.verification === "excerpt_found_in_inspected_text");
  const used = new Set(verified.flatMap((c) => c.support.map((s) => s.refId)));
  const citations = bundle.references.filter((r) => used.has(r.refId)).map(citationFor);
  const merge = (field: DraftField): Claim | null => {
    const cs = verified.filter((c) => c.field === field);
    if (!cs.length) return null;
    return {
      text: cs.map((c) => c.text).join(" "),
      citationIds: [...new Set(cs.flatMap((c) => c.support.map((s) => s.refId)))],
      evidenceScope: cs.every((c) => c.evidenceScope === "spaceflight_specific") ? "spaceflight_specific" : "general_biomedical",
    };
  };
  const content: InterpretationContent = {
    ...EMPTY_CONTENT,
    function: merge("function"),
    increaseContext: merge("increaseContext"),
    decreaseContext: merge("decreaseContext"),
    generalContext: merge("generalContext"),
    spaceflightRelevance: merge("spaceflightRelevance"),
    associatedBiomarkers: null,
    comparabilityRequirements: [],
    limitations: [
      ...verified.filter((c) => c.field === "limitation").map((c) => `${c.text} [${c.support.map((s) => s.refId).join(", ")}]`),
      "Draft prepared with AI assistance from retrieved abstracts; each statement and excerpt must be checked against the source by the Researcher.",
    ],
  };
  return { content, citations, evidenceStrength: { level: "not_assessed", basis: "" } };
}

export const VERIFICATION_LABELS: Record<VerifiedDraftClaim["verification"], string> = {
  excerpt_found_in_inspected_text: "Excerpt found verbatim in the inspected source text (support for the claim still needs Researcher verification)",
  unresolved: "Unresolved — no verified supporting excerpt",
};
export const INSPECTION_LABELS: Record<InspectionLevel, string> = {
  metadata_only: "Bibliographic metadata only",
  abstract: "Abstract inspected (full text not inspected)",
  handbook_text: "Governed handbook text inspected",
};
