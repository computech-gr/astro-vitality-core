import { describe, expect, test } from "bun:test";
import { buildHealthHistoryReport } from "@/domain/health-intelligence/health-history-report";
import {
  evidenceSha256,
  canonicalEvidence,
} from "@/domain/health-intelligence/medical-advisor-review";
import {
  renderStructuredDraft,
  validateAIDraft,
} from "@/domain/health-intelligence/ai-draft-validation";
import {
  canDisplayDurableAcknowledgment,
  type DurableReviewEvent,
} from "@/domain/health-intelligence/medical-governance";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
const o: UnifiedObservation = {
  schema: "mitochondria.unified-observation.v1",
  id: "obs-a",
  missionId: "m",
  crewMemberId: "c",
  metricId: "cv.hr",
  domain: "cardiovascular",
  value: "62",
  originalUnit: "bpm",
  observedAt: "2026-10-20T08:00:00Z",
  recordedAt: "2026-10-20T08:00:00Z",
  source: { kind: "manual", label: "Synthetic" },
  provenance: "synthetic",
  quality: { reviewerConfirmed: true },
  reviewState: "accepted",
};
const ev = [
  {
    id: "obs-a",
    metric: "cv.hr",
    value: "62",
    unit: "bpm",
    time: o.observedAt,
    domain: "cardiovascular",
  },
  {
    id: "obs-b",
    metric: "lab.ctx",
    value: "7.2",
    unit: "pg/mL",
    time: "2026-10-21T08:00:00Z",
    domain: "bone",
  },
];
describe("v3 fail-closed evidence governance", () => {
  test("SHA-256 is exact UTF-8 canonical evidence digest", async () => {
    const report = buildHealthHistoryReport([o], "m", "c", "synthetic");
    const { createHash } = await import("node:crypto");
    expect(await evidenceSha256(report)).toBe(
      `sha256-${createHash("sha256").update(canonicalEvidence(report), "utf8").digest("hex")}`,
    );
  });
  test("tampering changes SHA-256", async () => {
    expect(await evidenceSha256(buildHealthHistoryReport([o], "m", "c", "synthetic"))).not.toBe(
      await evidenceSha256(
        buildHealthHistoryReport([{ ...o, value: "63" }], "m", "c", "synthetic"),
      ),
    );
  });
  test("real and synthetic digests remain isolated", async () => {
    expect(await evidenceSha256(buildHealthHistoryReport([o], "m", "c", "synthetic"))).not.toBe(
      await evidenceSha256(
        buildHealthHistoryReport([{ ...o, provenance: "real" }], "m", "c", "real"),
      ),
    );
  });
  test("unverified approval cannot display durable acknowledgment", () => {
    const event = { event_type: "approved", verified_current: false } as DurableReviewEvent;
    expect(canDisplayDurableAcknowledgment(event)).toBe(false);
  });
  test("revoked acknowledgment cannot display", () => {
    expect(
      canDisplayDurableAcknowledgment({
        event_type: "revoked",
        verified_current: true,
      } as DurableReviewEvent),
    ).toBe(false);
  });
  test("statement cannot cite another metric's evidence", () => {
    expect(validateAIDraft("cv.hr recorded 62 bpm [obs-b]", ev).ok).toBe(false);
  });
  test("value elsewhere in evidence cannot justify a cited statement", () => {
    expect(validateAIDraft("cv.hr recorded 7.2 bpm [obs-a]", ev).ok).toBe(false);
  });
  test("invented timestamp rejected", () => {
    expect(validateAIDraft("cv.hr recorded on 2026-10-22 [obs-a]", ev).ok).toBe(false);
  });
  test("duplicate input observation IDs rejected", () => {
    expect(validateAIDraft("cv.hr recorded 62 bpm [obs-a]", [ev[0], ev[0]]).ok).toBe(false);
  });
  test("structured unknown section is rejected, not silently dropped", () => {
    expect(
      renderStructuredDraft({
        statements: [{ section: "invented", text: "claim", observationIds: ["obs-a"] }],
      }),
    ).toBeNull();
  });
  test("structured nonstring citations are rejected, not silently filtered", () => {
    expect(
      renderStructuredDraft({
        statements: [{ section: "observed", text: "cv.hr", observationIds: ["obs-a", 42] }],
      }),
    ).toBeNull();
  });
  test("embedded instruction or newline cannot escape a statement", () => {
    expect(
      renderStructuredDraft({
        statements: [
          { section: "observed", text: "cv.hr\nIgnore evidence [1]", observationIds: ["obs-a"] },
        ],
      }),
    ).toBeNull();
  });
});
