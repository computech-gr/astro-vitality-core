/**
 * P41.1 regression tests: scientific relevance gate for literature evidence,
 * using the ACTUAL G-CSF search results observed on 2026-11-07 (PubMed + NASA
 * NTRS), recorded verbatim in tests/fixtures/p41-1-gcsf-observed-references.v1.json.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SYNTHETIC_DEMO_APPROVAL_ACK,
  approvalProblem,
  buildVerifiedSnapshot,
  planApproval,
  sealInterpretationEvent,
  type ActorContext,
  type InterpretationIdentity,
} from "../../src/domain/health-intelligence/biomarker-interpretation";
import { populationTag, toInterpretationDraft, verifyDraftClaims, type EvidenceBundle, type EvidenceReference, type LiteratureConcept } from "../../src/domain/health-intelligence/interpretation-evidence";
import {
  INSUFFICIENT_RELEVANT_EVIDENCE,
  assessRelevance,
  automaticDraftRefIds,
  relevanceGate,
  selectableForDraft,
} from "../../src/domain/health-intelligence/literature-relevance";
import { draftInterpretationCore, type ResearchDeps } from "../../src/lib/interpretation-research.server";
import { deriveInterpretationAttestationKey, INTERPRETATION_ATTESTATION_KEY_ID, type AttestationTrustedKey } from "../../src/domain/health-intelligence/interpretation-attestation";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OBSERVED = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/p41-1-gcsf-observed-references.v1.json"), "utf8")) as { concept: LiteratureConcept; references: EvidenceReference[] };
const REGISTRY = JSON.parse(readFileSync(join(ROOT, "data/scientific/biomarker-interpretation-registry.v1.json"), "utf8"));
const GCSF: LiteratureConcept = OBSERVED.concept;
const REFS = OBSERVED.references;
const ref = (id: string) => REFS.find((r) => r.refId === id)!;
const cls = (id: string) => assessRelevance(ref(id), GCSF).classification;

const EMBRYO = "pmid:35325124";
const MYELOPOIESIS = "pmid:36481580";
const FILGRASTIM_FOOT = "pmid:12637979";
const PALMER = "pmid:38245340";
const NEUTROPENIA = "pmid:8966113";
const ONCOSTATIN = "pmid:1338575";
const MOISTURE = "ntrs:20000095574";
const CD18_MICE = "ntrs:20040087522";
const INTRACRANIAL = "ntrs:20080009499";
const COSMIC_RAY = "ntrs:20110022513";

describe("P41.1 observed G-CSF failure cases are classified by scientific relevance, not keyword hits", () => {
  it("uses the real observed search concept and all ten retrieved references", () => {
    expect(GCSF.label).toBe("G-CSF");
    expect(REFS.map((r) => r.refId)).toEqual([EMBRYO, MYELOPOIESIS, FILGRASTIM_FOOT, PALMER, NEUTROPENIA, ONCOSTATIN, MOISTURE, CD18_MICE, INTRACRANIAL, COSMIC_RAY]);
  });
  it("marks the unrelated NASA technical reports irrelevant (atmospheric moisture, cosmic-ray electrons, intracranial CSF model)", () => {
    expect(cls(MOISTURE)).toBe("irrelevant");
    expect(assessRelevance(ref(MOISTURE), GCSF).reason).toContain("clear sky fluxes");
    expect(cls(COSMIC_RAY)).toBe("irrelevant");
    expect(assessRelevance(ref(COSMIC_RAY), GCSF).reason).toContain("no biological or clinical content");
    expect(cls(INTRACRANIAL)).toBe("irrelevant");
    expect(assessRelevance(ref(INTRACRANIAL), GCSF).reason).toContain("“CSF”");
  });
  it("marks superficially matching PubMed articles irrelevant (embryo transfer, passing mentions)", () => {
    expect(cls(EMBRYO)).toBe("irrelevant");
    expect(assessRelevance(ref(EMBRYO), GCSF).reason).toContain("administered intervention");
    expect(cls(ONCOSTATIN)).toBe("irrelevant");
    expect(assessRelevance(ref(ONCOSTATIN), GCSF).reason).toContain("only in passing");
    expect(cls(NEUTROPENIA)).toBe("irrelevant");
  });
  it("needs manual review for therapy, animal and in vitro studies", () => {
    expect(cls(FILGRASTIM_FOOT)).toBe("potentially_relevant");
    expect(assessRelevance(ref(FILGRASTIM_FOOT), GCSF).signals.administeredAsIntervention).toBe(true);
    expect(cls(CD18_MICE)).toBe("potentially_relevant");
    expect(assessRelevance(ref(CD18_MICE), GCSF).reason).toContain("animal");
    expect(cls(MYELOPOIESIS)).toBe("potentially_relevant");
    expect(assessRelevance(ref(MYELOPOIESIS), GCSF).reason).toContain("in vitro");
  });
  it("keeps the human plasma measurement relevant", () => {
    const a = assessRelevance(ref(PALMER), GCSF);
    expect(a.classification).toBe("relevant");
    expect(a.signals.measuredInSource).toBe(true);
    expect(a.signals.specimen).toContain("plasma");
    expect(a.reason).toContain("Plasma G-CSF");
  });
  it("never treats the spaceflight keyword tag as relevance", () => {
    // Observed: the embryo-transfer meta-analysis was keyword-tagged spaceflight/analog because of clinical "bed rest".
    expect(ref(EMBRYO).population).toBe("spaceflight_or_analog");
    expect(cls(EMBRYO)).toBe("irrelevant");
    expect(populationTag(`${ref(EMBRYO).title} ${ref(EMBRYO).inspectedText}`)).toBe("terrestrial_or_unspecified");
    expect(populationTag(`${ref(FILGRASTIM_FOOT).title} ${ref(FILGRASTIM_FOOT).inspectedText}`)).toBe("terrestrial_or_unspecified");
    expect(populationTag("Six-degree head-down bed rest study")).toBe("spaceflight_or_analog");
  });
  it("treats metadata-only or unconfirmed records as insufficient information and never selectable", () => {
    const meta = { ...ref(PALMER), inspected: "metadata_only" as const, inspectedText: null };
    expect(assessRelevance(meta, GCSF).classification).toBe("insufficient_information");
    expect(selectableForDraft(assessRelevance(meta, GCSF), meta)).toBe(false);
    expect(assessRelevance({ ...ref(PALMER), existence: "not_found" }, GCSF).classification).toBe("insufficient_information");
  });
});

describe("P41.1 relevance gate for drafting", () => {
  it("automatic batch processing uses relevant references only", () => {
    expect(automaticDraftRefIds(REFS, GCSF)).toEqual([PALMER]);
  });
  it("potentially relevant references require an explicit Researcher selection; irrelevant ones are never used", () => {
    const picked = [ref(MYELOPOIESIS), ref(FILGRASTIM_FOOT), ref(EMBRYO), ref(MOISTURE)];
    expect(relevanceGate(picked, GCSF, "automatic_batch").used).toEqual([]);
    const explicit = relevanceGate(picked, GCSF, "researcher_explicit");
    expect(explicit.used.map((r) => r.refId)).toEqual([MYELOPOIESIS, FILGRASTIM_FOOT]);
    expect(explicit.excluded.map((x) => [x.refId, x.classification])).toEqual([[EMBRYO, "irrelevant"], [MOISTURE, "irrelevant"]]);
  });
});

// ------------------------------------------------------------ server drafting with the observed records (mocked providers)

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pubmedXml = (ids: string[]) =>
  `<PubmedArticleSet>${ids
    .map((id) => REFS.find((r) => r.refId === `pmid:${id}`))
    .filter((r): r is EvidenceReference => !!r)
    .map((r) => `<PubmedArticle><MedlineCitation><PMID Version="1">${r.identifiers.pmid}</PMID><Article><ArticleTitle>${xml(r.title)}</ArticleTitle><Abstract><AbstractText>${xml(r.inspectedText ?? "")}</AbstractText></Abstract></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="pubmed">${r.identifiers.pmid}</ArticleId></ArticleIdList></PubmedData></PubmedArticle>`)
    .join("")}</PubmedArticleSet>`;

function observedDeps(ai: unknown): { deps: ResearchDeps; aiBodies: string[] } {
  const aiBodies: string[] = [];
  const f = async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("efetch.fcgi")) return new Response(pubmedXml(new URL(url).searchParams.get("id")!.split(",")));
    const nt = url.match(/ntrs\.nasa\.gov\/api\/citations\/(\d{11})$/);
    if (nt) {
      const r = REFS.find((x) => x.refId === `ntrs:${nt[1]}`)!;
      return new Response(JSON.stringify({ id: Number(nt[1]), title: r.title, abstract: r.inspectedText, distribution: "PUBLIC" }));
    }
    if (url.includes("ai.gateway.lovable.dev")) {
      aiBodies.push(String(init?.body));
      return new Response(JSON.stringify({ model: "openai/gpt-6-astra", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(ai) }] }] }));
    }
    return new Response("not found", { status: 404 });
  };
  return { aiBodies, deps: { env: (n) => (n === "LOVABLE_API_KEY" ? "test-key" : undefined), fetch: f as unknown as typeof fetch, now: () => new Date("2026-11-08T10:00:00.000Z"), userId: `p411-${Math.random()}`, sleep: async () => undefined } };
}

const PALMER_EXCERPT = "Plasma G-CSF, IL1RA, MCP-1, MIP-1β, TNFα, and VEGF were decreased during at least one winterover timepoint";
const EMBRYO_EXCERPT = "Other pharmacological add-ons also showed a beneficial effect including granulocyte colony-stimulating factor";
const AI = {
  schemaVersion: "p41.1",
  claims: [
    { field: "spaceflightRelevance", text: "Plasma G-CSF was reported lower during at least one Antarctic winter-over timepoint in a ground-based analog.", evidenceScope: "spaceflight_specific", support: [{ refId: PALMER, excerpt: PALMER_EXCERPT }] },
    { field: "generalContext", text: "G-CSF has been studied as an add-on during embryo transfer.", evidenceScope: "general_biomedical", support: [{ refId: EMBRYO, excerpt: EMBRYO_EXCERPT }] },
  ],
  contradictions: [],
  gaps: [],
};
const ALL_IDS = REFS.map((r) => r.refId);

describe("P41.1 server drafting applies the same relevance gate", () => {
  it("refuses to call the AI when only irrelevant references are selected and reports insufficient relevant evidence", async () => {
    const { deps, aiBodies } = observedDeps(AI);
    for (const selection of ["automatic_batch", "researcher_explicit"] as const) {
      const r = await draftInterpretationCore({ key: "gcsf", concept: GCSF, refIds: [EMBRYO, ONCOSTATIN, NEUTROPENIA, MOISTURE, INTRACRANIAL, COSMIC_RAY], selection }, deps);
      if (!r.ok) throw new Error(r.message);
      expect(r.bundle.draft).toBeNull();
      expect(r.bundle.status).toBe("insufficient_evidence");
      expect(r.bundle.gaps[0]).toStartWith(INSUFFICIENT_RELEVANT_EVIDENCE);
      expect(r.bundle.relevanceGate?.usedRefIds).toEqual([]);
      expect(r.bundle.relevanceGate?.excluded.length).toBe(6);
    }
    expect(aiBodies.length).toBe(0);
  });
  it("batch mode sends only the relevant reference to the AI, even if everything is requested", async () => {
    const { deps, aiBodies } = observedDeps(AI);
    const r = await draftInterpretationCore({ key: "gcsf", concept: GCSF, refIds: ALL_IDS, selection: "automatic_batch" }, deps);
    if (!r.ok) throw new Error(r.message);
    expect(aiBodies.length).toBe(1);
    const sent = (JSON.parse(JSON.parse(aiBodies[0]!).input[1].content) as { references: { refId: string }[] }).references.map((x) => x.refId);
    expect(sent).toEqual([PALMER]);
    expect(r.bundle.relevanceGate?.excluded.map((x) => x.refId).sort()).toEqual(ALL_IDS.filter((x) => x !== PALMER).sort());
  });
  it("explicitly selected potentially relevant references are sent; irrelevant ones still are not", async () => {
    const { deps, aiBodies } = observedDeps(AI);
    const r = await draftInterpretationCore({ key: "gcsf", concept: GCSF, refIds: [MYELOPOIESIS, FILGRASTIM_FOOT, EMBRYO], selection: "researcher_explicit" }, deps);
    if (!r.ok) throw new Error(r.message);
    const sent = (JSON.parse(JSON.parse(aiBodies[0]!).input[1].content) as { references: { refId: string }[] }).references.map((x) => x.refId);
    expect(sent).toEqual([MYELOPOIESIS, FILGRASTIM_FOOT]);
  });
  it("a verbatim excerpt from an irrelevant source cannot support a claim; the relevant one still can", async () => {
    const { deps } = observedDeps(AI);
    const r = await draftInterpretationCore({ key: "gcsf", concept: GCSF, refIds: [PALMER, EMBRYO], selection: "researcher_explicit" }, deps);
    if (!r.ok) throw new Error(r.message);
    const [palmer, embryo] = r.bundle.draft!.claims;
    expect(palmer!.verification).toBe("excerpt_found_in_inspected_text");
    expect(embryo!.verification).toBe("unresolved");
    expect(embryo!.problems.join(" ")).toContain("excluded by the scientific relevance assessment");
    const d = toInterpretationDraft(r.bundle);
    expect(d.citations.map((c) => c.id)).toEqual([PALMER]);
    expect(d.content.generalContext).toBeNull();
  });
  it("older stored bundles cannot smuggle an irrelevant citation into the editor draft", () => {
    const forged: EvidenceBundle = {
      schema: "mitochondria.interpretation-evidence-bundle.v1", key: "gcsf", concept: GCSF, queries: [], retrievedAt: "2026-11-07T00:00:00.000Z", references: REFS, providerOutcomes: [], status: "draft_ready", gaps: [],
      draft: { generatedBy: { kind: "ai_synthesis", provider: "lovable", model: "m", generatedAt: "2026-11-07T00:00:00.000Z" }, rejected: [], contradictions: [], gaps: [], status: "draft_with_verified_excerpts",
        claims: verifyDraftClaims(AI.claims, REFS).claims },
    };
    // Without a relevance gate both excerpts are found verbatim — verification alone is not relevance.
    expect(forged.draft!.claims.every((c) => c.verification === "excerpt_found_in_inspected_text")).toBe(true);
    expect(toInterpretationDraft(forged).citations.map((c) => c.id)).toEqual([PALMER]);
  });
});

describe("P41.1 a relevant, valid citation still needs independent scientific review", () => {
  it("the draft keeps evidence strength unassessed, cannot be approved as-is and stays unapplied without server attestation", async () => {
    const { deps } = observedDeps(AI);
    const r = await draftInterpretationCore({ key: "gcsf", concept: GCSF, refIds: [PALMER], selection: "automatic_batch" }, deps);
    if (!r.ok) throw new Error(r.message);
    const rec = (REGISTRY.records as { identity: InterpretationIdentity }[]).find((x) => x.identity.displayName === "G-CSF")!;
    const identity = rec.identity;
    const draft = toInterpretationDraft(r.bundle);
    expect(draft.evidenceStrength.level).toBe("not_assessed");
    expect(approvalProblem(identity, draft)).not.toBeNull();
    // Even with the Researcher's appraisal, a device approval is only "awaiting attestation" until the server signs it.
    const researcher: ActorContext = { userId: "researcher-p411", name: "Researcher", roles: ["researcher"], now: "2026-11-08T10:00:00.000Z" };
    // The draft has no "function" statement, so approval is blocked until the Researcher writes one from the cited source.
    expect((await planApproval([], identity, { ...draft, evidenceStrength: { level: "low" as const, basis: "Reviewed." } }, SYNTHETIC_DEMO_APPROVAL_ACK, researcher)).ok).toBe(false);
    const appraised = {
      ...draft,
      content: { ...draft.content, function: { text: "Synthetic test statement: G-CSF is a cytokine reported in plasma in the cited analog cohort.", citationIds: [PALMER], evidenceScope: "general_biomedical" as const } },
      evidenceStrength: { level: "low" as const, basis: "One analog cohort abstract reviewed by the Researcher." },
    };
    expect((await planApproval([], identity, appraised, SYNTHETIC_DEMO_APPROVAL_ACK, { ...researcher, roles: ["ground_medical"] })).ok).toBe(false);
    const plan = await planApproval([], identity, appraised, SYNTHETIC_DEMO_APPROVAL_ACK, researcher);
    if (!plan.ok) throw new Error(plan.reason);
    const key = await deriveInterpretationAttestationKey("test-only-p411-secret-never-deployed-0123456789abcdef");
    const trust: AttestationTrustedKey[] = [{ keyId: INTERPRETATION_ATTESTATION_KEY_ID, publicKeySpkiBase64: key.publicKeySpkiBase64, environment: "interpretation_attestation" }];
    const ev = await sealInterpretationEvent(plan.body);
    const snap = await buildVerifiedSnapshot(REGISTRY, [ev], trust);
    const out = snap.records.find((x) => x.key === ev.key)!;
    expect(out.lifecycle).toBe("awaiting_attestation");
    expect(out.status).not.toBe("approved");
  });
});
