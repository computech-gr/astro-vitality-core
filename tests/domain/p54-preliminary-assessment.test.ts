import { describe, expect, it } from "bun:test";
import {
  CLINICIAN_ACKNOWLEDGEMENT,
  NO_DIAGNOSIS_TEXT,
  OFFLINE_ASSESSMENT_LABEL,
  PRELIMINARY_ASSESSMENT_LABEL,
  assessmentDisplayStatus,
  buildAssessmentPacket,
  buildDeterministicAssessment,
  packetPrivacyProblem,
  planClinicianReview,
  validateAiAssessment,
  type AssessmentPacket,
  type PacketItem,
} from "../../src/domain/health-intelligence/preliminary-medical-assessment";
import { buildBiomarkerAssessment, validateReferenceRegistry } from "../../src/domain/health-intelligence/biomarker-health-assessment";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation } from "../../src/domain/health-intelligence/researcher-interpretation";
import { registryInterpretationSnapshot } from "../../src/domain/health-intelligence/biomarker-interpretation-ledger";
import { draftPreliminaryAssessmentCore, type AssessmentDeps } from "../../src/lib/preliminary-assessment.server";
import { V9_SCOPE, obs } from "./fixtures-v9-observations";

const item = (over: Partial<PacketItem> = {}): PacketItem => ({
  ref: "O1",
  catalogId: "cv-001",
  name: "Resting heart rate",
  domain: "cardiovascular",
  value: "130",
  unit: "bpm",
  previousValue: "60",
  change: "+70 bpm (+116.7%) versus the previous comparable examination",
  status: "clinically_concerning",
  severity: "red",
  reference: "reference interval 50-90 bpm",
  measures: { text: "Heart contractions per minute at rest.", citationIds: ["S1:c1"] },
  higher: { text: "Higher resting rates are documented with deconditioning.", citationIds: ["S1:c1"] },
  lower: null,
  comparability: [{ text: "Compare readings taken under the same resting protocol.", citationIds: ["S1:c1"] }],
  interpretationApproved: true,
  syntheticDemo: false,
  ...over,
});
const packet = (items: PacketItem[] = [item(), item({ ref: "O2", catalogId: "IMM-001", name: "White cells", domain: "immune", value: "6.1", unit: "10^9/L", status: "insufficient_evidence", severity: "neutral", reference: null, measures: null, higher: null, comparability: [], interpretationApproved: false, previousValue: null, change: null })]): AssessmentPacket => ({
  schema: "mitochondria.p54-assessment-packet.v1",
  provenance: "synthetic",
  items,
  citations: [{ id: "S1:c1", title: "Test source", locator: "p. 1" }],
  domainsWithoutData: ["bone", "behavioral"],
  crossDomain: [],
});
const st = (text: string, observationRefs: string[] = ["O1"], citationIds: string[] = ["S1:c1"]) => ({ text, observationRefs, citationIds });
const aiOutput = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "p54-preliminary-assessment.v1",
  abnormalFindings: [st("Resting heart rate of 130 bpm is above the verified interval.", ["O1"], [])],
  physiologicalExplanations: [st("Higher resting rates are documented with deconditioning.")],
  differentialConsiderations: [st("May be consistent with cardiovascular deconditioning; consider clinician review.")],
  crossDomainRelationships: [],
  monitoringRecommendations: [st("Compare readings taken under the same resting protocol.")],
  reviewPriorities: [st("Clinician review of the resting heart rate.", ["O1"], [])],
  uncertainties: ["Immune result could not be classified."],
  missingTests: ["No bone observations."],
  ...over,
});

describe("P54 de-identified packet and offline assessment", () => {
  it("builds a packet without names, record IDs, mission/crew IDs or dates", () => {
    const history = [obs({ value: "60", observedAt: "2026-09-01T08:00:00.000Z" }), obs({ value: "66", observedAt: "2026-09-15T08:00:00.000Z" })];
    const unified = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: history, deviceRecords: [] }, V9_SCOPE, {}, "2026-11-08T12:00:00.000Z");
    const model = buildResearcherInterpretation(unified, buildScientificFindings(unified), []);
    const snap = registryInterpretationSnapshot();
    const p = buildAssessmentPacket(buildBiomarkerAssessment(unified, model, snap), model, snap);
    const text = JSON.stringify(p);
    expect(packetPrivacyProblem(p)).toBeNull();
    for (const forbidden of [V9_SCOPE.missionId, V9_SCOPE.crewMemberId, history[0]!.id, "2026-09-01", "CSV"]) expect(text).not.toContain(forbidden);
    expect(p.items[0]).toMatchObject({ ref: "O1", value: "66", unit: "bpm", severity: "neutral", interpretationApproved: false });
  });

  it("with no verified findings the offline assessment states that a diagnosis cannot be established", () => {
    const a = buildDeterministicAssessment(packet([item({ status: "insufficient_evidence", severity: "neutral", reference: null, interpretationApproved: false, measures: null, higher: null, comparability: [] })]));
    expect(a.label).toBe(OFFLINE_ASSESSMENT_LABEL);
    expect(a.sections.abnormalFindings).toEqual([]);
    expect(a.sections.differentialConsiderations).toEqual([]);
    expect(a.diagnosisStatement).toBe(NO_DIAGNOSIS_TEXT);
    expect(a.confirmedDiagnoses).toEqual([]);
  });

  it("the offline assessment lists only verified abnormal findings and never generates differentials", () => {
    const a = buildDeterministicAssessment(packet());
    expect(a.sections.abnormalFindings).toHaveLength(1);
    expect(a.sections.abnormalFindings[0]!.text).toContain("(!!) RED");
    expect(a.sections.differentialConsiderations).toEqual([]);
    expect(a.sections.monitoringRecommendations[0]!.citationIds).toEqual(["S1:c1"]);
    expect(a.missingTests).toHaveLength(2);
  });
});

describe("P54 AI output validation", () => {
  it("keeps grounded statements and labels the result preliminary, never confirmed", () => {
    const r = validateAiAssessment(aiOutput(), packet(), "test-model");
    if ("invalid" in r) throw new Error(r.invalid);
    expect(r.label).toBe(PRELIMINARY_ASSESSMENT_LABEL);
    expect(r.rejected).toEqual([]);
    expect(r.sections.differentialConsiderations).toHaveLength(1);
    expect(r.diagnosisStatus).toBe("differential_hypotheses_only");
    expect(r.confirmedDiagnoses).toEqual([]);
  });

  it("rejects unverified abnormal labels, confirmed diagnoses, invented numbers, history and ungrounded sources", () => {
    const r = validateAiAssessment(
      aiOutput({
        abnormalFindings: [st("White cells are abnormal.", ["O2"], [])],
        differentialConsiderations: [
          st("This confirms cardiovascular disease."),
          st("Heart rate of 155 bpm suggests deconditioning."),
          st("Given a history of fainting, consider deconditioning."),
          st("Consider deconditioning.", ["O1"], []),
          st("Consider deconditioning.", ["O9"]),
          st("Consider deconditioning.", ["O1"], ["pmid:1"]),
        ],
        monitoringRecommendations: [st("Start taking a beta blocker.")],
        crossDomainRelationships: [st("Heart rate relates to itself.", ["O1"], [])],
      }),
      packet(),
      null,
    );
    if ("invalid" in r) throw new Error(r.invalid);
    expect(r.sections.abnormalFindings).toEqual([]);
    expect(r.sections.differentialConsiderations).toEqual([]);
    expect(r.sections.monitoringRecommendations).toEqual([]);
    expect(r.diagnosisStatement).toBe(NO_DIAGNOSIS_TEXT);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      "labels a result abnormal without a verified reference classification",
      "asserts a confirmed diagnosis",
      "introduces number(s) not present in the recorded evidence (155)",
      "refers to history, symptoms, medication or examinations that are not recorded",
      "not grounded in a verified, cited source",
      "does not cite recorded observations of this packet",
      "cites a source that is not an approved, cited interpretation",
      "cross-domain statement cites only one domain",
      "contains treatment or dosing language",
    ]);
  });

  it("refuses a response with the wrong structure", () => {
    expect(validateAiAssessment({ schemaVersion: "other" }, packet(), null)).toEqual({ invalid: "The AI response did not match the required structure." });
  });
});

describe("P54 clinician attestation", () => {
  const scope = { ...V9_SCOPE };
  const actor = (roles: string[]) => ({ userId: "gm-1", rolesForScope: roles, scope, now: "2026-11-08T12:00:00.000Z" });

  it("stays preliminary until an authorized Ground Medical clinician attests the exact assessment", async () => {
    const p = packet();
    const a = buildDeterministicAssessment(p);
    expect((await assessmentDisplayStatus(a, p, null, scope)).clinicianReviewed).toBe(false);
    expect(await planClinicianReview(a, p, actor(["researcher", "crew_self"]), { decision: "attested", acknowledgement: CLINICIAN_ACKNOWLEDGEMENT, note: "Reviewed all items." })).toMatchObject({ ok: false });
    expect(await planClinicianReview(a, p, actor(["ground_medical"]), { decision: "attested", acknowledgement: "ok", note: "Reviewed all items." })).toMatchObject({ ok: false });
    const plan = await planClinicianReview(a, p, actor(["ground_medical"]), { decision: "attested", acknowledgement: CLINICIAN_ACKNOWLEDGEMENT, note: "Reviewed all items." });
    if (!plan.ok) throw new Error(plan.reason);
    const shown = await assessmentDisplayStatus(a, p, plan.review, scope);
    expect(shown.clinicianReviewed).toBe(true);
    expect(shown.headline).toContain("still NOT a confirmed medical diagnosis");
    expect(shown.detail).toContain("differential considerations are hypotheses");
  });

  it("a review no longer applies when the evidence, assessment or scope changes", async () => {
    const p = packet();
    const a = buildDeterministicAssessment(p);
    const plan = await planClinicianReview(a, p, actor(["ground_medical"]), { decision: "attested", acknowledgement: CLINICIAN_ACKNOWLEDGEMENT, note: "Reviewed all items." });
    if (!plan.ok) throw new Error(plan.reason);
    const changed = packet([item({ value: "131" })]);
    expect((await assessmentDisplayStatus(buildDeterministicAssessment(changed), changed, plan.review, scope)).clinicianReviewed).toBe(false);
    expect((await assessmentDisplayStatus(a, p, plan.review, { ...scope, crewMemberId: "crew-b" })).clinicianReviewed).toBe(false);
    expect((await assessmentDisplayStatus(a, p, { ...plan.review, decision: "returned" }, scope)).clinicianReviewed).toBe(false);
  });
});

describe("P54 server gate (no provider traffic unless authorized)", () => {
  const deps = (env: Record<string, string>, calls: unknown[], response?: unknown): AssessmentDeps => ({
    env: (n) => env[n],
    fetch: async (...args: Parameters<typeof fetch>) => {
      calls.push(args);
      return new Response(JSON.stringify(response ?? {}), { status: 200 });
    },
    now: () => new Date("2026-11-08T12:00:00.000Z"),
    userId: "gm-1",
  });
  const neutralApproved = packet([item({ status: "insufficient_evidence", severity: "neutral", reference: null })]);

  it("is off by default, refuses real data and refuses statuses the verified registry does not produce", async () => {
    const calls: unknown[] = [];
    expect(await draftPreliminaryAssessmentCore({ missionId: "m", packet: neutralApproved }, deps({}, calls))).toMatchObject({ ok: false, code: "unavailable" });
    const on = { P54_PRELIMINARY_ASSESSMENT_AI_ENABLED: "true", LOVABLE_API_KEY: "k" };
    expect(await draftPreliminaryAssessmentCore({ missionId: "m", packet: { ...neutralApproved, provenance: "real" } }, deps(on, calls))).toMatchObject({ ok: false, code: "forbidden" });
    // The bundled registry is empty, so a client-claimed RED status is refused before any call.
    expect(await draftPreliminaryAssessmentCore({ missionId: "m", packet: packet() }, deps(on, calls))).toMatchObject({ ok: false, code: "integrity" });
    expect(await draftPreliminaryAssessmentCore({ missionId: "m", packet: { ...neutralApproved, items: [{ ...neutralApproved.items[0]!, name: "seen 2026-09-01" }] } }, deps(on, calls))).toMatchObject({ ok: false, code: "invalid" });
    expect(calls).toHaveLength(0);
  });

  it("does not call the AI without a verified finding or approved interpretation", async () => {
    const calls: unknown[] = [];
    const bare = packet([item({ status: "insufficient_evidence", severity: "neutral", reference: null, interpretationApproved: false, measures: null, higher: null, comparability: [] })]);
    const r = await draftPreliminaryAssessmentCore({ missionId: "m", packet: bare }, deps({ P54_PRELIMINARY_ASSESSMENT_AI_ENABLED: "true", LOVABLE_API_KEY: "k" }, calls));
    expect(r).toMatchObject({ ok: true, aiCalled: false });
    expect(r.ok && r.assessment.diagnosisStatement).toBe(NO_DIAGNOSIS_TEXT);
    expect(calls).toHaveLength(0);
  });

  it("when enabled, sends only the packet and re-validates the provider output", async () => {
    const calls: unknown[] = [];
    const output = aiOutput({ abnormalFindings: [st("Resting heart rate is abnormal.", ["O1"], [])], differentialConsiderations: [] });
    const body = { model: "test-model", output: [{ content: [{ type: "output_text", text: JSON.stringify(output) }] }] };
    const r = await draftPreliminaryAssessmentCore({ missionId: "mission-secret", packet: neutralApproved }, deps({ P54_PRELIMINARY_ASSESSMENT_AI_ENABLED: "true", LOVABLE_API_KEY: "k" }, calls, body));
    expect(calls).toHaveLength(1);
    const sent = String((calls[0] as [string, RequestInit])[1].body);
    expect(sent).not.toContain("mission-secret");
    if (!r.ok) throw new Error(r.message);
    expect(r.aiCalled).toBe(true);
    expect(r.assessment.label).toBe(PRELIMINARY_ASSESSMENT_LABEL);
    expect(r.assessment.sections.abnormalFindings).toEqual([]);
    expect(r.assessment.rejected[0]!.reason).toBe("labels a result abnormal without a verified reference classification");
  });

  it("server and browser derive identical statuses from the same registry", () => {
    expect(validateReferenceRegistry({ schema: "mitochondria.verified-reference-intervals.v1", version: 1, entries: [] }).entries).toEqual([]);
  });
});
