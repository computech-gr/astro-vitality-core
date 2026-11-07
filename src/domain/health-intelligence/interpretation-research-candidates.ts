/**
 * P41 — dynamic discovery of unknown biomarkers for interpretation research (pure).
 *
 * Input: review-only unknown-biomarker terms (P36 submitted terms, or local
 * Unknown Biomarker Review terms). They keep the existing workflow: nothing
 * here saves an observation, approves a term, activates a catalog entry or
 * turns a rejected observation into an accepted one.
 *
 * Each term is identified deterministically against the interpretation
 * snapshot by exact normalized label (display name, catalog ID, recognized
 * alias or intake candidate catalog ID) AND exact unit. Anything that is not a
 * safe exact match becomes one research candidate per normalized label + exact
 * unit (shared across missions, so work is never duplicated). Values are never
 * copied into a candidate: only labels, unit, method/specimen text as reported,
 * source fingerprints and origin references.
 */
import { interpretationKey, type InterpretationDomain, type InterpretationIdentity, type InterpretationSnapshot, type ResolvedInterpretation } from "./biomarker-interpretation";
import type { LiteratureConcept } from "./interpretation-evidence";

export interface CandidateSourceTerm {
  termId: string;
  originalLabels: string[];
  exactUnit: string;
  candidateMetricIds: string[];
  /** As reported by the source; never inferred. */
  specimen: string | null;
  method: string | null;
  sourceDocumentSha256: string[];
  origin: { kind: "p36_submitted_term" | "local_unknown_term"; missionId: string | null; provenance: "synthetic" | "real"; submissionId: string | null };
  domainHint?: InterpretationDomain | null;
}
export type IdentificationStatus =
  | "matched_approved_interpretation"
  | "matched_registry_record"
  | "unit_conflict"
  | "domain_conflict"
  | "no_safe_match";
export const IDENTIFICATION_LABELS: Record<IdentificationStatus, string> = {
  matched_approved_interpretation: "Exact match to an approved interpretation (reused automatically after catalog activation)",
  matched_registry_record: "Exact match to an existing interpretation record (no new candidate)",
  unit_conflict: "Known name, different unit — not equivalent; needs its own interpretation",
  domain_conflict: "Name matches records in more than one domain — manual decision required",
  no_safe_match: "No safe match — new interpretation-research candidate",
};
export interface ResearchCandidate {
  candidateId: string;
  /** Ledger key used for evidence bundles of this candidate. */
  key: string;
  label: string;
  aliases: string[];
  exactUnit: string;
  normalizedLabel: string;
  specimen: string[];
  method: string[];
  sourceFingerprints: string[];
  origins: CandidateSourceTerm["origin"][];
  termIds: string[];
  identification: IdentificationStatus;
  matches: { key: string; catalogId: string; unit: string | null; domain: InterpretationDomain; status: ResolvedInterpretation["status"] }[];
  domainHints: InterpretationDomain[];
  note: string;
}

export const normalizeCandidateLabel = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");

function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
export const candidateIdFor = (label: string, unit: string) => `irc-${fnv(`${normalizeCandidateLabel(label)}|${unit.trim()}`)}`;
export const candidateKey = (candidateId: string) => `candidate|${candidateId}`;

function namesOf(r: ResolvedInterpretation): string[] {
  return [r.identity.displayName, r.identity.catalogId, ...r.aliases].map(normalizeCandidateLabel);
}

/** Deterministic identification of one label + exact unit against the snapshot. */
export function identifyTerm(labels: readonly string[], unit: string, candidateMetricIds: readonly string[], snapshot: InterpretationSnapshot) {
  const wanted = new Set([...labels, ...candidateMetricIds].map(normalizeCandidateLabel));
  const hits = snapshot.records.filter((r) => namesOf(r).some((n) => wanted.has(n)));
  const exact = hits.filter((r) => r.identity.unit === unit.trim());
  const domains = [...new Set(hits.map((r) => r.identity.domain))];
  const matches = hits.map((r) => ({ key: r.key, catalogId: r.identity.catalogId, unit: r.identity.unit, domain: r.identity.domain, status: r.status }));
  const exactDomains = new Set(exact.map((r) => r.identity.domain));
  let identification: IdentificationStatus;
  if (exactDomains.size > 1 || (!exact.length && domains.length > 1)) identification = "domain_conflict";
  else if (exact.some((r) => r.status === "approved")) identification = "matched_approved_interpretation";
  else if (exact.length) identification = "matched_registry_record";
  else if (hits.some((r) => r.identity.unit !== null)) identification = "unit_conflict";
  else identification = "no_safe_match";
  return { identification, matches, domains };
}

/** One candidate per normalized label + exact unit; candidates exist only when no safe exact match exists. */
export function deriveResearchCandidates(terms: readonly CandidateSourceTerm[], snapshot: InterpretationSnapshot): ResearchCandidate[] {
  const out = new Map<string, ResearchCandidate>();
  for (const t of terms) {
    const label = t.originalLabels[0]?.trim();
    if (!label || !t.exactUnit.trim()) continue;
    const id = identifyTerm(t.originalLabels, t.exactUnit, t.candidateMetricIds, snapshot);
    if (id.identification === "matched_registry_record" || id.identification === "matched_approved_interpretation") continue;
    const candidateId = candidateIdFor(label, t.exactUnit);
    const cur = out.get(candidateId);
    const merged: ResearchCandidate = cur
      ? {
          ...cur,
          aliases: [...new Set([...cur.aliases, ...t.originalLabels.slice(1), ...t.originalLabels.filter((l) => l !== cur.label)])].slice(0, 6),
          specimen: [...new Set([...cur.specimen, ...(t.specimen ? [t.specimen] : [])])],
          method: [...new Set([...cur.method, ...(t.method ? [t.method] : [])])],
          sourceFingerprints: [...new Set([...cur.sourceFingerprints, ...t.sourceDocumentSha256])].sort(),
          origins: [...cur.origins, t.origin],
          termIds: [...new Set([...cur.termIds, t.termId])].sort(),
          domainHints: [...new Set([...cur.domainHints, ...(t.domainHint ? [t.domainHint] : [])])],
        }
      : {
          candidateId,
          key: candidateKey(candidateId),
          label,
          aliases: [...new Set(t.originalLabels.slice(1))].slice(0, 6),
          exactUnit: t.exactUnit.trim(),
          normalizedLabel: normalizeCandidateLabel(label),
          specimen: t.specimen ? [t.specimen] : [],
          method: t.method ? [t.method] : [],
          sourceFingerprints: [...new Set(t.sourceDocumentSha256)].sort(),
          origins: [t.origin],
          termIds: [t.termId],
          identification: id.identification,
          matches: id.matches,
          domainHints: [...new Set([...id.domains, ...(t.domainHint ? [t.domainHint] : [])])],
          note: "",
        };
    merged.note = [
      IDENTIFICATION_LABELS[merged.identification],
      merged.specimen.length > 1 || merged.method.length > 1 ? "Different specimens or methods were reported for this label; they are not treated as equivalent." : null,
      merged.specimen.length ? null : "Specimen not reported.",
      merged.method.length ? null : "Method not reported.",
      "Protocol not reported.",
    ].filter(Boolean).join(" ");
    out.set(candidateId, merged);
  }
  return [...out.values()].sort((a, b) => a.normalizedLabel.localeCompare(b.normalizedLabel) || a.exactUnit.localeCompare(b.exactUnit));
}

/** Literature concept for a candidate: label and reported aliases only (never values or identities). */
export const candidateConcept = (c: ResearchCandidate): LiteratureConcept => ({ label: c.label, aliases: c.aliases.slice(0, 4), domain: c.domainHints.length === 1 ? c.domainHints[0]! : null });
export const identityConcept = (i: InterpretationIdentity, aliases: readonly string[] = []): LiteratureConcept => ({
  label: i.displayName,
  aliases: aliases.filter((a) => normalizeCandidateLabel(a) !== normalizeCandidateLabel(i.displayName)).slice(0, 4),
  domain: i.domain,
});

/**
 * After Ground Medical activation, the activated catalog identity that came
 * from one of the candidate's submitted terms (exact term ID + exact unit).
 * Only such an identity may receive the candidate's research draft, and only
 * through an explicit Researcher action.
 */
export function activatedIdentityFor(c: ResearchCandidate, snapshot: InterpretationSnapshot): ResolvedInterpretation | null {
  return (
    snapshot.records.find((r) => r.activation && c.termIds.includes(r.activation.termId) && r.identity.unit === c.exactUnit) ?? null
  );
}

export const candidateLedgerKey = (c: ResearchCandidate) => c.key;
export const identityLedgerKey = (i: InterpretationIdentity) => interpretationKey(i);
