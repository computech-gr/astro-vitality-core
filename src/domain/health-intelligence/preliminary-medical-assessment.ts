/**
 * P54 — AI-assisted preliminary medical assessment (pure, browser- and server-safe).
 *
 * Layers, never merged:
 *   1. Observations — the deterministic Biomarker Health Assessment (verified
 *      references only).
 *   2. Preliminary assessment — either built deterministically offline from (1),
 *      or drafted by AI from a de-identified evidence packet and re-validated
 *      here: every statement must cite packet observations, explanations and
 *      differentials must cite approved, cited interpretation sources, and
 *      invented numbers, history, symptoms, treatment or confirmed-diagnosis
 *      language are rejected rather than rewritten.
 *   3. Clinician review — an authorized Ground Medical member for the exact
 *      mission and crew attests a fingerprint-bound assessment. Session-only;
 *      it is not licensure, a legal signature or a confirmed diagnosis.
 * MITOCHONDRIA never records a confirmed diagnosis.
 */
import { MEASUREMENT_STATUS_LABELS, SEVERITY_MARKERS, type BiomarkerAssessmentReport, type MeasurementStatus, type Severity } from "./biomarker-health-assessment";
import { matchInterpretation, type Claim, type InterpretationSnapshot } from "./biomarker-interpretation";
import { RESEARCHER_DOMAIN_LABELS, type ResearcherDomain, type ResearcherInterpretationModel } from "./researcher-interpretation";

export const PRELIMINARY_ASSESSMENT_LABEL = "AI-assisted preliminary assessment — NOT a confirmed medical diagnosis.";
export const OFFLINE_ASSESSMENT_LABEL = "Deterministic preliminary assessment (offline, no AI) — NOT a confirmed medical diagnosis.";
export const NO_DIAGNOSIS_TEXT = "A diagnosis cannot be established from the available evidence.";
export const NO_CONFIRMED_DIAGNOSIS_TEXT = "Confirmed diagnoses: none. MITOCHONDRIA never records a confirmed diagnosis; that requires a clinician's independent examination outside this application.";
export const CLINICIAN_ACKNOWLEDGEMENT =
  "I reviewed every statement against the recorded observations and cited sources; differential considerations remain hypotheses, not confirmed diagnoses";
export const ASSESSMENT_SCHEMA_VERSION = "p54-preliminary-assessment.v1" as const;
export const PACKET_SCHEMA = "mitochondria.p54-assessment-packet.v1" as const;

// ------------------------------------------------------------ de-identified evidence packet

export interface PacketContext {
  text: string;
  citationIds: string[];
}
export interface PacketItem {
  /** Packet-local reference (O1, O2, …); never a record, crew or mission identifier. */
  ref: string;
  catalogId: string;
  name: string;
  domain: ResearcherDomain;
  value: string;
  unit: string;
  previousValue: string | null;
  change: string | null;
  status: MeasurementStatus;
  severity: Severity;
  reference: string | null;
  /** Approved, cited interpretation context (null while pending). */
  measures: PacketContext | null;
  higher: PacketContext | null;
  lower: PacketContext | null;
  comparability: PacketContext[];
  interpretationApproved: boolean;
  syntheticDemo: boolean;
}
export interface AssessmentPacket {
  schema: typeof PACKET_SCHEMA;
  provenance: "synthetic" | "real";
  items: PacketItem[];
  citations: { id: string; title: string; locator: string }[];
  domainsWithoutData: ResearcherDomain[];
  crossDomain: string[];
}

const ctx = (c: Claim | null, ns: string): PacketContext | null => (c ? { text: c.text, citationIds: c.citationIds.map((id) => `${ns}:${id}`) } : null);

/**
 * De-identified packet: no names, crew/mission/record identifiers, dates, sources
 * or free text from the crew member. Only catalog concepts, recorded values in
 * exact units, deterministic statuses and approved, cited interpretation text.
 */
export function buildAssessmentPacket(
  assessment: BiomarkerAssessmentReport,
  model: ResearcherInterpretationModel,
  snapshot: InterpretationSnapshot,
): AssessmentPacket {
  const citations = new Map<string, { id: string; title: string; locator: string }>();
  const items = assessment.entries.map((e, i): PacketItem => {
    const ns = `S${i + 1}`;
    const m = matchInterpretation(snapshot, { metricId: e.metricId, unit: e.unit, domain: e.domain, missionId: assessment.scope.missionId, provenance: assessment.scope.provenance }).exact;
    const approved = m && m.status === "approved" && m.content ? m : null;
    for (const c of approved?.citations ?? []) citations.set(`${ns}:${c.id}`, { id: `${ns}:${c.id}`, title: c.title, locator: c.locator });
    const c = approved?.content ?? null;
    const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);
    return {
      ref: `O${i + 1}`,
      catalogId: e.metricId,
      name: e.name,
      domain: e.domain,
      value: e.latest.value,
      unit: e.unit,
      previousValue: e.previous?.value ?? null,
      change:
        e.change.status === "compared" && e.change.absolute !== null
          ? `${signed(e.change.absolute)} ${e.unit}${e.change.percent !== null ? ` (${signed(e.change.percent)}%)` : ""} versus the previous comparable examination`
          : null,
      status: e.classification.status,
      severity: e.classification.severity,
      reference: e.referenceText,
      measures: ctx(c?.function ?? null, ns),
      higher: ctx(c?.increaseContext ?? null, ns),
      lower: ctx(c?.decreaseContext ?? null, ns),
      comparability: (c?.comparabilityRequirements ?? []).map((x) => ctx(x, ns)!),
      interpretationApproved: Boolean(approved),
      syntheticDemo: Boolean(e.nonClinicalLabel),
    };
  });
  const present = new Set(items.map((x) => x.domain));
  return {
    schema: PACKET_SCHEMA,
    provenance: assessment.scope.provenance,
    items,
    citations: [...citations.values()],
    domainsWithoutData: (Object.keys(RESEARCHER_DOMAIN_LABELS) as ResearcherDomain[]).filter((d) => !present.has(d)),
    crossDomain: model.crossDomain.map((c) => c.statement),
  };
}

/** Reject a packet that carries anything resembling an identifier or a date. */
export function packetPrivacyProblem(p: AssessmentPacket): string | null {
  const text = JSON.stringify(p);
  if (/\d{4}-\d{2}-\d{2}/.test(text)) return "packet contains a calendar date";
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) return "packet contains an identifier";
  if (/@[a-z0-9-]+\./i.test(text)) return "packet contains an e-mail address";
  return null;
}

// ------------------------------------------------------------ structured assessment

export interface AssessmentStatement {
  text: string;
  observationRefs: string[];
  citationIds: string[];
}
export type AssessmentSection =
  | "abnormalFindings"
  | "physiologicalExplanations"
  | "differentialConsiderations"
  | "crossDomainRelationships"
  | "monitoringRecommendations"
  | "reviewPriorities";
export const ASSESSMENT_SECTIONS: readonly AssessmentSection[] = [
  "abnormalFindings",
  "physiologicalExplanations",
  "differentialConsiderations",
  "crossDomainRelationships",
  "monitoringRecommendations",
  "reviewPriorities",
];
export const SECTION_LABELS: Record<AssessmentSection | "uncertainties" | "missingTests", string> = {
  abnormalFindings: "Relevant abnormal findings (verified references only)",
  physiologicalExplanations: "Possible physiological explanations",
  differentialConsiderations: "Differential diagnostic considerations — HYPOTHESES ONLY",
  crossDomainRelationships: "Relationships across domains",
  monitoringRecommendations: "Evidence-supported monitoring considerations",
  reviewPriorities: "Clinical review priorities",
  uncertainties: "Uncertainties",
  missingTests: "Missing tests and data",
};

export interface PreliminaryAssessment {
  schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION;
  origin: "deterministic_offline" | "ai_assisted";
  label: string;
  model: string | null;
  sections: Record<AssessmentSection, AssessmentStatement[]>;
  uncertainties: string[];
  missingTests: string[];
  diagnosisStatus: "cannot_be_established" | "differential_hypotheses_only";
  diagnosisStatement: string;
  confirmedDiagnoses: readonly never[];
  rejected: { section: string; text: string; reason: string }[];
}

const emptySections = (): Record<AssessmentSection, AssessmentStatement[]> => ({
  abnormalFindings: [],
  physiologicalExplanations: [],
  differentialConsiderations: [],
  crossDomainRelationships: [],
  monitoringRecommendations: [],
  reviewPriorities: [],
});

const flagged = (i: PacketItem) => i.severity === "red" || i.severity === "amber";

/** Offline, deterministic assessment from verified statuses and approved interpretations only. */
export function buildDeterministicAssessment(p: AssessmentPacket): PreliminaryAssessment {
  const s = emptySections();
  const abnormal = p.items.filter(flagged);
  for (const i of abnormal) {
    s.abnormalFindings.push({ text: `${SEVERITY_MARKERS[i.severity]} ${i.name}: ${i.value} ${i.unit} — ${MEASUREMENT_STATUS_LABELS[i.status]} (${i.reference ?? "approved rule"}).`, observationRefs: [i.ref], citationIds: [] });
    const dir = i.status === "below_verified_reference" ? i.lower : i.status === "above_verified_reference" ? i.higher : null;
    if (dir) s.physiologicalExplanations.push({ text: `${i.name}: documented context for this direction — ${dir.text}`, observationRefs: [i.ref], citationIds: dir.citationIds });
    s.reviewPriorities.push({ text: `${i.severity === "red" ? "Priority 1" : "Priority 2"}: clinician review of ${i.name} (${MEASUREMENT_STATUS_LABELS[i.status]}).`, observationRefs: [i.ref], citationIds: [] });
  }
  for (const i of p.items) for (const c of i.comparability) s.monitoringRecommendations.push({ text: `${i.name}: ${c.text}`, observationRefs: [i.ref], citationIds: c.citationIds });
  s.reviewPriorities.sort((a, b) => a.text.localeCompare(b.text));
  const unclassified = p.items.filter((i) => i.severity === "neutral").length;
  const pending = p.items.filter((i) => !i.interpretationApproved).length;
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    origin: "deterministic_offline",
    label: OFFLINE_ASSESSMENT_LABEL,
    model: null,
    sections: s,
    uncertainties: [
      ...(unclassified ? [`${unclassified} of ${p.items.length} result(s) could not be classified: no applicable, independently verified reference for the exact biomarker, unit and domain.`] : []),
      ...(pending ? [`${pending} biomarker(s) have no approved biological interpretation (pending scientific review).`] : []),
      ...p.crossDomain,
      "Specimen, assay method, collection protocol, symptoms and clinical history are not recorded here and are not inferred.",
    ],
    missingTests: p.domainsWithoutData.map((d) => `No included ${RESEARCHER_DOMAIN_LABELS[d]} observations in this report scope.`),
    diagnosisStatus: "cannot_be_established",
    diagnosisStatement: NO_DIAGNOSIS_TEXT,
    confirmedDiagnoses: [],
    rejected: [],
  };
}

// ------------------------------------------------------------ AI output validation

const CONFIRMED_DIAGNOSIS = /\b(?:confirm(?:s|ed|ing)?|definitive(?:ly)?|diagnosed with|is diagnostic of|establish(?:es|ed)? (?:a |the )?diagnosis|the (?:patient|astronaut|crew member) has)\b/i;
const INVENTED_CLINICAL = /\b(?:symptom|complain|history of|medical history|family history|medication|prescri|reported pain|physical exam|on examination)\w*/i;
const TREATMENT = /\b(?:treat(?:ment|ed|ing)?|dose|dosing|prescribe|administer|supplement with|start (?:on|taking))\b/i;
const MAX_TEXT = 600;

function numbersIn(text: string): string[] {
  return [...text.matchAll(/(?<![\w.])[+-]?\d+(?:\.\d+)?/g)].map((m) => m[0].replace(/^\+/, ""));
}

/**
 * Validate one AI-drafted assessment against its packet. Nothing is rewritten:
 * a failing statement is dropped and listed with its reason.
 */
export function validateAiAssessment(raw: unknown, p: AssessmentPacket, model: string | null): PreliminaryAssessment | { invalid: string } {
  const r = raw as Partial<Record<AssessmentSection | "uncertainties" | "missingTests" | "schemaVersion", unknown>> | null;
  if (!r || r.schemaVersion !== ASSESSMENT_SCHEMA_VERSION) return { invalid: "The AI response did not match the required structure." };
  const refs = new Map(p.items.map((i) => [i.ref, i]));
  const cites = new Set(p.citations.map((c) => c.id));
  const corpus = new Set(numbersIn(JSON.stringify(p)));
  const s = emptySections();
  const rejected: PreliminaryAssessment["rejected"] = [];
  const problemOf = (text: string): string | null => {
    if (text.length > MAX_TEXT) return "statement too long";
    if (CONFIRMED_DIAGNOSIS.test(text)) return "asserts a confirmed diagnosis";
    if (INVENTED_CLINICAL.test(text)) return "refers to history, symptoms, medication or examinations that are not recorded";
    if (TREATMENT.test(text)) return "contains treatment or dosing language";
    const extra = numbersIn(text).filter((n) => !corpus.has(n));
    if (extra.length) return `introduces number(s) not present in the recorded evidence (${extra.slice(0, 3).join(", ")})`;
    return null;
  };
  for (const section of ASSESSMENT_SECTIONS) {
    const list = Array.isArray(r[section]) ? (r[section] as unknown[]) : [];
    for (const item of list.slice(0, 30)) {
      const st = item as Partial<AssessmentStatement> | null;
      const text = typeof st?.text === "string" ? st.text.trim() : "";
      const obs = Array.isArray(st?.observationRefs) ? st!.observationRefs!.filter((x): x is string => typeof x === "string") : [];
      const cit = Array.isArray(st?.citationIds) ? st!.citationIds!.filter((x): x is string => typeof x === "string") : [];
      const reject = (reason: string) => rejected.push({ section, text: text.slice(0, MAX_TEXT), reason });
      if (!text) { reject("empty statement"); continue; }
      if (!obs.length || obs.some((o) => !refs.has(o))) { reject("does not cite recorded observations of this packet"); continue; }
      if (cit.some((c) => !cites.has(c))) { reject("cites a source that is not an approved, cited interpretation"); continue; }
      const problem = problemOf(text);
      if (problem) { reject(problem); continue; }
      if (section === "abnormalFindings" && obs.some((o) => !flagged(refs.get(o)!))) { reject("labels a result abnormal without a verified reference classification"); continue; }
      if ((section === "physiologicalExplanations" || section === "differentialConsiderations" || section === "monitoringRecommendations") && !cit.length) {
        reject("not grounded in a verified, cited source");
        continue;
      }
      if (section === "differentialConsiderations" && !obs.some((o) => flagged(refs.get(o)!))) { reject("differential without a verified abnormal finding"); continue; }
      if (section === "crossDomainRelationships" && new Set(obs.map((o) => refs.get(o)!.domain)).size < 2) { reject("cross-domain statement cites only one domain"); continue; }
      s[section].push({ text, observationRefs: [...new Set(obs)], citationIds: [...new Set(cit)] });
    }
  }
  const strings = (key: "uncertainties" | "missingTests") =>
    (Array.isArray(r[key]) ? (r[key] as unknown[]) : [])
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, 20)
      .flatMap((x) => {
        const problem = problemOf(x.trim());
        if (problem) { rejected.push({ section: key, text: x.trim().slice(0, MAX_TEXT), reason: problem }); return []; }
        return [x.trim()];
      });
  const differential = s.differentialConsiderations.length > 0;
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    origin: "ai_assisted",
    label: PRELIMINARY_ASSESSMENT_LABEL,
    model,
    sections: s,
    uncertainties: strings("uncertainties"),
    missingTests: strings("missingTests"),
    diagnosisStatus: differential ? "differential_hypotheses_only" : "cannot_be_established",
    diagnosisStatement: differential
      ? "Differential considerations above are hypotheses for clinician review only; no diagnosis is established."
      : NO_DIAGNOSIS_TEXT,
    confirmedDiagnoses: [],
    rejected,
  };
}

/** Whether the AI may be asked at all: needs a verified finding or approved cited context. */
export function packetSupportsAiAssessment(p: AssessmentPacket): boolean {
  return p.items.some(flagged) || p.items.some((i) => i.interpretationApproved);
}

// ------------------------------------------------------------ fingerprints and clinician review

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
export async function sha256Canonical(v: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(v)));
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0")).join("");
}

export interface ReviewScope {
  missionId: string;
  crewMemberId: string;
  provenance: "synthetic" | "real";
}
export interface ClinicianReview {
  decision: "attested" | "returned";
  reviewerUserId: string;
  reviewedAt: string;
  note: string;
  scope: ReviewScope;
  assessmentSha256: string;
  packetSha256: string;
}

export async function planClinicianReview(
  assessment: PreliminaryAssessment,
  packet: AssessmentPacket,
  actor: { userId: string | null | undefined; rolesForScope: readonly string[]; scope: ReviewScope; now: string },
  input: { decision: "attested" | "returned"; acknowledgement: string; note: string },
): Promise<{ ok: true; review: ClinicianReview } | { ok: false; reason: string }> {
  if (!actor.userId) return { ok: false, reason: "Sign in again: the reviewer could not be verified." };
  if (!actor.rolesForScope.includes("ground_medical"))
    return { ok: false, reason: "Only an authorized Ground Medical clinician for this exact mission and crew member can review this assessment." };
  if (input.note.trim().length < 10) return { ok: false, reason: "A review note of at least 10 characters is required." };
  if (input.decision === "attested" && input.acknowledgement !== CLINICIAN_ACKNOWLEDGEMENT)
    return { ok: false, reason: "The exact clinician acknowledgement is required to attest." };
  return {
    ok: true,
    review: {
      decision: input.decision,
      reviewerUserId: actor.userId,
      reviewedAt: actor.now,
      note: input.note.trim(),
      scope: actor.scope,
      assessmentSha256: await sha256Canonical(assessment),
      packetSha256: await sha256Canonical(packet),
    },
  };
}

export interface AssessmentDisplayStatus {
  clinicianReviewed: boolean;
  headline: string;
  detail: string;
}

/** Display status: clinician-reviewed only for an attested review bound to these exact bytes and scope. */
export async function assessmentDisplayStatus(
  assessment: PreliminaryAssessment,
  packet: AssessmentPacket,
  review: ClinicianReview | null,
  scope: ReviewScope,
): Promise<AssessmentDisplayStatus> {
  const base = { clinicianReviewed: false, headline: assessment.label, detail: "Not reviewed by a Ground Medical clinician." };
  if (!review) return base;
  const sameScope = review.scope.missionId === scope.missionId && review.scope.crewMemberId === scope.crewMemberId && review.scope.provenance === scope.provenance;
  const fresh = sameScope && review.assessmentSha256 === (await sha256Canonical(assessment)) && review.packetSha256 === (await sha256Canonical(packet));
  if (!fresh) return { ...base, detail: "The earlier clinician review no longer matches this assessment or its evidence; it is not applied." };
  if (review.decision === "returned") return { ...base, detail: `Returned by Ground Medical ${review.reviewerUserId} on ${review.reviewedAt}: ${review.note}` };
  return {
    clinicianReviewed: true,
    headline: `Clinician-reviewed preliminary medical opinion (Ground Medical ${review.reviewerUserId}, ${review.reviewedAt}) — still NOT a confirmed medical diagnosis.`,
    detail: `Review note: ${review.note}. Observations, differential hypotheses and confirmed diagnoses remain separate; differential considerations are hypotheses. This session-only review is not licensure or a legal signature.`,
  };
}
