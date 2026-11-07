import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SYNTHETIC_DEMO_APPROVAL_ACK,
  approvalProblem,
  buildVerifiedSnapshot,
  interpretationKey,
  matchInterpretation,
  planApproval,
  planAttestation,
  planRejectDraft,
  sealInterpretationEvent,
  type ActorContext,
  type InterpretationEvent,
  type InterpretationIdentity,
} from "../../src/domain/health-intelligence/biomarker-interpretation";
import {
  conceptPrivacyProblem,
  evidenceGaps,
  excerptFound,
  parseIdentifier,
  pubmedQueries,
  toInterpretationDraft,
  verifyDraftClaims,
  type EvidenceReference,
} from "../../src/domain/health-intelligence/interpretation-evidence";
import {
  activatedIdentityFor,
  candidateConcept,
  deriveResearchCandidates,
  identifyTerm,
  type CandidateSourceTerm,
} from "../../src/domain/health-intelligence/interpretation-research-candidates";
import { backlogProgress, interpretationPreflight, nextBacklogBatch, planAttempt, type EvidenceAttempt } from "../../src/domain/health-intelligence/interpretation-backlog";
import { buildLongitudinalComparison, highlightTone, longitudinalLines, VALIDATED_ALERT_RULES } from "../../src/domain/health-intelligence/longitudinal-comparison";
import { deriveInterpretationAttestationKey, INTERPRETATION_ATTESTATION_KEY_ID, BUNDLED_ATTESTATION_KEYS, type AttestationTrustedKey } from "../../src/domain/health-intelligence/interpretation-attestation";
import { appendInterpretationEvent, listInterpretationEvents, loadVerifiedInterpretationSnapshot } from "../../src/domain/health-intelligence/biomarker-interpretation-ledger";
import { appendEvidenceAttempt, listEvidenceAttempts } from "../../src/domain/health-intelligence/interpretation-evidence-store";
import { InMemoryReviewLedgerStore } from "../../src/infrastructure/offline/review-ledger-store";
import {
  attestDecisionCore,
  draftInterpretationCore,
  parseNtrsRecord,
  parsePubmedXml,
  searchLiteratureCore,
  verifyIdentifierCore,
  type ResearchDeps,
} from "../../src/lib/interpretation-research.server";
import type { ReportRow } from "../../src/domain/health-intelligence/unified-health-report";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY = JSON.parse(readFileSync(join(ROOT, "data/scientific/biomarker-interpretation-registry.v1.json"), "utf8"));
const MISSION = "mission-9d8ce8f3e5554509a0885461f9ad2e1c";
const VITD_ID: InterpretationIdentity = { environment: "synthetic_demo", catalogId: "demo:ubt-7b25ce69", domain: "bone", unit: "ng/mL", missionId: MISSION, displayName: "25-Hydroxyvitamin D" };
// The concept a device sends for this identity: display label plus the reported alias (identityConcept).
const VITD_CONCEPT = { label: "25(OH) Vitamin D", aliases: ["25-hydroxyvitamin D"], domain: "bone" as const };
const RESEARCHER: ActorContext = { userId: "researcher-1", name: "Researcher One", roles: ["researcher"], now: "2026-11-08T10:00:00.000Z" };

const SERVER_SECRET = "test-only-p41-server-secret-never-deployed-0123456789abcdef";
const serverKey = await deriveInterpretationAttestationKey(SERVER_SECRET);
const SERVER_TRUST: AttestationTrustedKey[] = [{ keyId: INTERPRETATION_ATTESTATION_KEY_ID, publicKeySpkiBase64: serverKey.publicKeySpkiBase64, environment: "interpretation_attestation" }];

// ------------------------------------------------------------ synthetic literature fixtures (offline)

const ABSTRACT_SPACE =
  "Serum 25-hydroxyvitamin D concentration is the accepted measure of vitamin D status. In crew members of long-duration missions, serum 25-hydroxyvitamin D decreased during flight when supplementation was not provided.";
const ABSTRACT_GENERAL = "Circulating 25-hydroxyvitamin D reflects vitamin D supply from skin synthesis and diet. Concentrations rise with oral vitamin D intake in controlled studies.";
const PUBMED_XML = `<?xml version="1.0"?><PubmedArticleSet>
<PubmedArticle><MedlineCitation><PMID Version="1">90000001</PMID><DateRevised><Year>2025</Year><Month>3</Month><Day>4</Day></DateRevised><Article><Journal><Title>Synthetic Journal</Title><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue><ISOAbbreviation>Synth J</ISOAbbreviation></Journal><ArticleTitle>Vitamin D status in long-duration spaceflight (synthetic fixture)</ArticleTitle><Abstract><AbstractText>${ABSTRACT_SPACE}</AbstractText></Abstract><PublicationTypeList><PublicationType>Journal Article</PublicationType></PublicationTypeList></Article></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">90000001</ArticleId><ArticleId IdType="doi">10.9999/synthetic.1</ArticleId></ArticleIdList><ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.1111/not-this-article</ArticleId></ArticleIdList></Reference></ReferenceList></PubmedData></PubmedArticle>
<PubmedArticle><MedlineCitation><PMID Version="1">90000002</PMID><Article><Journal><JournalIssue><PubDate><Year>2020</Year></PubDate></JournalIssue><ISOAbbreviation>Synth Rev</ISOAbbreviation></Journal><ArticleTitle>Vitamin D metabolism review (synthetic fixture)</ArticleTitle><Abstract><AbstractText Label="BACKGROUND">${ABSTRACT_GENERAL}</AbstractText></Abstract><PublicationTypeList><PublicationType>Review</PublicationType></PublicationTypeList></Article></MedlineCitation>
<PubmedData><ArticleIdList><ArticleId IdType="pubmed">90000002</ArticleId></ArticleIdList></PubmedData></PubmedArticle>
</PubmedArticleSet>`;
const NTRS_JSON = { results: [{ id: 20150001900, title: "Vitamin D in Spaceflight (synthetic fixture)", abstract: "Crew vitamin D status was monitored before and after flight.", distribution: "PUBLIC", modified: "2020-01-01T00:00:00Z", stiType: "PRESENTATION" }, { id: 20150009999, title: "Restricted", distribution: "LIMITED" }] };

type Call = { url: string; body?: string };
function mockDeps(opts: { ai?: unknown; aiRaw?: string; failAll?: boolean; env?: Record<string, string> } = {}): { deps: ResearchDeps; calls: Call[] } {
  const calls: Call[] = [];
  const env: Record<string, string> = { LOVABLE_API_KEY: "test-key", P37_CATALOG_SIGNING_KEY: SERVER_SECRET, ...opts.env };
  const fetchImpl = async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
    if (opts.failAll) throw new Error("offline");
    if (url.includes("esearch.fcgi")) return new Response(JSON.stringify({ esearchresult: { idlist: ["90000001", "90000002"] } }));
    if (url.includes("efetch.fcgi")) return new Response(PUBMED_XML);
    if (url.includes("ntrs.nasa.gov/api/citations/search")) return new Response(JSON.stringify(NTRS_JSON));
    if (url.includes("ntrs.nasa.gov/api/citations/")) return new Response(JSON.stringify(NTRS_JSON.results[0]));
    if (url.includes("api.crossref.org")) return new Response("", { status: 404 });
    if (url.includes("ai.gateway.lovable.dev"))
      return new Response(JSON.stringify({ model: "openai/gpt-6-astra", output: [{ type: "message", content: [{ type: "output_text", text: opts.aiRaw ?? JSON.stringify(opts.ai) }] }] }));
    return new Response("not found", { status: 404 });
  };
  return {
    calls,
    deps: { env: (n) => env[n], fetch: fetchImpl as unknown as typeof fetch, now: () => new Date("2026-11-08T10:00:00.000Z"), userId: RESEARCHER.userId, sleep: async () => undefined },
  };
}
let userSeq = 0;
const fresh = (d: ResearchDeps): ResearchDeps => ({ ...d, userId: `${d.userId}-${++userSeq}` }); // independent rate-limit buckets per test

const AI_GOOD = {
  schemaVersion: "p41.1",
  claims: [
    { field: "function", text: "Serum 25-hydroxyvitamin D is the accepted measure of vitamin D status.", evidenceScope: "general_biomedical", support: [{ refId: "pmid:90000001", excerpt: "Serum 25-hydroxyvitamin D concentration is the accepted measure of vitamin D status." }] },
    { field: "increaseContext", text: "Higher concentrations have been associated with oral vitamin D intake in controlled studies.", evidenceScope: "general_biomedical", support: [{ refId: "pmid:90000002", excerpt: "Concentrations rise with oral vitamin D intake in controlled studies." }] },
    { field: "decreaseContext", text: "Lower in-flight concentrations were reported in long-duration crew without supplementation.", evidenceScope: "spaceflight_specific", support: [{ refId: "pmid:90000001", excerpt: "serum 25-hydroxyvitamin D decreased during flight when supplementation was not provided" }] },
    { field: "spaceflightRelevance", text: "Fabricated claim with an invented citation.", evidenceScope: "spaceflight_specific", support: [{ refId: "pmid:12345678", excerpt: "This sentence was never retrieved from any source text." }] },
    { field: "generalContext", text: "Values below 20 ng/mL indicate deficiency.", evidenceScope: "general_biomedical", support: [{ refId: "pmid:90000002", excerpt: "Circulating 25-hydroxyvitamin D reflects vitamin D supply" }] },
    { field: "limitation", text: "A lower value means the crew member's bone health is worse.", evidenceScope: "general_biomedical", support: [] },
  ],
  contradictions: [],
  gaps: ["No assay comparison was retrieved."],
};

// ------------------------------------------------------------ privacy and identifiers

describe("P41 literature queries carry biomarker concepts only", () => {
  it("refuses values, dates, emails and identifiers", () => {
    expect(conceptPrivacyProblem({ label: "25(OH) Vitamin D", aliases: ["Calcidiol"], domain: "bone" })).toBeNull();
    expect(conceptPrivacyProblem({ label: "Vitamin D 32.5", aliases: [], domain: null })).toContain("decimal");
    expect(conceptPrivacyProblem({ label: "Vitamin D 18,2", aliases: [], domain: null })).toContain("decimal");
    expect(conceptPrivacyProblem({ label: "1,25(OH)₂ Vitamin D", aliases: ["1,25-dihydroxyvitamin D"], domain: null })).toBeNull();
    expect(conceptPrivacyProblem({ label: "Vitamin D", aliases: ["2026-10-01"], domain: null })).toContain("date");
    expect(conceptPrivacyProblem({ label: "Vitamin D", aliases: ["crew@example.org"], domain: null })).toContain("email");
    expect(conceptPrivacyProblem({ label: "Patient ID 4471", aliases: [], domain: null })).not.toBeNull();
    expect(conceptPrivacyProblem({ label: "Vitamin D", aliases: ["1234567"], domain: null })).toContain("identifier");
  });
  it("builds spaceflight-specific and review queries from the label and aliases", () => {
    const [space, review] = pubmedQueries({ label: "25(OH) Vitamin D", aliases: ["Calcidiol"], domain: "bone" });
    expect(space).toContain('"25(OH) Vitamin D"[tiab] OR "Calcidiol"[tiab]');
    expect(space).toContain("microgravity");
    expect(review).toContain("review[pt]");
  });
  it("parses PMID, PMCID, DOI and NASA NTRS identifiers", () => {
    expect(parseIdentifier("PMID: 31975181")).toEqual({ kind: "pmid", value: "31975181" });
    expect(parseIdentifier("https://doi.org/10.1007/s00198-020-05307-1.")).toEqual({ kind: "doi", value: "10.1007/s00198-020-05307-1" });
    expect(parseIdentifier("PMC1234567")).toEqual({ kind: "pmcid", value: "PMC1234567" });
    expect(parseIdentifier("https://ntrs.nasa.gov/citations/20150001900")).toEqual({ kind: "ntrs", value: "20150001900" });
    expect(parseIdentifier("a nice paper")).toBeNull();
  });
});

describe("P41 provider parsing", () => {
  it("reads only the article's own identifiers and abstract from PubMed XML", () => {
    const refs = parsePubmedXml(PUBMED_XML, "2026-11-08T10:00:00.000Z");
    expect(refs.map((r) => r.refId)).toEqual(["pmid:90000001", "pmid:90000002"]);
    expect(refs[0]!.identifiers.doi).toBe("10.9999/synthetic.1");
    expect(refs[0]!.inspected).toBe("abstract");
    expect(refs[0]!.population).toBe("spaceflight_or_analog");
    expect(refs[1]!.population).toBe("terrestrial_or_unspecified");
    expect(refs[1]!.inspectedText).toStartWith("BACKGROUND: ");
    expect(refs[0]!.sourceVersion).toBe("PubMed revised 2025-03-04");
  });
  it("never uses non-public NASA NTRS records", () => {
    expect(parseNtrsRecord(NTRS_JSON.results[0]!, "t")?.refId).toBe("ntrs:20150001900");
    expect(parseNtrsRecord(NTRS_JSON.results[1]!, "t")).toBeNull();
  });
});

describe("P41 server retrieval, AI drafting and attestation (mocked network)", () => {
  it("retrieves references with provenance and sends no observation data", async () => {
    const { deps, calls } = mockDeps();
    const r = await searchLiteratureCore("k1", { label: "25(OH) Vitamin D", aliases: [], domain: "bone" }, fresh(deps));
    if (!r.ok) throw new Error(r.message);
    expect(r.bundle.status).toBe("evidence_retrieved");
    expect(r.bundle.references.map((x) => x.refId)).toEqual(["pmid:90000001", "pmid:90000002", "ntrs:20150001900"]);
    for (const c of calls) expect(decodeURIComponent(c.url)).not.toMatch(/\d+\.\d+ ?ng|crew-|mission-/);
  });
  it("reports retrieval unavailable instead of inventing evidence when offline", async () => {
    const { deps } = mockDeps({ failAll: true });
    const r = await searchLiteratureCore("k-offline", { label: "Osteocalcin", aliases: [], domain: "bone" }, fresh(deps));
    if (!r.ok) throw new Error(r.message);
    expect(r.bundle.status).toBe("retrieval_unavailable");
    expect(r.bundle.references).toEqual([]);
  });
  it("refuses a concept that looks like patient data before any network call", async () => {
    const { deps, calls } = mockDeps();
    const r = await searchLiteratureCore("k2", { label: "Vitamin D 18.2 ng/mL on 2026-10-01", aliases: [], domain: null }, fresh(deps));
    expect(r.ok).toBe(false);
    expect(calls.length).toBe(0);
  });
  it("respects the deployment kill switches", async () => {
    const { deps } = mockDeps({ env: { P41_LITERATURE_DISABLED: "true", P41_INTERPRETATION_AI_DISABLED: "true" } });
    expect((await searchLiteratureCore("k", { label: "Osteocalcin", aliases: [], domain: null }, fresh(deps))).ok).toBe(false);
    expect((await draftInterpretationCore({ key: "k", concept: { label: "Osteocalcin", aliases: [], domain: null }, refIds: ["pmid:90000001"], selection: "automatic_batch" }, fresh(deps))).ok).toBe(false);
  });
  it("keeps verified claims, marks fabricated citations unresolved and rejects thresholds and value judgements", async () => {
    const { deps } = mockDeps({ ai: AI_GOOD });
    const r = await draftInterpretationCore({ key: "k3", concept: VITD_CONCEPT, refIds: ["pmid:90000001", "pmid:90000002"], selection: "researcher_explicit" }, fresh(deps));
    if (!r.ok) throw new Error(r.message);
    const d = r.bundle.draft!;
    expect(d.claims.filter((c) => c.verification === "excerpt_found_in_inspected_text").map((c) => c.field)).toEqual(["function", "increaseContext", "decreaseContext"]);
    const fabricated = d.claims.find((c) => c.field === "spaceflightRelevance")!;
    expect(fabricated.verification).toBe("unresolved");
    expect(fabricated.problems.join(" ")).toContain("not retrieved");
    expect(d.rejected.map((x) => x.reason).join(" | ")).toContain("cut-off");
    expect(d.rejected.map((x) => x.reason).join(" | ")).toContain("improvement or deterioration");
    expect(r.bundle.status).toBe("draft_ready");
  });
  it("rejects malformed AI output without drafting anything", async () => {
    const { deps } = mockDeps({ aiRaw: "not json" });
    const r = await draftInterpretationCore({ key: "k4", concept: VITD_CONCEPT, refIds: ["pmid:90000001"], selection: "researcher_explicit" }, fresh(deps));
    expect(r.ok).toBe(false);
  });
  it("verifies identifiers and reports unknown DOIs as not found", async () => {
    const { deps } = mockDeps();
    const pm = await verifyIdentifierCore("PMID 90000001", fresh(deps));
    expect(pm.ok && pm.reference?.title).toContain("spaceflight");
    const doi = await verifyIdentifierCore("10.9999/does-not-exist", fresh(deps));
    expect(doi.ok && doi.reference).toBeNull();
  });
});

describe("P41 claim validation", () => {
  const refs = parsePubmedXml(PUBMED_XML, "2026-11-08T10:00:00.000Z");
  it("requires spaceflight evidence for spaceflight-specific claims", () => {
    const { claims } = verifyDraftClaims(
      [{ field: "spaceflightRelevance", text: "Concentrations rise with intake.", evidenceScope: "spaceflight_specific", support: [{ refId: "pmid:90000002", excerpt: "Concentrations rise with oral vitamin D intake in controlled studies." }] }],
      refs,
    );
    expect(claims[0]!.verification).toBe("unresolved");
    expect(claims[0]!.problems.join(" ")).toContain("not astronaut-specific");
  });
  it("never treats metadata-only references as inspected text", () => {
    const meta: EvidenceReference = { ...refs[1]!, refId: "doi:10.1/x", inspected: "metadata_only", inspectedText: null };
    const { claims } = verifyDraftClaims([{ field: "function", text: "Something measured.", evidenceScope: "general_biomedical", support: [{ refId: "doi:10.1/x", excerpt: "Circulating 25-hydroxyvitamin D reflects vitamin D supply" }] }], [meta]);
    expect(claims[0]!.verification).toBe("unresolved");
    expect(evidenceGaps([], [meta])[0]).toContain("bibliographic metadata");
  });
  it("matches excerpts despite whitespace and typographic quotes only", () => {
    expect(excerptFound("rise  with oral\nvitamin D", ABSTRACT_GENERAL)).toBe(true);
    expect(excerptFound("rise with intravenous vitamin D", ABSTRACT_GENERAL)).toBe(false);
  });
});

// ------------------------------------------------------------ longitudinal comparison

const row = (id: string, value: string, at: string, over: Partial<ReportRow> = {}): ReportRow => ({
  recordId: id, badge: "bone", metricId: VITD_ID.catalogId, metricLabel: "25(OH) Vitamin D", value, unit: "ng/mL", observedAt: at,
  provenance: "synthetic", status: "included", sourceLabel: "CSV: synthetic.csv", evidence: "unified-intake", ...over,
});

describe("P41 longitudinal comparison", () => {
  it("compares consecutive examinations and baseline to latest with absolute and percent change", () => {
    const c = buildLongitudinalComparison([row("a", "20.0", "2026-01-01", { datePrecision: "date" }), row("b", "25.5", "2026-04-01", { datePrecision: "date" }), row("c", "22", "2026-07-01", { datePrecision: "date" })], "ng/mL");
    expect(c.consecutive.map((p) => [p.absolute, p.percent])).toEqual([[5.5, 27.5], [-3.5, -13.7]]);
    expect(c.baselineToLatest).toMatchObject({ absolute: 2, percent: 10, direction: "higher" });
    expect(longitudinalLines(c).length).toBeGreaterThan(3);
    expect([...c.consecutive, c.baselineToLatest!].map((p) => p.text).join(" ")).not.toMatch(/improv|worse|deteriorat|better|abnormal/i);
  });
  it("handles zero and negative earlier values without dividing", () => {
    const zero = buildLongitudinalComparison([row("a", "0", "2026-01-01T00:00:00Z"), row("b", "3", "2026-02-01T00:00:00Z")], "ng/mL");
    expect(zero.consecutive[0]).toMatchObject({ absolute: 3, percent: null });
    expect(zero.consecutive[0]!.percentNote).toContain("zero");
    const neg = buildLongitudinalComparison([row("a", "-2", "2026-01-01T00:00:00Z"), row("b", "1", "2026-02-01T00:00:00Z")], "ng/mL");
    expect(neg.consecutive[0]!.percentNote).toContain("negative");
  });
  it("lists repeated readings instead of silently discarding them", () => {
    const diff = buildLongitudinalComparison([row("a", "20", "2026-01-01", { datePrecision: "date" }), row("b", "24", "2026-01-01", { datePrecision: "date" }), row("c", "21", "2026-02-01", { datePrecision: "date" })], "ng/mL");
    expect(diff.points[0]!.readings.length).toBe(2);
    expect(diff.consecutive[0]!.status).toBe("differing_repeated_readings");
    const same = buildLongitudinalComparison([row("a", "20", "2026-01-01", { datePrecision: "date" }), row("b", "20", "2026-01-01", { datePrecision: "date" }), row("c", "21", "2026-02-01", { datePrecision: "date" })], "ng/mL");
    expect(same.consecutive[0]).toMatchObject({ status: "compared", absolute: 1 });
  });
  it("never orders a date-only reading against a timed reading on the same day, nor converts units", () => {
    const c = buildLongitudinalComparison([row("a", "20", "2026-01-01", { datePrecision: "date" }), row("b", "21", "2026-01-01T12:00:00.000Z"), row("x", "50", "2026-03-01", { unit: "nmol/L", datePrecision: "date" })], "ng/mL");
    expect(c.points.length).toBe(2);
    expect(c.consecutive[0]!.status).toBe("ordering_ambiguous");
    expect(c.notes.join(" ")).toContain("never converted");
    expect(c.compatibility.statement).toContain("unverified");
  });
  it("keeps every display neutral because no validated alert rule exists", () => {
    expect(VALIDATED_ALERT_RULES).toEqual([]);
    expect(highlightTone().tone).toBe("neutral");
  });
});

// ------------------------------------------------------------ candidates, preflight, backlog

describe("P41 unknown biomarker research candidates", () => {
  const term = (over: Partial<CandidateSourceTerm>): CandidateSourceTerm => ({
    termId: "ubt-aaaaaaaa", originalLabels: ["Synthetic Marker Z"], exactUnit: "pg/mL", candidateMetricIds: [], specimen: null, method: null, sourceDocumentSha256: ["a".repeat(64)],
    origin: { kind: "p36_submitted_term", missionId: "m1", provenance: "synthetic", submissionId: "s1" }, ...over,
  });
  it("matches existing interpretations exactly and creates one shared candidate per label + exact unit", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, []);
    expect(identifyTerm(["25-Hydroxyvitamin D"], "ng/mL", [], snap).identification).toBe("matched_registry_record");
    expect(identifyTerm(["25-Hydroxyvitamin D"], "nmol/L", [], snap).identification).toBe("domain_conflict");
    expect(identifyTerm(["Orthostatic heart rate change"], "bpm", [], snap).identification).toBe("matched_registry_record");
    expect(identifyTerm(["Orthostatic heart rate change"], "beats/min", [], snap).identification).toBe("unit_conflict");
    const cands = deriveResearchCandidates(
      [term({}), term({ termId: "ubt-bbbbbbbb", originalLabels: ["synthetic marker  z"], origin: { kind: "p36_submitted_term", missionId: "m2", provenance: "synthetic", submissionId: "s2" } }), term({ termId: "ubt-cccccccc", exactUnit: "ng/L" }), term({ termId: "ubt-dddddddd", originalLabels: ["25-Hydroxyvitamin D"], exactUnit: "ng/mL" })],
      snap,
    );
    expect(cands.map((c) => [c.label, c.exactUnit, c.termIds.length])).toEqual([["Synthetic Marker Z", "ng/L", 1], ["Synthetic Marker Z", "pg/mL", 2]]);
    expect(cands[1]!.origins.map((o) => o.missionId)).toEqual(["m1", "m2"]);
    expect(conceptPrivacyProblem(candidateConcept(cands[0]!))).toBeNull();
  });
});

describe("P41 preflight inventory and resumable backlog", () => {
  it("inventories the 416 registry records without approving anything", async () => {
    const snap = await buildVerifiedSnapshot(REGISTRY, []);
    const p = interpretationPreflight(snap);
    expect(p.totalRecords).toBe(416);
    expect(p.byEnvironment).toEqual({ governed_handbook: 159, domain_catalog: 71, production_catalog: 0, synthetic_demo: 186 });
    expect(p.byLifecycle.approved).toBe(0);
    expect(p.distinctCanonicalClusters).toBeLessThan(416);
    expect(p.distinctCanonicalClusters).toBeLessThanOrEqual(p.distinctNormalizedNames + p.conflicts.nameInMultipleDomains.length * 4);
    expect(p.conflicts.notUnitBound).toBe(230);
    expect(p.evidence.complete).toBe(0);
    expect(p.manualDecisions.length).toBeGreaterThan(0);
  });
  it("skips completed entries, retries failures at most three times and is idempotent", () => {
    const keys = ["a", "b", "c"];
    const at = "2026-11-08T10:00:00.000Z";
    let log: EvidenceAttempt[] = [];
    expect(nextBacklogBatch(keys, log, 2)).toEqual(["a", "b"]);
    log = [...log, planAttempt("a", log, "draft_ready", null, null, "u", at), planAttempt("b", log, "failed", null, "timeout", "u", at)];
    expect(nextBacklogBatch(keys, log, 5)).toEqual(["c", "b"]);
    log = [...log, planAttempt("b", log, "failed", null, "timeout", "u", at)];
    log = [...log, planAttempt("b", log, "failed", null, "timeout", "u", at)];
    expect(nextBacklogBatch(keys, log, 5)).toEqual(["c"]);
    expect(backlogProgress(keys, log)).toMatchObject({ draftReady: 1, failedExhausted: 1, notStarted: 1 });
  });
  it("stores attempts append-only on the device", async () => {
    const store = new InMemoryReviewLedgerStore();
    const a = planAttempt("k", [], "no_evidence_found", null, null, "u", "2026-11-08T10:00:00.000Z");
    expect(await appendEvidenceAttempt(a, store)).toBe("stored");
    expect(await appendEvidenceAttempt({ ...a, status: "draft_ready" }, store)).toBe("duplicate");
    expect((await listEvidenceAttempts(store)).map((x) => x.status)).toEqual(["no_evidence_found"]);
  });
});

// ------------------------------------------------------------ attestation and governance

describe("P41 server attestation of Researcher decisions", () => {
  const evidenceDraft = async () => {
    const { deps } = mockDeps({ ai: AI_GOOD });
    const r = await draftInterpretationCore({ key: interpretationKey(VITD_ID), concept: VITD_CONCEPT, refIds: ["pmid:90000001", "pmid:90000002"], selection: "researcher_explicit" }, fresh(deps));
    if (!r.ok) throw new Error(r.message);
    return r.bundle;
  };
  it("an AI-assisted draft cannot be approved without the Researcher's evidence appraisal", async () => {
    const d = toInterpretationDraft(await evidenceDraft());
    expect(d.evidenceStrength.level).toBe("not_assessed");
    expect(approvalProblem(VITD_ID, d)).not.toBeNull();
    expect(d.citations.map((c) => c.id).sort()).toEqual(["pmid:90000001", "pmid:90000002"]);
    expect(d.content.spaceflightRelevance).toBeNull();
  });
  it("an unattested device approval is not applied; a forged or foreign attestation is refused", async () => {
    const d = { ...toInterpretationDraft(await evidenceDraft()), evidenceStrength: { level: "low" as const, basis: "Two synthetic abstracts reviewed by the Researcher." } };
    const plan = await planApproval([], VITD_ID, d, SYNTHETIC_DEMO_APPROVAL_ACK, RESEARCHER);
    if (!plan.ok) throw new Error(plan.reason);
    const ev = await sealInterpretationEvent(plan.body);
    const pending = await buildVerifiedSnapshot(REGISTRY, [ev], SERVER_TRUST);
    expect(pending.records.find((r) => r.key === ev.key)?.lifecycle).toBe("awaiting_attestation");
    // Another account cannot obtain an attestation for this event.
    expect((await attestDecisionCore(ev, { env: (n) => (n === "P37_CATALOG_SIGNING_KEY" ? SERVER_SECRET : undefined), now: () => new Date(), userId: "someone-else" })).ok).toBe(false);
    // A tampered event is refused.
    expect((await attestDecisionCore({ ...ev, contentSha256: "0".repeat(64) }, { env: () => SERVER_SECRET, now: () => new Date(), userId: RESEARCHER.userId })).ok).toBe(false);
    // Missing configuration fails closed.
    expect((await attestDecisionCore(ev, { env: () => undefined, now: () => new Date(), userId: RESEARCHER.userId })).ok).toBe(false);
    const att = await attestDecisionCore(ev, { env: () => SERVER_SECRET, now: () => new Date("2026-11-08T10:00:05.000Z"), userId: RESEARCHER.userId });
    if (!att.ok) throw new Error(att.message);
    // A device trusting a different key (e.g. the bundled production key) refuses it.
    expect((await planAttestation([ev], att.attestation, RESEARCHER, [{ keyId: INTERPRETATION_ATTESTATION_KEY_ID, publicKeySpkiBase64: BUNDLED_ATTESTATION_KEYS[0]!.publicKeySpkiBase64 === serverKey.publicKeySpkiBase64 ? "x" : BUNDLED_ATTESTATION_KEYS[0]!.publicKeySpkiBase64, environment: "interpretation_attestation" }])).ok).toBe(false);
    const p2 = await planAttestation([ev], att.attestation, RESEARCHER, SERVER_TRUST);
    if (!p2.ok) throw new Error(p2.reason);
    const applied = await buildVerifiedSnapshot(REGISTRY, [ev, await sealInterpretationEvent(p2.body)], SERVER_TRUST);
    expect(applied.records.find((r) => r.key === ev.key)?.lifecycle).toBe("approved");
  });
  it("a rejected draft is recorded with its reason and approves nothing", async () => {
    const plan = planRejectDraft([], VITD_ID, "Excerpts do not support the decrease claim.", RESEARCHER);
    if (!plan.ok) throw new Error(plan.reason);
    const snap = await buildVerifiedSnapshot(REGISTRY, [await sealInterpretationEvent(plan.body)], SERVER_TRUST);
    const rec = snap.records.find((r) => r.key === interpretationKey(VITD_ID))!;
    expect(rec.lifecycle).toBe("rejected");
    expect(rec.status).toBe("pending");
    expect(planRejectDraft([], VITD_ID, "short", RESEARCHER).ok).toBe(false);
    expect(planRejectDraft([], VITD_ID, "A long enough reason.", { ...RESEARCHER, roles: ["ground_medical"] }).ok).toBe(false);
  });
});

// ------------------------------------------------------------ synthetic end-to-end

describe("P41 synthetic end-to-end: unknown → evidence → draft → review → activation → reimport → comparison → offline", () => {
  it("runs the whole governed path with synthetic data and no fabricated approval", async () => {
    const store = new InMemoryReviewLedgerStore();
    const base = await buildVerifiedSnapshot(REGISTRY, [], SERVER_TRUST);
    // 1. An unknown biomarker label arrives (review-only) for the already activated synthetic term.
    const unknown: CandidateSourceTerm = {
      termId: "ubt-7b25ce69", originalLabels: ["25-OH vitamin D3 (synthetic lab label)"], exactUnit: "ng/mL", candidateMetricIds: [], specimen: "serum", method: null, sourceDocumentSha256: ["b".repeat(64)],
      origin: { kind: "p36_submitted_term", missionId: MISSION, provenance: "synthetic", submissionId: "79291202-436a-4568-af8a-5458640913eb" },
    };
    const [cand] = deriveResearchCandidates([unknown], base);
    expect(cand!.identification).toBe("no_safe_match");
    expect(JSON.stringify(cand)).not.toMatch(/"value"/);
    // 2. Literature retrieval and AI draft for the candidate (mocked providers).
    const { deps } = mockDeps({ ai: AI_GOOD });
    const d1 = fresh(deps);
    const s = await searchLiteratureCore(cand!.key, { label: "25(OH) Vitamin D", aliases: [], domain: "bone" }, d1);
    if (!s.ok) throw new Error(s.message);
    const dr = await draftInterpretationCore({ key: cand!.key, concept: VITD_CONCEPT, refIds: s.bundle.references.map((r) => r.refId).filter((r) => r.startsWith("pmid:")), selection: "researcher_explicit" }, d1);
    if (!dr.ok) throw new Error(dr.message);
    await appendEvidenceAttempt(planAttempt(cand!.key, [], dr.bundle.status, dr.bundle, null, RESEARCHER.userId, "2026-11-08T10:00:00.000Z"), store);
    // 3. Activation already exists for this term (Ground Medical, unchanged) → the candidate maps to the activated identity.
    const activated = activatedIdentityFor(cand!, base)!;
    expect(activated.key).toBe(interpretationKey(VITD_ID));
    expect(activated.status).toBe("pending");
    // 4. Researcher reviews the stored draft, appraises evidence, approves one entry; server attests.
    const stored = (await listEvidenceAttempts(store))[0]!.bundle!;
    const draft = { ...toInterpretationDraft(stored), evidenceStrength: { level: "low" as const, basis: "Two synthetic fixture abstracts; excerpts checked by the Researcher." } };
    const plan = await planApproval([], activated.identity, draft, SYNTHETIC_DEMO_APPROVAL_ACK, RESEARCHER);
    if (!plan.ok) throw new Error(plan.reason);
    const approval = await appendInterpretationEvent(plan.body, store);
    const att = await attestDecisionCore(approval, { env: () => SERVER_SECRET, now: () => new Date("2026-11-08T10:01:00.000Z"), userId: RESEARCHER.userId });
    if (!att.ok) throw new Error(att.message);
    const ap = await planAttestation(await listInterpretationEvents(store), att.attestation, RESEARCHER, SERVER_TRUST);
    if (!ap.ok) throw new Error(ap.reason);
    await appendInterpretationEvent(ap.body, store);
    // 5. Offline: the snapshot is rebuilt from the encrypted local ledger only (no fetch available).
    const offline = await loadVerifiedInterpretationSnapshot(store, SERVER_TRUST);
    expect(offline.ledger.verified).toBe(true);
    const rec = offline.records.find((r) => r.key === activated.key)!;
    expect(rec.lifecycle).toBe("approved");
    expect(offline.records.filter((r) => r.status === "approved").length).toBe(1);
    // 6. A later synthetic examination in the same exact unit reuses the approved interpretation; other units/real data do not.
    const m = matchInterpretation(offline, { metricId: VITD_ID.catalogId, unit: "ng/mL", domain: "bone", missionId: MISSION, provenance: "synthetic" });
    expect(m.exact?.status).toBe("approved");
    expect(matchInterpretation(offline, { metricId: VITD_ID.catalogId, unit: "nmol/L", domain: "bone", missionId: MISSION, provenance: "synthetic" }).exact?.status).not.toBe("approved");
    expect(matchInterpretation(offline, { metricId: VITD_ID.catalogId, unit: "ng/mL", domain: "bone", missionId: MISSION, provenance: "real" }).exact?.status).not.toBe("approved");
    // 7. Examination comparison stays descriptive.
    const comp = buildLongitudinalComparison([row("e1", "30", "2026-09-01", { datePrecision: "date" }), row("e2", "27", "2026-10-01", { datePrecision: "date" }), row("e3", "24.5", "2026-11-01", { datePrecision: "date" })], "ng/mL");
    expect(comp.baselineToLatest).toMatchObject({ absolute: -5.5, percent: -18.3, direction: "lower" });
    expect(comp.tone.tone).toBe("neutral");
  });
});
