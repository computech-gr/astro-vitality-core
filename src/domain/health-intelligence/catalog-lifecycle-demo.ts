/**
 * Isolated SYNTHETIC lifecycle demonstration. Runs entirely in memory with a
 * per-run test signing key and an explicitly test-only validation fixture; it
 * never touches the device catalog, storage, network or any real record, and
 * the test-environment snapshot it produces is refused by production loaders.
 */
import {
  activateCatalogEntry,
  approveNewBiomarker,
  deriveCatalogSnapshot,
  evaluateCatalogSnapshot,
  lifecycleState,
  revokeCatalogEntry,
  type LedgerEvent,
  type LifecycleState,
  type SourceValidationReceipt,
  type SubmittedTerm,
} from "./catalog-lifecycle";
import {
  generateTestSigningKey,
  signCatalogSnapshot,
  verifySignedCatalogSnapshot,
} from "./catalog-snapshot-signing";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
  termIdFor,
} from "./unknown-biomarker-review";

export interface DemoStep {
  step: string;
  expected: string;
  actual: string;
  pass: boolean;
  state?: LifecycleState;
}

const LABEL = "Synthetic Demo Marker Z",
  UNIT = "pmol/L",
  SPECIMEN = "Synthetic serum",
  METHOD = "Synthetic immunoassay",
  ID = "ext:synthetic-demo-marker-z";
/** Role-based activation: any active Ground Medical member of the approval mission. */
const DEMO_GROUND_MEDICAL = [
  {
    userId: "synthetic-activator",
    missionId: "SYNTHETIC-DEMO",
    role: "ground_medical",
    active: true,
  },
] as const;

export async function runSyntheticCatalogLifecycleDemo(
  now: () => string = () => new Date().toISOString(),
): Promise<DemoStep[]> {
  const steps: DemoStep[] = [];
  const push = (step: string, expected: string, actual: string, state?: LifecycleState) =>
    steps.push({ step, expected, actual, pass: expected === actual, ...(state ? { state } : {}) });
  const term: SubmittedTerm = {
    missionId: "SYNTHETIC-DEMO",
    provenance: "synthetic",
    submissionId: "synthetic-demo-submission",
    termId: termIdFor(LABEL, UNIT),
    originalLabels: [LABEL],
    exactUnit: UNIT,
    submittedBy: "synthetic-ground-medical",
  };
  const receipt: SourceValidationReceipt = {
    termId: term.termId,
    canonicalMetricId: ID,
    exactUnit: UNIT,
    specimen: SPECIMEN,
    method: METHOD,
    protocol: "SYNTHETIC-DEMO-PROTOCOL",
    protocolVersion: "0",
    validationReference: "synthetic-demo-fixture:not-scientific-evidence",
    sourceSha256: "0".repeat(64),
    verifiedBy: "synthetic-validator",
    verifiedAt: now(),
  };
  const exam = {
    label: LABEL,
    unit: UNIT,
    specimen: SPECIMEN,
    method: METHOD,
    provenance: "synthetic" as const,
  };
  const events: LedgerEvent[] = [];
  const triage = { termId: term.termId, latestAction: "ACCEPT_FOR_REVIEW" as const };
  const empty = evaluateCatalogSnapshot(deriveCatalogSnapshot([], "test", now()));

  const first = classifyWithGovernedExtensions(exam, undefined, empty).classification;
  const requests = buildUnknownBiomarkerTerms([
    {
      label: LABEL,
      unit: UNIT,
      value: "1.0",
      observedAt: now().slice(0, 10),
      classification: first,
      sourceKind: "manual",
      sourceLabel: "Synthetic demo",
    },
  ]);
  push(
    "First examination",
    "UNKNOWN · 1 unknown request",
    `${first.status === "unclassified" ? "UNKNOWN" : first.status} · ${requests.length} unknown request`,
    "UNKNOWN",
  );
  push(
    "Researcher: Accept for review",
    "ACCEPTED_FOR_REVIEW",
    lifecycleState({ termId: term.termId, triage, receipt: null, events }),
    "ACCEPTED_FOR_REVIEW",
  );
  push(
    "Synthetic source validation fixture",
    "SCIENTIFICALLY_VALIDATED",
    lifecycleState({ termId: term.termId, triage, receipt, events }),
    "SCIENTIFICALLY_VALIDATED",
  );

  const ap = await approveNewBiomarker({
    term,
    triage,
    receipt,
    approverId: "synthetic-approver",
    approverGrant: { userId: "synthetic-approver", revoked: false },
    canonicalName: "Synthetic demo marker Z",
    domain: "immune",
    approvalEventId: "synthetic-approval-1",
    approvedAt: now(),
  });
  if (!ap.ok) {
    push("Test scientific approval", "SCIENTIFICALLY_APPROVED", `FAILED: ${ap.reason}`);
    return steps;
  }
  events.push({
    type: "APPROVE",
    eventId: "synthetic-approval-1",
    seq: 1,
    actorId: "synthetic-approver",
    at: now(),
    proposal: ap.value.proposal,
    proposalSha256: ap.value.proposalSha256,
  });
  push(
    "Test scientific approval",
    "SCIENTIFICALLY_APPROVED",
    "SCIENTIFICALLY_APPROVED",
    "SCIENTIFICALLY_APPROVED",
  );
  push(
    "Catalog proposal derived (no code change)",
    "CATALOG_PROPOSED",
    lifecycleState({ termId: term.termId, triage, receipt, events }),
    "CATALOG_PROPOSED",
  );

  const selfAct = activateCatalogEntry(events, {
    approvalEventId: "synthetic-approval-1",
    expectedProposalSha256: ap.value.proposalSha256,
    activatorId: "synthetic-approver",
    activatorMemberships: [
      { userId: "synthetic-approver", missionId: "SYNTHETIC-DEMO", role: "ground_medical", active: true },
    ],
    eventId: "x",
    at: now(),
  });
  push("Approver tries to activate own approval", "REFUSED", selfAct.ok ? "ACTIVATED" : "REFUSED");
  const act = activateCatalogEntry(events, {
    approvalEventId: "synthetic-approval-1",
    expectedProposalSha256: ap.value.proposalSha256,
    activatorId: "synthetic-activator",
    activatorMemberships: DEMO_GROUND_MEDICAL,
    eventId: "synthetic-activation-1",
    at: now(),
  });
  if (!act.ok) {
    push("Ground Medical activates", "CATALOG_ACTIVE", `FAILED: ${act.reason}`);
    return steps;
  }
  events.push(act.value);
  push(
    "Ground Medical activates",
    "CATALOG_ACTIVE",
    lifecycleState({ termId: term.termId, triage, receipt, events }),
    "CATALOG_ACTIVE",
  );

  const key = await generateTestSigningKey("synthetic-demo-key");
  const signed = await signCatalogSnapshot(
    deriveCatalogSnapshot(events, "test", now()),
    key.trusted.keyId,
    key.privateKey,
  );
  const verified = await verifySignedCatalogSnapshot(signed, [key.trusted], ["test"]);
  push(
    "Signed snapshot synchronized and verified",
    "VERIFIED",
    verified.ok ? "VERIFIED" : verified.reason,
  );
  if (!verified.ok) return steps;
  const catalog = evaluateCatalogSnapshot(verified.snapshot);
  const second = classifyWithGovernedExtensions(exam, undefined, catalog);
  const dup = buildUnknownBiomarkerTerms([
    {
      label: LABEL,
      unit: UNIT,
      value: "1.1",
      observedAt: now().slice(0, 10),
      classification: second.classification,
      sourceKind: "manual",
      sourceLabel: "Synthetic demo",
    },
  ]);
  push(
    "Second examination (offline, verified snapshot)",
    `RECOGNIZED · ${ID} · v${verified.snapshot.catalogVersion} · 0 unknown requests`,
    `${second.recognition ? "RECOGNIZED" : "UNKNOWN"} · ${second.classification.status === "matched" ? second.classification.metricId : "-"} · v${second.recognition?.catalogVersion ?? "-"} · ${dup.length} unknown requests`,
    "RECOGNIZED",
  );

  const neg = (
    label: string,
    input: Partial<typeof exam> & { specimen?: string; method?: string },
  ) =>
    push(
      label,
      "UNKNOWN",
      classifyWithGovernedExtensions({ ...exam, ...input }, undefined, catalog).recognition
        ? "RECOGNIZED"
        : "UNKNOWN",
    );
  neg("Negative: incompatible unit", { unit: "nmol/L" });
  neg("Negative: specimen missing", { specimen: "" });
  neg("Negative: different method", { method: "Different assay" });
  const tampered = structuredClone(signed);
  tampered.snapshot.entries[0]!.unit = "nmol/L";
  const t = await verifySignedCatalogSnapshot(tampered, [key.trusted], ["test"]);
  push("Negative: tampered snapshot", "REJECTED", t.ok ? "ACCEPTED" : "REJECTED");
  const noGrant = activateCatalogEntry(events, {
    approvalEventId: "synthetic-approval-1",
    expectedProposalSha256: ap.value.proposalSha256,
    activatorId: "synthetic-operator",
    activatorMemberships: [
      { userId: "synthetic-operator", missionId: "SYNTHETIC-DEMO", role: "mission_operator", active: true },
      { userId: "synthetic-operator", missionId: "OTHER-MISSION", role: "ground_medical", active: true },
    ],
    eventId: "y",
    at: now(),
  });
  push("Negative: non-Ground Medical / other-mission user", "REFUSED", noGrant.ok ? "ACTIVATED" : "REFUSED");
  const conflict = evaluateCatalogSnapshot({
    ...verified.snapshot,
    entries: [
      ...verified.snapshot.entries,
      { ...verified.snapshot.entries[0]!, canonicalId: "ext:synthetic-demo-marker-z2" },
    ],
  });
  push(
    "Negative: two conflicting entries",
    "UNKNOWN",
    classifyWithGovernedExtensions(exam, undefined, conflict).recognition
      ? "RECOGNIZED"
      : "UNKNOWN",
  );
  const rev = revokeCatalogEntry(events, {
    activationEventId: "synthetic-activation-1",
    activatorId: "synthetic-activator",
    activatorMemberships: DEMO_GROUND_MEDICAL,
    reason: "Synthetic demonstration revocation",
    eventId: "synthetic-revocation-1",
    at: now(),
  });
  if (rev.ok) events.push(rev.value);
  const afterRevoke = evaluateCatalogSnapshot(deriveCatalogSnapshot(events, "test", now()));
  push(
    "Negative: entry revoked",
    "UNKNOWN",
    classifyWithGovernedExtensions(exam, undefined, afterRevoke).recognition
      ? "RECOGNIZED"
      : "UNKNOWN",
  );
  const prod = await verifySignedCatalogSnapshot(signed);
  push(
    "Test snapshot refused by production trust list",
    "REFUSED",
    prod.ok ? "ACCEPTED" : "REFUSED",
  );
  return steps;
}
