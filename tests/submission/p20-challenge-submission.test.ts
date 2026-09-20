import { describe, expect, test } from "bun:test";

import evidenceLedger from "../../data/submission/p20-evidence.v1.json";
import { P20_DEMO_STEPS, summarizeSubmissionEvidence, type SubmissionEvidence } from "../../src/domain/challenge-submission";

describe("P20 challenge submission", () => {
  test("three-minute runbook has seven ordered segments and stays within 3:00", () => {
    expect(P20_DEMO_STEPS).toHaveLength(7);
    expect(P20_DEMO_STEPS[0]?.minute).toBe("0:00–0:25");
    expect(P20_DEMO_STEPS.at(-1)?.minute).toBe("2:40–3:00");
  });

  test("final gate fails closed while real-device, reproduction or video evidence is pending", () => {
    const summary = summarizeSubmissionEvidence(evidenceLedger.evidence as SubmissionEvidence[]);
    expect(summary.finalSubmissionReady).toBe(false);
    expect(summary.pendingHuman).toBeGreaterThanOrEqual(1);
    expect(summary.pendingExternal).toBeGreaterThanOrEqual(1);
  });

  test("critical evidence only becomes ready when every critical item is explicitly ready", () => {
    const ready = (evidenceLedger.evidence as SubmissionEvidence[]).map((item) => ({ ...item, status: "ready" as const }));
    expect(summarizeSubmissionEvidence(ready).finalSubmissionReady).toBe(true);
  });
});
