/**
 * P37 synthetic end-to-end lifecycle (TEST-ONLY fixtures, isolated test catalog):
 * UNKNOWN -> ACCEPTED_FOR_REVIEW -> SCIENTIFICALLY_VALIDATED -> SCIENTIFICALLY_APPROVED
 * -> CATALOG_PROPOSED -> CATALOG_ACTIVE -> RECOGNIZED, plus offline recognition from a
 * verified signed snapshot and the required negative cases. Nothing here is scientific
 * evidence; the test signing key is generated per run and the test environment is
 * refused by the production loader.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  activateCatalogEntry, approveNewBiomarker, deriveCatalogSnapshot, evaluateCatalogSnapshot, lifecycleState, recognizeBiomarker, revokeCatalogEntry,
  type Grant, type LedgerEvent, type SourceValidationReceipt, type SubmittedTerm,
} from "../../src/domain/health-intelligence/catalog-lifecycle";
import { generateTestSigningKey, signCatalogSnapshot, verifySignedCatalogSnapshot, type TrustedKey } from "../../src/domain/health-intelligence/catalog-snapshot-signing";
import {
  ACTIVE_CATALOG_STORAGE_KEY, getActiveCatalog, installOfferedCatalog, loadInstalledCatalog, resetActiveCatalogForTests, type SnapshotStorage,
} from "../../src/domain/health-intelligence/active-catalog-runtime";
import { buildUnknownBiomarkerTerms, classifyWithGovernedExtensions, termIdFor } from "../../src/domain/health-intelligence/unknown-biomarker-review";
import { checkObservationSyncEvent } from "../../src/domain/health-intelligence/observation-sync";
import { DATED_OBSERVATION_SCHEMA } from "../../src/domain/health-intelligence/observation-envelope";

const LABEL = "Synthetic Mitochondrial Marker Q";
const UNIT = "pmol/L";
const SPECIMEN = "Synthetic serum";
const METHOD = "Synthetic immunoassay";
const ID = "ext:synthetic-mito-marker-q";
const SUBMITTER = "user-ground-medical", VALIDATOR = "user-source-validator", APPROVER = "user-researcher", ACTIVATOR = "user-activator";
const TERM: SubmittedTerm = { missionId: "M-TEST", provenance: "synthetic", submissionId: "sub-test", termId: termIdFor(LABEL, UNIT), originalLabels: [LABEL], exactUnit: UNIT, submittedBy: SUBMITTER };
const RECEIPT: SourceValidationReceipt = {
  termId: TERM.termId, canonicalMetricId: ID, exactUnit: UNIT, specimen: SPECIMEN, method: METHOD, protocol: "SYNTHETIC-TEST-PROTOCOL", protocolVersion: "0",
  validationReference: "synthetic-test-fixture:not-scientific-evidence", sourceSha256: "a".repeat(64), verifiedBy: VALIDATOR, verifiedAt: "2026-11-07T10:00:00Z",
};
const grant = (userId: string): Grant => ({ userId, revoked: false });
const exam = (extra: Partial<{ unit: string; specimen: string; method: string; provenance: "synthetic" | "real" }> = {}) =>
  ({ label: LABEL, unit: UNIT, specimen: SPECIMEN, method: METHOD, provenance: "synthetic" as const, ...extra });
const reviewRow = (classification: ReturnType<typeof classifyWithGovernedExtensions>["classification"]) =>
  ({ label: LABEL, unit: UNIT, value: "4.2", observedAt: "2026-11-07", classification, sourceKind: "manual", sourceLabel: "Synthetic test" });

function memoryStorage(): SnapshotStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => { data.set(k, v); } };
}

let key: { privateKey: CryptoKey; trusted: TrustedKey };
const storage = memoryStorage();
const opts = () => ({ storage, trustedKeys: [key.trusted], environments: ["test"] as const });
const events: LedgerEvent[] = [];
let approvalEventId = "", proposalSha = "", activationEventId = "";

beforeAll(async () => { resetActiveCatalogForTests(); key = await generateTestSigningKey("test-key-1"); });
afterAll(() => resetActiveCatalogForTests());

describe("P37 synthetic lifecycle: approval -> activation -> automatic recognition", () => {
  test("first examination: the synthetic biomarker is UNKNOWN and creates one unknown request", () => {
    const c = classifyWithGovernedExtensions(exam()).classification;
    expect(c.status).toBe("unclassified");
    expect(buildUnknownBiomarkerTerms([reviewRow(c)]).length).toBe(1);
    expect(lifecycleState({ termId: TERM.termId, triage: null, receipt: null, events })).toBe("UNKNOWN");
  });

  test("triage acceptance is not approval; validation receipt is required and independent", async () => {
    const triage = { termId: TERM.termId, latestAction: "ACCEPT_FOR_REVIEW" as const };
    expect(lifecycleState({ termId: TERM.termId, triage, receipt: null, events })).toBe("ACCEPTED_FOR_REVIEW");
    const base = { term: TERM, triage, approverId: APPROVER, approverGrant: grant(APPROVER), canonicalName: "Synthetic marker Q", domain: "immune" as const, approvalEventId: "ap-1", approvedAt: "2026-11-07T11:00:00Z" };
    expect((await approveNewBiomarker({ ...base, receipt: null })).ok).toBe(false);
    expect((await approveNewBiomarker({ ...base, receipt: RECEIPT, approverGrant: null })).ok).toBe(false);
    expect((await approveNewBiomarker({ ...base, receipt: RECEIPT, triage: { termId: TERM.termId, latestAction: null } })).ok).toBe(false);
    expect((await approveNewBiomarker({ ...base, receipt: { ...RECEIPT, verifiedBy: APPROVER } })).ok).toBe(false);
    expect((await approveNewBiomarker({ ...base, receipt: RECEIPT, approverId: SUBMITTER, approverGrant: grant(SUBMITTER) })).ok).toBe(false);
    expect((await approveNewBiomarker({ ...base, receipt: { ...RECEIPT, exactUnit: "nmol/L" } })).ok).toBe(false);
    expect((await approveNewBiomarker({ ...base, receipt: { ...RECEIPT, canonicalMetricId: "cv-001" } })).ok).toBe(false);
    expect(lifecycleState({ termId: TERM.termId, triage, receipt: RECEIPT, events })).toBe("SCIENTIFICALLY_VALIDATED");

    const approved = await approveNewBiomarker({ ...base, receipt: RECEIPT });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.proposal.entry).toMatchObject({ canonicalId: ID, unit: UNIT, specimen: SPECIMEN, method: METHOD, aliases: [LABEL], provenance: "synthetic" });
    expect(approved.value.proposalSha256).toMatch(/^[0-9a-f]{64}$/);
    approvalEventId = "ap-1"; proposalSha = approved.value.proposalSha256;
    events.push({ type: "APPROVE", eventId: approvalEventId, seq: 1, actorId: APPROVER, at: "2026-11-07T11:00:00Z", proposal: approved.value.proposal, proposalSha256: proposalSha });
    expect(lifecycleState({ termId: TERM.termId, triage, receipt: RECEIPT, events })).toBe("CATALOG_PROPOSED");
    // Approval alone changes nothing in recognition.
    expect(classifyWithGovernedExtensions(exam()).classification.status).toBe("unclassified");
  });

  test("activation requires a separate authorized identity and the exact proposal digest", () => {
    const base = { approvalEventId, expectedProposalSha256: proposalSha, activatorId: ACTIVATOR, activatorGrant: grant(ACTIVATOR), eventId: "act-1", at: "2026-11-07T12:00:00Z" };
    expect(activateCatalogEntry(events, { ...base, activatorGrant: null }).ok).toBe(false);
    expect(activateCatalogEntry(events, { ...base, activatorGrant: { userId: ACTIVATOR, revoked: true } }).ok).toBe(false);
    expect(activateCatalogEntry(events, { ...base, activatorId: APPROVER, activatorGrant: grant(APPROVER) }).ok).toBe(false);
    expect(activateCatalogEntry(events, { ...base, expectedProposalSha256: "b".repeat(64) }).ok).toBe(false);
    const act = activateCatalogEntry(events, base);
    expect(act.ok).toBe(true);
    if (!act.ok) return;
    events.push(act.value); activationEventId = act.value.eventId;
    expect(activateCatalogEntry(events, { ...base, eventId: "act-dup" }).ok).toBe(false);
    expect(lifecycleState({ termId: TERM.termId, triage: { termId: TERM.termId, latestAction: "ACCEPT_FOR_REVIEW" }, receipt: RECEIPT, events })).toBe("CATALOG_ACTIVE");
  });

  test("a conflicting second definition cannot be activated", async () => {
    const other: SubmittedTerm = { ...TERM, submissionId: "sub-test-2" };
    const ap = await approveNewBiomarker({ term: other, triage: { termId: TERM.termId, latestAction: "ACCEPT_FOR_REVIEW" }, receipt: { ...RECEIPT, canonicalMetricId: "ext:synthetic-mito-marker-q2" },
      approverId: APPROVER, approverGrant: grant(APPROVER), canonicalName: "Synthetic marker Q duplicate", domain: "immune", approvalEventId: "ap-2", approvedAt: "2026-11-07T12:30:00Z" });
    expect(ap.ok).toBe(true);
    if (!ap.ok) return;
    const withSecond: LedgerEvent[] = [...events, { type: "APPROVE", eventId: "ap-2", seq: 3, actorId: APPROVER, at: "2026-11-07T12:30:00Z", proposal: ap.value.proposal, proposalSha256: ap.value.proposalSha256 }];
    const r = activateCatalogEntry(withSecond, { approvalEventId: "ap-2", expectedProposalSha256: ap.value.proposalSha256, activatorId: ACTIVATOR, activatorGrant: grant(ACTIVATOR), eventId: "act-2", at: "2026-11-07T12:31:00Z" });
    expect(r.ok).toBe(false);
  });

  test("the canonical catalog is updated through a verified signed snapshot, with no source-code change", async () => {
    const snapshot = deriveCatalogSnapshot(events, "test", "2026-11-07T12:01:00Z");
    expect(snapshot.catalogVersion).toBe(2);
    expect(snapshot.entries.map((e) => [e.canonicalId, e.status])).toEqual([[ID, "ACTIVE"]]);
    const signed = await signCatalogSnapshot(snapshot, key.trusted.keyId, key.privateKey);
    expect((await installOfferedCatalog(signed, opts())).installed).toBe(true);
    expect(storage.data.has(ACTIVE_CATALOG_STORAGE_KEY)).toBe(true);
    expect(getActiveCatalog().catalogVersion).toBe(2);
  });

  test("second examination is RECOGNIZED with canonical ID and catalog version; no duplicate unknown request", () => {
    const observation = Object.freeze(exam());
    const r = classifyWithGovernedExtensions(observation);
    expect(r.classification.status).toBe("matched");
    if (r.classification.status !== "matched") return;
    expect(r.classification.metricId).toBe(ID);
    expect(r.classification.domain).toBe("immune");
    expect(r.classification.originalLabel).toBe(LABEL);
    expect(r.classification.originalUnit).toBe(UNIT);
    expect(r.recognition).toEqual({ canonicalId: ID, catalogVersion: 2 });
    expect(buildUnknownBiomarkerTerms([reviewRow(r.classification)])).toEqual([]);
    expect(lifecycleState({ termId: TERM.termId, triage: { termId: TERM.termId, latestAction: "ACCEPT_FOR_REVIEW" }, receipt: RECEIPT, events, recognizedInLaterExamination: true })).toBe("RECOGNIZED");
  });

  test("recognition fails safely on incompatible unit, missing specimen, different method or real provenance", () => {
    const cat = getActiveCatalog();
    expect(recognizeBiomarker(exam({ unit: "nmol/L" }), cat).status).toBe("UNKNOWN");
    expect(recognizeBiomarker({ label: LABEL, unit: UNIT, method: METHOD, provenance: "synthetic" }, cat)).toEqual({ status: "UNKNOWN", reason: "Specimen is required for this biomarker and was not reported." });
    expect(recognizeBiomarker({ label: LABEL, unit: UNIT, specimen: SPECIMEN, provenance: "synthetic" }, cat).status).toBe("UNKNOWN");
    expect(recognizeBiomarker(exam({ method: "Different assay" }), cat).status).toBe("UNKNOWN");
    expect(recognizeBiomarker(exam({ provenance: "real" }), cat).status).toBe("UNKNOWN");
    expect(classifyWithGovernedExtensions({ label: LABEL, unit: UNIT, provenance: "synthetic" }).classification.status).toBe("unclassified");
    // Typing the canonical ID as a label does not bypass specimen/method checks.
    expect(classifyWithGovernedExtensions({ label: ID, unit: UNIT }).classification.status).toBe("unclassified");
  });

  test("stored records and sync re-validate by exact canonical identity", () => {
    expect(classifyWithGovernedExtensions({ label: ID, unit: UNIT, identity: "canonical" }).classification.status).toBe("matched");
    const o = { schema: DATED_OBSERVATION_SCHEMA, id: "11111111-1111-4111-8111-111111111111", missionId: "M-TEST", crewMemberId: "C-TEST", metricId: ID, domain: "immune", value: "4.2",
      originalUnit: UNIT, observedAt: "2026-11-07", datePrecision: "date", source: { kind: "manual", label: "Synthetic test" }, provenance: "synthetic",
      quality: { reviewerConfirmed: true, duplicateWarningAcknowledged: false }, reviewState: "accepted", recordedAt: "2026-11-07T12:05:00Z", status: "active" };
    const scope = { missionId: "M-TEST", crewMemberId: "C-TEST", provenance: "synthetic" } as const;
    expect(checkObservationSyncEvent({ eventId: `${o.id}:entry`, eventKind: "entry", observation: o } as never, scope)).toBeNull();
    expect(checkObservationSyncEvent({ eventId: `${o.id}:entry`, eventKind: "entry", observation: { ...o, originalUnit: "nmol/L" } } as never, scope)).toContain("not an exact catalog metric/unit pair");
  });

  test("tampered, older, untrusted-key and test-environment snapshots are refused; the last verified catalog stays", async () => {
    const good = await signCatalogSnapshot(deriveCatalogSnapshot(events, "test", "2026-11-07T12:01:00Z"), key.trusted.keyId, key.privateKey);
    const tampered = structuredClone(good);
    tampered.snapshot.entries[0]!.unit = "nmol/L";
    expect((await verifySignedCatalogSnapshot(tampered, [key.trusted], ["test"])).ok).toBe(false);
    expect((await installOfferedCatalog(tampered, opts())).installed).toBe(false);
    const older = await signCatalogSnapshot(deriveCatalogSnapshot(events.slice(0, 1), "test", "2026-11-07T12:02:00Z"), key.trusted.keyId, key.privateKey);
    expect((await installOfferedCatalog(older, opts())).reason).toContain("older");
    const stranger = await generateTestSigningKey("unknown-key");
    expect((await installOfferedCatalog(await signCatalogSnapshot(good.snapshot, "unknown-key", stranger.privateKey), opts())).installed).toBe(false);
    expect((await verifySignedCatalogSnapshot(good, [key.trusted], ["production"])).ok).toBe(false);
    expect(getActiveCatalog().catalogVersion).toBe(2);
    expect(classifyWithGovernedExtensions(exam()).classification.status).toBe("matched");
  });

  test("two conflicting entries in a snapshot both fail closed", () => {
    const s = deriveCatalogSnapshot(events, "test", "2026-11-07T12:01:00Z");
    const dup = { ...s.entries[0]!, canonicalId: "ext:synthetic-mito-marker-q3" };
    const ev = evaluateCatalogSnapshot({ ...s, entries: [...s.entries, dup] });
    expect(ev.active).toEqual([]);
    expect(recognizeBiomarker(exam(), ev).status).toBe("UNKNOWN");
  });

  test("OFFLINE: with the network disabled, a fresh device session recognizes from the verified stored snapshot", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("network disabled"); }) as unknown as typeof fetch;
    try {
      resetActiveCatalogForTests();
      expect(classifyWithGovernedExtensions(exam()).classification.status).toBe("unclassified");
      expect((await loadInstalledCatalog(opts())).loaded).toBe(true);
      const r = classifyWithGovernedExtensions(exam());
      expect(r.recognition).toEqual({ canonicalId: ID, catalogVersion: 2 });
      // Production loader never accepts the test-environment snapshot.
      resetActiveCatalogForTests();
      expect((await loadInstalledCatalog({ storage, trustedKeys: [key.trusted] })).loaded).toBe(false);
      expect((await loadInstalledCatalog(opts())).loaded).toBe(true);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("revocation: a newer verified snapshot stops recognition, history stays valid", async () => {
    expect(revokeCatalogEntry(events, { activationEventId, activatorId: ACTIVATOR, activatorGrant: null, reason: "Synthetic revocation test", eventId: "rev-1", at: "2026-11-07T13:00:00Z" }).ok).toBe(false);
    expect(revokeCatalogEntry(events, { activationEventId, activatorId: ACTIVATOR, activatorGrant: grant(ACTIVATOR), reason: "short", eventId: "rev-1", at: "2026-11-07T13:00:00Z" }).ok).toBe(false);
    const rev = revokeCatalogEntry(events, { activationEventId, activatorId: ACTIVATOR, activatorGrant: grant(ACTIVATOR), reason: "Synthetic revocation test", eventId: "rev-1", at: "2026-11-07T13:00:00Z" });
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    events.push(rev.value);
    const signed = await signCatalogSnapshot(deriveCatalogSnapshot(events, "test", "2026-11-07T13:01:00Z"), key.trusted.keyId, key.privateKey);
    expect(signed.snapshot.catalogVersion).toBe(3);
    expect((await installOfferedCatalog(signed, opts())).installed).toBe(true);
    const c = classifyWithGovernedExtensions(exam());
    expect(c.classification.status).toBe("unclassified");
    expect(buildUnknownBiomarkerTerms([reviewRow(c.classification)]).length).toBe(1);
    // Historical records keep validating by identity; new corrections to a revoked entry are refused.
    expect(classifyWithGovernedExtensions({ label: ID, unit: UNIT, identity: "canonical", includeRevoked: true }).classification.status).toBe("matched");
    expect(classifyWithGovernedExtensions({ label: ID, unit: UNIT, identity: "canonical" }).classification.status).toBe("unclassified");
    expect(lifecycleState({ termId: TERM.termId, triage: null, receipt: RECEIPT, events })).toBe("CATALOG_REVOKED");
  });

  test("the bundled production trust list is empty: no snapshot is trusted until the owner provisions a key", async () => {
    const signed = await signCatalogSnapshot(deriveCatalogSnapshot(events, "production", "2026-11-07T13:02:00Z"), key.trusted.keyId, key.privateKey);
    expect((await verifySignedCatalogSnapshot(signed)).ok).toBe(false);
  });
});

describe("P37 in-app synthetic demonstration runner", () => {
  test("every step passes and the device catalog is untouched", async () => {
    resetActiveCatalogForTests();
    const { runSyntheticCatalogLifecycleDemo } = await import("../../src/domain/health-intelligence/catalog-lifecycle-demo");
    const steps = await runSyntheticCatalogLifecycleDemo(() => "2026-11-07T14:00:00Z");
    expect(steps.filter((s) => !s.pass)).toEqual([]);
    expect(steps.length).toBe(17);
    expect(steps.find((s) => s.step.startsWith("Second examination"))?.actual).toBe("RECOGNIZED · ext:synthetic-demo-marker-z · v2 · 0 unknown requests");
    expect(getActiveCatalog().catalogVersion).toBe(0);
  });
});
