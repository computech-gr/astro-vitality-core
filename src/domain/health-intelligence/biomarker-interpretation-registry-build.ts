/**
 * P40 — deterministic builder of the Scientific Biomarker Interpretation
 * Registry (data/scientific/biomarker-interpretation-registry.v1.json).
 *
 * Bone and Cardiovascular records quote the existing English handbook layers
 * verbatim by exact catalog ID (pending hypotheses, never approved). Immune and
 * Behavioral catalog IDs and every activated synthetic demo identity receive a
 * pending record with no content. Demo records may carry a *proposed* handbook
 * link only when the submitted candidate ID has the same domain and identical
 * unit text; it is never applied. Nothing here approves or activates anything.
 */
import {
  localizedBoneVariables,
  localizedCardiovascularMetrics,
} from "@/domain/scientific-localization/handbooks";
import proposedCatalog from "../../../data/scientific/p355-proposed-domain-catalog.v1.json";
import boneSource from "../../../data/scientific/bone-health-handbook-v7.catalog.json";
import {
  INTERPRETATION_REGISTRY_SCHEMA,
  NOT_ASSESSED,
  interpretationKey,
  type Citation,
  type Claim,
  type InterpretationContent,
  type InterpretationDomain,
  type InterpretationIdentity,
  type InterpretationRegistry,
  type RegistryRecord,
} from "./biomarker-interpretation";

export const REGISTRY_VERSION = 1;
export const BONE_HANDBOOK_TITLE =
  "Astronaut Bone Health Handbook v7 (Nikolas) — English presentation layer (machine-assisted)";
export const CV_HANDBOOK_TITLE =
  "NASA Cardiovascular Handbook (Nikolas) — English presentation layer (machine-assisted)";
const TRANSLATION_LIMIT =
  "Machine-assisted English of the Greek source handbook; pending independent scientific review.";

export interface DemoActiveEntry {
  demoId: string;
  termId: string;
  displayName: string;
  unit: string;
  domain: string;
  missionId: string;
  submissionId: string;
  decisionEventId: string;
  activationEventId: string;
  activatedAt: string;
  revoked: boolean;
}
export interface TermMetadata {
  termId: string;
  candidateMetricIds: string[];
}

const claim = (text: string | null | undefined, cid: string): Claim | null =>
  text && text.trim() ? { text: text.trim(), citationIds: [cid] } : null;

function pendingRecord(
  identity: InterpretationIdentity,
  extra: Partial<RegistryRecord> = {},
): RegistryRecord {
  return {
    key: interpretationKey(identity),
    identity,
    sourceUnitText: null,
    specimenText: null,
    content: null,
    contentOrigin: "none",
    citations: [],
    evidenceStrength: NOT_ASSESSED,
    reviewStatus: "PENDING_SCIENTIFIC_REVIEW",
    sourceReviewStatus: null,
    reviewer: null,
    approvalHistory: [],
    contentSha256: null,
    proposedLinks: [],
    activation: null,
    ...extra,
  };
}

const hasClaims = (c: InterpretationContent) =>
  Boolean(c.function || c.increaseContext || c.decreaseContext || c.generalContext || c.associatedBiomarkers || c.comparabilityRequirements.length);

export function buildInterpretationRegistry(input: {
  sources: { file: string; sha256: string }[];
  demoEntries: readonly DemoActiveEntry[];
  termMetadata: readonly TermMetadata[];
}): InterpretationRegistry {
  const records: RegistryRecord[] = [];
  const tiers = new Map(boneSource.variables.map((v) => [v.id, v.handbookEvidenceTier]));
  const bone = localizedBoneVariables();
  const cv = localizedCardiovascularMetrics();

  for (const v of bone) {
    const cid = `hb-bone-v7:${v.id}`;
    const citation: Citation = { id: cid, kind: "governed_handbook", title: BONE_HANDBOOK_TITLE, locator: `Variable ${v.id} (${v.name})`, url: null };
    const content: InterpretationContent = {
      function: claim(v.what, cid),
      increaseContext: claim(v.increase, cid),
      decreaseContext: claim(v.decrease, cid),
      generalContext: null,
      spaceflightRelevance: null,
      associatedBiomarkers: null,
      comparabilityRequirements: v.implementationNotes ? [{ text: v.implementationNotes, citationIds: [cid] }] : [],
      limitations: [TRANSLATION_LIMIT],
    };
    const ok = hasClaims(content);
    records.push(
      pendingRecord(
        { environment: "governed_handbook", catalogId: v.id, domain: "bone", unit: null, missionId: null, displayName: v.name },
        {
          sourceUnitText: v.unit,
          specimenText: v.specimen,
          content: ok ? content : null,
          contentOrigin: ok ? "handbook_verbatim_pending" : "none",
          citations: ok ? [citation] : [],
          evidenceStrength: {
            level: "not_assessed",
            basis: `Handbook evidence tier ${tiers.get(v.id) ?? "not stated"} as stated by the source; not independently appraised.`,
          },
          sourceReviewStatus: v.reviewStatus,
        },
      ),
    );
  }

  for (const m of cv) {
    const cid = `hb-cv-v1:${m.id}`;
    const citation: Citation = { id: cid, kind: "governed_handbook", title: CV_HANDBOOK_TITLE, locator: `Metric ${m.id} (${m.name})`, url: null };
    const content: InterpretationContent = {
      function: claim(m.biology, cid),
      increaseContext: null,
      decreaseContext: null,
      generalContext: claim(m.context, cid),
      spaceflightRelevance: null,
      associatedBiomarkers: claim(m.linkage, cid),
      comparabilityRequirements: [],
      limitations: [TRANSLATION_LIMIT],
    };
    const ok = hasClaims(content);
    records.push(
      pendingRecord(
        { environment: "governed_handbook", catalogId: m.id, domain: "cardiovascular", unit: null, missionId: null, displayName: m.name },
        {
          sourceUnitText: m.unit || null,
          content: ok ? content : null,
          contentOrigin: ok ? "handbook_verbatim_pending" : "none",
          citations: ok ? [citation] : [],
          evidenceStrength: { level: "not_assessed", basis: "No evidence tier is stated in the source handbook; not independently appraised." },
          sourceReviewStatus: m.reviewStatus,
        },
      ),
    );
  }

  for (const e of proposedCatalog.entries) {
    if (e.domain !== "immune" && e.domain !== "behavioral") continue;
    records.push(
      pendingRecord(
        { environment: "domain_catalog", catalogId: e.id, domain: e.domain, unit: null, missionId: null, displayName: e.name },
        { sourceReviewStatus: e.status },
      ),
    );
  }

  const handbookUnits = new Map<string, { domain: InterpretationDomain; unit: string | null }>([
    ...bone.map((v) => [v.id, { domain: "bone" as const, unit: v.unit }] as const),
    ...cv.map((m) => [m.id, { domain: "cardiovascular" as const, unit: m.unit || null }] as const),
  ]);
  const meta = new Map(input.termMetadata.map((t) => [t.termId, t]));
  for (const d of input.demoEntries) {
    if (d.revoked) continue;
    const domain = d.domain as InterpretationDomain;
    const proposedLinks = (meta.get(d.termId)?.candidateMetricIds ?? []).flatMap((id) => {
      const h = handbookUnits.get(id);
      return h && h.domain === domain && h.unit === d.unit
        ? [{ catalogId: id, basis: "Submitted candidate catalog ID with the same domain and identical unit text; identity equivalence not reviewed." }]
        : [];
    });
    records.push(
      pendingRecord(
        { environment: "synthetic_demo", catalogId: d.demoId, domain, unit: d.unit, missionId: d.missionId, displayName: d.displayName },
        {
          proposedLinks,
          activation: {
            termId: d.termId,
            submissionId: d.submissionId,
            decisionEventId: d.decisionEventId,
            activationEventId: d.activationEventId,
            activatedAt: d.activatedAt,
          },
        },
      ),
    );
  }

  records.sort((a, b) => a.key.localeCompare(b.key));
  return {
    schema: INTERPRETATION_REGISTRY_SCHEMA,
    version: REGISTRY_VERSION,
    note: "Every record is PENDING_SCIENTIFIC_REVIEW. Handbook text is quoted verbatim as a pending hypothesis; Immune, Behavioral and synthetic demo identities have no interpretation until a Researcher authors, cites and approves it entry by entry. Approved records enter only through an owner-reviewed merge of an exported approval package.",
    sources: input.sources,
    records,
  };
}
