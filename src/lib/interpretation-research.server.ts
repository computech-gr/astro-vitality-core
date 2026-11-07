/**
 * P41 server core: scientific literature retrieval, evidence-aware AI drafting
 * and attestation of Researcher interpretation decisions. Framework-free;
 * called from interpretation-research.functions.ts after authentication and a
 * caller-scoped Researcher membership check.
 *
 * Literature providers (legitimate documented public APIs, no scraping, no paywall bypass):
 *  - NCBI PubMed E-utilities (esearch + efetch; abstracts only — full text is never claimed)
 *  - NASA Technical Reports Server public API (public-distribution records only)
 *  - Crossref REST API (DOI metadata verification only; metadata_only inspection)
 * Each call has a timeout, bounded retries with backoff, a per-isolate rate
 * limiter and cache, and a sanitized audit event (no credentials, no values).
 *
 * Privacy: requests carry only biomarker concepts (label, aliases). Concepts
 * that look like values, dates, identifiers or contact details are refused.
 */
import {
  AI_DRAFT_SCHEMA_VERSION,
  EVIDENCE_BUNDLE_SCHEMA,
  conceptPrivacyProblem,
  draftStatus,
  evidenceGaps,
  isValidIdentifier,
  ntrsQuery,
  parseIdentifier,
  populationTag,
  pubmedQueries,
  verifyContradictions,
  verifyDraftClaims,
  type EvidenceBundle,
  type EvidenceReference,
  type LiteratureConcept,
  type ProviderOutcome,
} from "@/domain/health-intelligence/interpretation-evidence";
import { INSUFFICIENT_RELEVANT_EVIDENCE, relevanceGate, type DraftSelectionMode } from "@/domain/health-intelligence/literature-relevance";
import {
  INTERPRETATION_EVENT_SCHEMA,
  approvalProblem,
  interpretationContentSha256,
  interpretationKey,
  requiredAcknowledgement,
  type InterpretationEvent,
} from "@/domain/health-intelligence/biomarker-interpretation";
import { canonicalJson } from "@/domain/health-intelligence/observation-envelope";
import { sha256Hex } from "@/domain/health-intelligence/catalog-lifecycle";
import {
  ATTESTATION_BASIS,
  INTERPRETATION_ATTESTATION_KEY_ID,
  INTERPRETATION_ATTESTATION_SCHEMA,
  deriveInterpretationAttestationKey,
  signAttestation,
  type SignedAttestation,
} from "@/domain/health-intelligence/interpretation-attestation";

export interface ResearchDeps {
  env: (name: string) => string | undefined;
  /** Injected network function; invoked with the global receiver (workerd). */
  fetch: typeof fetch;
  now: () => Date;
  userId: string;
  audit?: (event: Record<string, unknown>) => void;
  sleep?: (ms: number) => Promise<void>;
}
type Fail = { ok: false; code: "unavailable" | "invalid" | "rate_limited" | "provider_error" | "forbidden" | "integrity"; message: string };
const fail = (code: Fail["code"], message: string): Fail => ({ ok: false, code, message });

const PUBMED = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NTRS = "https://ntrs.nasa.gov/api/citations";
const CROSSREF = "https://api.crossref.org/works";
const LOVABLE_RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const AI_MODEL = "openai/gpt-6-astra";
const TIMEOUT_MS = 10_000;
const AI_TIMEOUT_MS = 45_000;
const RETRIES = 2;
const MAX_TEXT = 6_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SEARCH_PER_HOUR = 120;
const DRAFT_PER_HOUR = 30;

// ------------------------------------------------------------ per-isolate cache, limiter, pacing

const cache = new Map<string, { at: number; value: unknown }>();
function cached<T>(key: string, now: number): T | undefined {
  const hit = cache.get(key);
  if (!hit || now - hit.at > CACHE_TTL_MS) return undefined;
  return hit.value as T;
}
function remember(key: string, value: unknown, now: number) {
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now, value });
}
const usage = new Map<string, number[]>();
function allow(bucket: string, perHour: number, now: number): boolean {
  const list = (usage.get(bucket) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= perHour) return false;
  list.push(now);
  usage.set(bucket, list);
  return true;
}
let lastNcbi = 0;
async function paceNcbi(deps: ResearchDeps) {
  const gap = deps.env("NCBI_API_KEY") ? 110 : 350; // NCBI: 3 req/s without a key, 10 with one
  const wait = lastNcbi + gap - Date.now();
  if (wait > 0) await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(wait);
  lastNcbi = Date.now();
}

async function getText(deps: ResearchDeps, url: string, provider: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<{ ok: true; status: number; text: string } | { ok: false; status: number; error: string }> {
  let last = { ok: false as const, status: 0, error: "not attempted" };
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const started = Date.now();
    try {
      const res: Response = await Reflect.apply(deps.fetch, globalThis, [url, { ...init, signal: ctrl.signal, headers: { "User-Agent": "MITOCHONDRIA-research-prototype (open source)", ...(init?.headers ?? {}) } }]);
      const text = await res.text();
      deps.audit?.({ feature: "p41-literature", provider, status: res.status, attempt, durationMs: Date.now() - started });
      if (res.ok) return { ok: true, status: res.status, text };
      last = { ok: false, status: res.status, error: `HTTP ${res.status}` };
      if (res.status !== 429 && res.status < 500) return last;
    } catch (e) {
      last = { ok: false, status: 0, error: e instanceof Error && e.name === "AbortError" ? "timeout" : "network error" };
      deps.audit?.({ feature: "p41-literature", provider, status: 0, attempt, error: last.error });
    } finally {
      clearTimeout(timer);
    }
    if (attempt < RETRIES) await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(400 * 2 ** attempt);
  }
  return last;
}

// ------------------------------------------------------------ parsers (exported for tests)

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
const first = (block: string, re: RegExp) => {
  const m = block.match(re);
  return m ? decode(m[1]!) : null;
};

/** Parse PubMed efetch XML. Only the article's own IDs are read (never its reference list). */
export function parsePubmedXml(xml: string, retrievedAt: string): EvidenceReference[] {
  const out: EvidenceReference[] = [];
  for (const m of xml.matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
    const block = m[1]!;
    const own = block.split(/<ReferenceList/)[0]!;
    const pmid = first(own, /<PMID[^>]*>(\d+)<\/PMID>/);
    const title = first(own, /<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/);
    if (!pmid || !title) continue;
    const abstract = [...own.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
      .map((a) => {
        const label = a[1]!.match(/Label="([^"]+)"/)?.[1];
        return `${label ? `${label}: ` : ""}${decode(a[2]!)}`;
      })
      .join(" ")
      .slice(0, MAX_TEXT);
    const idList = own.match(/<PubmedData>[\s\S]*?<ArticleIdList>([\s\S]*?)<\/ArticleIdList>/)?.[1] ?? "";
    const doi = idList.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/)?.[1]?.toLowerCase() ?? null;
    const pmcid = idList.match(/<ArticleId IdType="pmc">([^<]+)<\/ArticleId>/)?.[1] ?? null;
    const year = first(own, /<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) ?? first(own, /<PubDate>[\s\S]*?<MedlineDate>(\d{4})/);
    const revised = own.match(/<DateRevised>\s*<Year>(\d{4})<\/Year>\s*<Month>(\d{1,2})<\/Month>\s*<Day>(\d{1,2})<\/Day>/);
    const types = [...own.matchAll(/<PublicationType[^>]*>([^<]+)<\/PublicationType>/g)].map((t) => decode(t[1]!));
    out.push({
      refId: `pmid:${pmid}`,
      provider: "pubmed",
      identifiers: { pmid, pmcid, doi, ntrsId: null, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` },
      title,
      source: first(own, /<ISOAbbreviation>([\s\S]*?)<\/ISOAbbreviation>/) ?? first(own, /<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/),
      year,
      publicationTypes: types,
      retrievedAt,
      sourceVersion: revised ? `PubMed revised ${revised[1]}-${revised[2]!.padStart(2, "0")}-${revised[3]!.padStart(2, "0")}` : null,
      inspected: abstract ? "abstract" : "metadata_only",
      inspectedText: abstract || null,
      existence: "verified_by_provider",
      population: populationTag(`${title} ${abstract}`),
    });
  }
  return out;
}

interface NtrsRecord { id?: number | string; title?: string; abstract?: string; distribution?: string; modified?: string; stiType?: string; publications?: { publicationDate?: string; publicationName?: string }[] }
/** Parse one NASA NTRS record; non-public records are never used. */
export function parseNtrsRecord(r: NtrsRecord, retrievedAt: string): EvidenceReference | null {
  const id = r.id == null ? null : String(r.id);
  if (!id || !/^\d{11}$/.test(id) || !r.title || r.distribution !== "PUBLIC") return null;
  const abstract = r.abstract ? decode(r.abstract).slice(0, MAX_TEXT) : null;
  const pub = r.publications?.[0];
  return {
    refId: `ntrs:${id}`,
    provider: "nasa_ntrs",
    identifiers: { pmid: null, pmcid: null, doi: null, ntrsId: id, url: `https://ntrs.nasa.gov/citations/${id}` },
    title: decode(r.title),
    source: pub?.publicationName ?? "NASA Technical Reports Server",
    year: pub?.publicationDate?.slice(0, 4) ?? null,
    publicationTypes: r.stiType ? [r.stiType] : [],
    retrievedAt,
    sourceVersion: r.modified ? `NTRS modified ${r.modified.slice(0, 10)}` : null,
    inspected: abstract ? "abstract" : "metadata_only",
    inspectedText: abstract,
    existence: "verified_by_provider",
    population: populationTag(`${r.title} ${abstract ?? ""}`),
  };
}

// ------------------------------------------------------------ providers

async function pubmedFetch(deps: ResearchDeps, ids: string[], retrievedAt: string): Promise<{ refs: EvidenceReference[]; outcome: ProviderOutcome }> {
  if (!ids.length) return { refs: [], outcome: { provider: "pubmed", status: "ok", count: 0, detail: null } };
  const key = deps.env("NCBI_API_KEY");
  const ck = `pubmed:efetch:${ids.join(",")}`;
  const hit = cached<EvidenceReference[]>(ck, Date.now());
  if (hit) return { refs: hit, outcome: { provider: "pubmed", status: "ok", count: hit.length, detail: "cache" } };
  await paceNcbi(deps);
  const r = await getText(deps, `${PUBMED}/efetch.fcgi?db=pubmed&retmode=xml&tool=mitochondria&id=${ids.join(",")}${key ? `&api_key=${encodeURIComponent(key)}` : ""}`, "pubmed");
  if (!r.ok) return { refs: [], outcome: { provider: "pubmed", status: r.status === 0 ? "unavailable" : "error", count: 0, detail: r.error } };
  const refs = parsePubmedXml(r.text, retrievedAt);
  remember(ck, refs, Date.now());
  return { refs, outcome: { provider: "pubmed", status: "ok", count: refs.length, detail: null } };
}

async function pubmedSearch(deps: ResearchDeps, queries: string[], retrievedAt: string) {
  const key = deps.env("NCBI_API_KEY");
  const ids: string[] = [];
  for (const q of queries) {
    await paceNcbi(deps);
    const r = await getText(deps, `${PUBMED}/esearch.fcgi?db=pubmed&retmode=json&retmax=4&sort=relevance&tool=mitochondria&term=${encodeURIComponent(q)}${key ? `&api_key=${encodeURIComponent(key)}` : ""}`, "pubmed");
    if (!r.ok) return { refs: [], outcome: { provider: "pubmed" as const, status: r.status === 0 ? ("unavailable" as const) : ("error" as const), count: 0, detail: r.error } };
    try {
      const list = (JSON.parse(r.text) as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist ?? [];
      for (const id of list) if (/^\d{1,9}$/.test(id) && !ids.includes(id)) ids.push(id);
    } catch {
      return { refs: [], outcome: { provider: "pubmed" as const, status: "error" as const, count: 0, detail: "unreadable search response" } };
    }
  }
  return pubmedFetch(deps, ids.slice(0, 8), retrievedAt);
}

async function ntrsSearch(deps: ResearchDeps, q: string, retrievedAt: string): Promise<{ refs: EvidenceReference[]; outcome: ProviderOutcome }> {
  const ck = `ntrs:search:${q}`;
  const hit = cached<EvidenceReference[]>(ck, Date.now());
  if (hit) return { refs: hit, outcome: { provider: "nasa_ntrs", status: "ok", count: hit.length, detail: "cache" } };
  const r = await getText(deps, `${NTRS}/search?q=${encodeURIComponent(q)}&page.size=4`, "nasa_ntrs");
  if (!r.ok) return { refs: [], outcome: { provider: "nasa_ntrs", status: r.status === 0 ? "unavailable" : "error", count: 0, detail: r.error } };
  try {
    const results = (JSON.parse(r.text) as { results?: NtrsRecord[] }).results ?? [];
    const refs = results.map((x) => parseNtrsRecord(x, retrievedAt)).filter((x): x is EvidenceReference => !!x);
    remember(ck, refs, Date.now());
    return { refs, outcome: { provider: "nasa_ntrs", status: "ok", count: refs.length, detail: null } };
  } catch {
    return { refs: [], outcome: { provider: "nasa_ntrs", status: "error", count: 0, detail: "unreadable response" } };
  }
}

async function ntrsById(deps: ResearchDeps, id: string, retrievedAt: string): Promise<EvidenceReference | null> {
  const r = await getText(deps, `${NTRS}/${id}`, "nasa_ntrs");
  if (!r.ok) return null;
  try {
    return parseNtrsRecord(JSON.parse(r.text) as NtrsRecord, retrievedAt);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ public cores

function literatureGate(deps: ResearchDeps, concept: LiteratureConcept): Fail | null {
  if (deps.env("P41_LITERATURE_DISABLED") === "true") return fail("unavailable", "Literature retrieval is switched off for this deployment; the request stays queued.");
  const privacy = conceptPrivacyProblem(concept);
  if (privacy) return fail("invalid", privacy);
  if (!allow(`search:${deps.userId}`, SEARCH_PER_HOUR, Date.now())) return fail("rate_limited", "Hourly literature search limit reached; try again later.");
  return null;
}

/** Retrieve references for one biomarker concept (no AI, no approval). */
export async function searchLiteratureCore(key: string, concept: LiteratureConcept, deps: ResearchDeps): Promise<{ ok: true; bundle: EvidenceBundle } | Fail> {
  const gate = literatureGate(deps, concept);
  if (gate) return gate;
  const retrievedAt = deps.now().toISOString();
  const queries = [...pubmedQueries(concept), ntrsQuery(concept)];
  const [pm, ntrs] = await Promise.all([pubmedSearch(deps, queries.slice(0, 2), retrievedAt), ntrsSearch(deps, queries[2]!, retrievedAt)]);
  const references = [...pm.refs, ...ntrs.refs];
  const outcomes = [pm.outcome, ntrs.outcome];
  const allDown = outcomes.every((o) => o.status !== "ok");
  const status = allDown ? "retrieval_unavailable" : references.length ? "evidence_retrieved" : "no_evidence_found";
  return {
    ok: true,
    bundle: {
      schema: EVIDENCE_BUNDLE_SCHEMA,
      key,
      concept,
      queries,
      retrievedAt,
      references,
      providerOutcomes: outcomes,
      draft: null,
      status,
      gaps: evidenceGaps([], references),
    },
  };
}

/** Verify that a citation identifier exists (PMID, PMCID via PubMed, DOI via Crossref, NASA NTRS ID). */
export async function verifyIdentifierCore(text: string, deps: ResearchDeps): Promise<{ ok: true; reference: EvidenceReference | null; identifier: string } | Fail> {
  if (deps.env("P41_LITERATURE_DISABLED") === "true") return fail("unavailable", "Literature retrieval is switched off for this deployment.");
  const id = parseIdentifier(text);
  if (!id || !isValidIdentifier(id)) return fail("invalid", "No PMID, PMCID, DOI or NASA NTRS ID was found in the citation.");
  if (!allow(`search:${deps.userId}`, SEARCH_PER_HOUR, Date.now())) return fail("rate_limited", "Hourly lookup limit reached; try again later.");
  const retrievedAt = deps.now().toISOString();
  const label = `${id.kind}:${id.value}`;
  if (id.kind === "pmid") {
    const { refs, outcome } = await pubmedFetch(deps, [id.value], retrievedAt);
    if (outcome.status !== "ok") return fail("provider_error", `PubMed lookup failed (${outcome.detail}); the citation stays unverified.`);
    return { ok: true, reference: refs[0] ?? null, identifier: label };
  }
  if (id.kind === "pmcid") {
    await paceNcbi(deps);
    const r = await getText(deps, `${PUBMED}/esearch.fcgi?db=pubmed&retmode=json&tool=mitochondria&term=${encodeURIComponent(`${id.value}[pmcid]`)}`, "pubmed");
    if (!r.ok) return fail("provider_error", "PubMed lookup failed; the citation stays unverified.");
    const pmid = ((JSON.parse(r.text) as { esearchresult?: { idlist?: string[] } }).esearchresult?.idlist ?? [])[0];
    if (!pmid) return { ok: true, reference: null, identifier: label };
    const { refs } = await pubmedFetch(deps, [pmid], retrievedAt);
    return { ok: true, reference: refs[0] ?? null, identifier: label };
  }
  if (id.kind === "ntrs") return { ok: true, reference: await ntrsById(deps, id.value, retrievedAt), identifier: label };
  const r = await getText(deps, `${CROSSREF}/${encodeURIComponent(id.value)}`, "crossref");
  if (!r.ok) return r.status === 404 ? { ok: true, reference: null, identifier: label } : fail("provider_error", "Crossref lookup failed; the citation stays unverified.");
  try {
    const m = (JSON.parse(r.text) as { message?: { title?: string[]; "container-title"?: string[]; issued?: { "date-parts"?: number[][] }; type?: string; DOI?: string } }).message;
    if (!m?.title?.[0]) return { ok: true, reference: null, identifier: label };
    return {
      ok: true,
      identifier: label,
      reference: {
        refId: `doi:${id.value}`,
        provider: "crossref",
        identifiers: { pmid: null, pmcid: null, doi: id.value, ntrsId: null, url: `https://doi.org/${id.value}` },
        title: decode(m.title[0]),
        source: m["container-title"]?.[0] ?? null,
        year: m.issued?.["date-parts"]?.[0]?.[0] ? String(m.issued["date-parts"][0][0]) : null,
        publicationTypes: m.type ? [m.type] : [],
        retrievedAt,
        sourceVersion: null,
        inspected: "metadata_only",
        inspectedText: null,
        existence: "verified_by_provider",
        population: populationTag(m.title[0]),
      },
    };
  } catch {
    return fail("provider_error", "Crossref returned an unreadable record; the citation stays unverified.");
  }
}

const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "claims", "contradictions", "gaps"],
  properties: {
    schemaVersion: { type: "string", enum: [AI_DRAFT_SCHEMA_VERSION] },
    claims: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "text", "evidenceScope", "support"],
        properties: {
          field: { type: "string", enum: ["function", "increaseContext", "decreaseContext", "generalContext", "spaceflightRelevance", "limitation"] },
          text: { type: "string" },
          evidenceScope: { type: "string", enum: ["general_biomedical", "spaceflight_specific"] },
          support: {
            type: "array",
            maxItems: 4,
            items: { type: "object", additionalProperties: false, required: ["refId", "excerpt"], properties: { refId: { type: "string" }, excerpt: { type: "string" } } },
          },
        },
      },
    },
    contradictions: {
      type: "array",
      maxItems: 8,
      items: { type: "object", additionalProperties: false, required: ["summary", "refIds"], properties: { summary: { type: "string" }, refIds: { type: "array", items: { type: "string" }, maxItems: 6 } } },
    },
    gaps: { type: "array", items: { type: "string" }, maxItems: 12 },
  },
} as const;

const DRAFT_INSTRUCTIONS = `You prepare a DRAFT biological-interpretation summary of a biomarker for scientific review in a research prototype. You only summarize the supplied source texts.
Rules:
- Use ONLY the supplied references. Cite them by their exact refId. Never invent references, DOIs, PMIDs, protocols, numbers or reference ranges.
- Every claim needs 1-4 support items; each excerpt must be copied VERBATIM (20-400 characters) from that reference's text. If no text supports a field, omit the claim and add a gap.
- Fields: function (what the biomarker measures), increaseContext / decreaseContext (what higher / lower values have been associated with in the cited studies), generalContext, spaceflightRelevance (only from spaceflight, microgravity, astronaut or bed-rest studies), limitation (confounders, measurement limits, uncertainty).
- Describe associations, never causation. Never say a change is an improvement, deterioration, better or worse. Never state or imply a diagnosis, normal range, cut-off, threshold or treatment recommendation. Avoid "always", "proves", "causes", "leads to", "results in".
- Mark evidenceScope "spaceflight_specific" only when the supporting reference studies spaceflight or an analog; otherwise "general_biomedical". Terrestrial evidence is not astronaut-specific evidence.
- List contradictory findings between references under contradictions with their refIds.
- schemaVersion must be "${AI_DRAFT_SCHEMA_VERSION}".`;

/**
 * Evidence-aware AI draft. The server re-retrieves the selected references
 * itself, so excerpts are verified against provider text, never client text.
 */
export async function draftInterpretationCore(
  input: { key: string; concept: LiteratureConcept; refIds: string[]; selection: DraftSelectionMode },
  deps: ResearchDeps,
): Promise<{ ok: true; bundle: EvidenceBundle } | Fail> {
  if (deps.env("P41_INTERPRETATION_AI_DISABLED") === "true") return fail("unavailable", "AI drafting is switched off for this deployment; evidence stays available for manual drafting.");
  const gate = literatureGate(deps, input.concept);
  if (gate) return gate;
  if (!allow(`draft:${deps.userId}`, DRAFT_PER_HOUR, Date.now())) return fail("rate_limited", "Hourly AI draft limit reached; try again later.");
  const apiKey = deps.env("LOVABLE_API_KEY");
  if (!apiKey) return fail("unavailable", "The AI service is not configured; evidence stays available for manual drafting.");
  const retrievedAt = deps.now().toISOString();
  const pmids = input.refIds.filter((r) => /^pmid:\d{1,9}$/.test(r)).map((r) => r.slice(5)).slice(0, 8);
  const ntrsIds = input.refIds.filter((r) => /^ntrs:\d{11}$/.test(r)).map((r) => r.slice(5)).slice(0, 4);
  const pm = await pubmedFetch(deps, pmids, retrievedAt);
  const nt = (await Promise.all(ntrsIds.map((id) => ntrsById(deps, id, retrievedAt)))).filter((x): x is EvidenceReference => !!x);
  const references = [...pm.refs, ...nt];
  // P41.1 relevance gate, recomputed on the server from provider text: irrelevant and
  // insufficient-information references never reach the AI; potentially relevant ones
  // only on an explicit Researcher selection; batch processing uses relevant ones only.
  const selection: DraftSelectionMode = input.selection === "researcher_explicit" ? "researcher_explicit" : "automatic_batch";
  const relevant = relevanceGate(references, input.concept, selection);
  const usable = relevant.used;
  const outcomes: ProviderOutcome[] = [pm.outcome, { provider: "nasa_ntrs", status: "ok", count: nt.length, detail: null }];
  const relevance = { mode: selection, usedRefIds: usable.map((r) => r.refId), excluded: relevant.excluded };
  const base: EvidenceBundle = { schema: EVIDENCE_BUNDLE_SCHEMA, key: input.key, concept: input.concept, queries: [], retrievedAt, references, providerOutcomes: outcomes, draft: null, status: "insufficient_evidence", gaps: evidenceGaps([], references), relevanceGate: relevance };
  if (!usable.length) {
    deps.audit?.({ feature: "p41-ai-draft", outcome: "insufficient_relevant_evidence", userId: deps.userId, references: references.length, excluded: relevant.excluded.length });
    return {
      ok: true,
      bundle: {
        ...base,
        status: references.length ? "insufficient_evidence" : "no_evidence_found",
        gaps: [`${INSUFFICIENT_RELEVANT_EVIDENCE}: no retrieved reference was assessed as relevant${selection === "researcher_explicit" ? " or potentially relevant" : ""}; no AI draft was generated.`, ...base.gaps],
      },
    };
  }

  const payload = {
    model: AI_MODEL,
    input: [
      { role: "system", content: DRAFT_INSTRUCTIONS },
      {
        role: "user",
        content: JSON.stringify({
          biomarker: input.concept,
          references: usable.map((r) => ({ refId: r.refId, title: r.title, source: r.source, year: r.year, population: r.population, inspected: r.inspected, text: r.inspectedText })),
        }),
      },
    ],
    text: { format: { type: "json_schema", name: "p41_interpretation_draft", strict: true, schema: DRAFT_SCHEMA } },
    reasoning: { effort: "low" },
    store: false,
    max_output_tokens: 6000,
  };
  const started = Date.now();
  const r = await getText(deps, LOVABLE_RESPONSES_URL, "lovable_ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "X-Lovable-AIG-SDK": "fetch" }, body: JSON.stringify(payload) }, AI_TIMEOUT_MS);
  if (!r.ok) {
    deps.audit?.({ feature: "p41-ai-draft", outcome: "provider_error", status: r.status, userId: deps.userId });
    return fail(r.status === 429 ? "rate_limited" : r.status === 402 ? "unavailable" : "provider_error", r.status === 402 ? "AI credits are exhausted; evidence stays available for manual drafting." : "The AI service did not answer; evidence stays available for manual drafting.");
  }
  let parsed: { schemaVersion?: string; claims?: unknown; contradictions?: unknown; gaps?: unknown };
  let model = AI_MODEL;
  try {
    const body = JSON.parse(r.text) as { model?: string; output?: { type?: string; content?: { type?: string; text?: string }[] }[] };
    model = body.model ?? AI_MODEL;
    const text = (body.output ?? []).flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text ?? "";
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    deps.audit?.({ feature: "p41-ai-draft", outcome: "malformed", userId: deps.userId });
    return fail("integrity", "The AI response was malformed and was rejected; nothing was drafted.");
  }
  if (parsed.schemaVersion !== AI_DRAFT_SCHEMA_VERSION || !Array.isArray(parsed.claims)) return fail("integrity", "The AI response did not match the required structure and was rejected.");
  // Claims may only cite references that passed the relevance gate.
  const allowed = new Set(usable.map((r) => r.refId));
  const { claims, rejected } = verifyDraftClaims(parsed.claims, references, allowed);
  const contradictions = verifyContradictions(parsed.contradictions, usable);
  const modelGaps = (Array.isArray(parsed.gaps) ? parsed.gaps : []).filter((g): g is string => typeof g === "string").map((g) => `AI-reported gap: ${g.slice(0, 300)}`).slice(0, 12);
  const status = draftStatus(claims);
  deps.audit?.({ feature: "p41-ai-draft", outcome: "ok", userId: deps.userId, model, references: references.length, claims: claims.length, verified: claims.filter((c) => c.verification !== "unresolved").length, rejected: rejected.length, durationMs: Date.now() - started });
  return {
    ok: true,
    bundle: {
      ...base,
      draft: { generatedBy: { kind: "ai_synthesis", provider: "lovable", model, generatedAt: deps.now().toISOString() }, claims, rejected, contradictions, gaps: [...evidenceGaps(claims, usable), ...modelGaps], status },
      status: status === "draft_with_verified_excerpts" ? "draft_ready" : "insufficient_evidence",
      gaps: [...evidenceGaps(claims, usable), ...modelGaps],
    },
  };
}

/**
 * Server attestation of one APPROVE/REVOKE event. The caller has already been
 * verified as an active Researcher (functions layer). Re-checks the event's
 * hash, actor, approval rules, fingerprint and acknowledgement before signing.
 */
export async function attestDecisionCore(event: unknown, deps: Pick<ResearchDeps, "env" | "now" | "userId">): Promise<{ ok: true; attestation: SignedAttestation } | Fail> {
  const secret = deps.env("P37_CATALOG_SIGNING_KEY");
  if (!secret) return fail("unavailable", "Approval attestation is not configured; the approval stays on this device and is not applied.");
  const e = event as Partial<InterpretationEvent> | null;
  if (!e || e.schema !== INTERPRETATION_EVENT_SCHEMA || (e.action !== "APPROVE" && e.action !== "REVOKE") || !e.identity || typeof e.hash !== "string")
    return fail("invalid", "Only an approval or revocation event can be attested.");
  const { hash, ...body } = e as InterpretationEvent;
  if ((await sha256Hex(canonicalJson(body))) !== hash) return fail("integrity", "The decision event does not match its hash.");
  if (body.actorUserId !== deps.userId) return fail("forbidden", "A decision can only be attested for the account that recorded it.");
  if (interpretationKey(body.identity) !== body.key) return fail("integrity", "The decision identity does not match its key.");
  if (body.action === "APPROVE") {
    if (!body.draft) return fail("invalid", "The approval has no content.");
    const problem = approvalProblem(body.identity, body.draft);
    if (problem) return fail("invalid", problem);
    if ((await interpretationContentSha256(body.identity, body.draft)) !== body.contentSha256) return fail("integrity", "The approval fingerprint does not match its content.");
    if (body.acknowledgement !== requiredAcknowledgement(body.identity)) return fail("invalid", "The approval acknowledgement is missing.");
  } else if (!body.reason || body.reason.trim().length < 10) return fail("invalid", "A revocation needs a reason.");
  const action: "APPROVE" | "REVOKE" = body.action === "APPROVE" ? "APPROVE" : "REVOKE";
  const { privateKey } = await deriveInterpretationAttestationKey(secret);
  return {
    ok: true,
    attestation: await signAttestation(
      {
        schema: INTERPRETATION_ATTESTATION_SCHEMA,
        keyId: INTERPRETATION_ATTESTATION_KEY_ID,
        eventHash: hash,
        key: body.key,
        action,
        contentSha256: body.contentSha256,
        actorUserId: deps.userId,
        attestedAt: deps.now().toISOString(),
        basis: ATTESTATION_BASIS,
      },
      privateKey,
    ),
  };
}
