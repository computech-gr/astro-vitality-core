import { describe, expect, test } from "bun:test";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import {
  buildP72CopyPlan,
  p72CopyObservationId,
  P72_SOURCE_SCOPE,
  P72_TARGET_SCOPE,
} from "@/domain/examination-copy/p72-copy-plan";
import { deriveScopeKeys, openEvent, sealEvent } from "@/lib/observation-sync.server";

const core: UnifiedObservation = {
  schema: "mitochondria.unified-observation.v1",
  id: "059b5901-34c6-406b-8278-cff22a61cf05",
  missionId: P72_SOURCE_SCOPE.missionId,
  crewMemberId: P72_SOURCE_SCOPE.crewMemberId,
  metricId: "cv-005",
  domain: "cardiovascular",
  value: "122",
  originalUnit: "mmHg",
  observedAt: "2026-10-30T08:00:00.000Z",
  provenance: "synthetic",
  quality: { reviewerConfirmed: true },
  reviewState: "accepted",
  status: "active",
  recordedAt: "2026-11-01T14:37:29.201Z",
  source: {
    kind: "csv",
    label: "CSV: MITOCHONDRIA_Alex_Morgan_SYNTHETIC_Cardio_Behavioral_Followup_Oct2026.csv",
    documentName: "MITOCHONDRIA_Alex_Morgan_SYNTHETIC_Cardio_Behavioral_Followup_Oct2026.csv",
    documentSha256: "47fa43b38675a292602fcc4abccd45515203f5f5a61113bde71acc44032cf495",
    excerpt: "cv-005,122,mmHg,2026-10-30T08:00:00Z,SYNTHETIC Follow-up Device",
  },
};

const demo = {
  ...core,
  schema: "mitochondria.unified-observation.v2",
  id: "006858b8-eb52-4b42-b342-e0684ce4cf6d",
  metricId: "demo:ubt-625f8d98",
  value: "108",
  originalUnit: "bpm",
  observedAt: "2026-11-12",
  datePrecision: "date",
  catalogBasis: { classification: "SYNTHETIC_DEMO_NOT_SCIENTIFICALLY_VALIDATED", demoCatalogVersion: 372, demoId: "demo:ubt-625f8d98", displayName: "Resting heart rate", kind: "synthetic_demo", termId: "ubt-625f8d98" },
} as UnifiedObservation;

const src = (o: UnifiedObservation, kind: "entry" | "status" = "entry") => ({
  event: { eventId: `${o.id}:${kind}`, eventKind: kind, observation: o },
  sourceFingerprint: `ofp-${"a".repeat(64)}`,
});

describe("P72 synthetic examination copy plan", () => {
  test("copy keeps value, unit, date and document provenance exactly and moves only the scope", async () => {
    const plan = await buildP72CopyPlan([src(core)], new Set());
    const e = plan.entries[0]!;
    expect(e.decision).toBe("copy");
    const o = e.copy!.observation;
    expect([o.value, o.originalUnit, o.observedAt, o.metricId, o.domain]).toEqual(["122", "mmHg", "2026-10-30T08:00:00.000Z", "cv-005", "cardiovascular"]);
    expect(o.source.documentSha256).toBe(core.source.documentSha256);
    expect(o.source.excerpt).toBe(core.source.excerpt);
    expect([o.missionId, o.crewMemberId]).toEqual([P72_TARGET_SCOPE.missionId, P72_TARGET_SCOPE.crewMemberId]);
    expect(o.source.label).toContain(`P72 synthetic copy of ${core.id}`);
  });

  test("the source reviewer's confirmation is never carried: copies start pending review", async () => {
    const o = (await buildP72CopyPlan([src(core)], new Set())).entries[0]!.copy!.observation;
    expect(o.reviewState).toBe("pending_review");
    expect(o.quality.reviewerConfirmed).toBe(false);
  });

  test("copy IDs are deterministic and bound to the target scope", async () => {
    const a = await p72CopyObservationId(core.id, P72_TARGET_SCOPE);
    expect(await p72CopyObservationId(core.id, P72_TARGET_SCOPE)).toBe(a);
    expect(await p72CopyObservationId(core.id, { ...P72_TARGET_SCOPE, crewMemberId: "crew-other" })).not.toBe(a);
    expect(a).not.toBe(core.id);
  });

  test("a repeated transfer copies nothing again", async () => {
    const first = await buildP72CopyPlan([src(core)], new Set());
    const second = await buildP72CopyPlan([src(core)], new Set([first.entries[0]!.copyEventId]));
    expect(second.counts).toEqual({ source: 1, copy: 0, alreadyCopied: 1, held: 0 });
  });

  test("demo-catalog terms of MITO_DEMO_2026 are held for another mission", async () => {
    const plan = await buildP72CopyPlan([src(demo)], new Set());
    expect(plan.entries[0]!.decision).toBe("held");
    expect(plan.counts.copy).toBe(0);
  });

  test("withdrawn, corrected, real or status records are never copied", async () => {
    const plan = await buildP72CopyPlan(
      [
        src({ ...core, id: "11111111-1111-4111-8111-111111111111", status: "erroneous" }, "status"),
        src({ ...core, id: "22222222-2222-4222-8222-222222222222", supersedesId: core.id }),
        src({ ...core, id: "33333333-3333-4333-8333-333333333333", provenance: "real" }),
      ],
      new Set(),
    );
    expect(plan.counts).toEqual({ source: 3, copy: 0, alreadyCopied: 0, held: 3 });
  });

  test("source records are left unchanged", async () => {
    const before = JSON.stringify(core);
    await buildP72CopyPlan([src(core)], new Set());
    expect(JSON.stringify(core)).toBe(before);
  });

  test("a sealed copy opens only under the target scope key", async () => {
    const master = new Uint8Array(32).fill(7);
    const copy = (await buildP72CopyPlan([src(core)], new Set())).entries[0]!.copy!;
    const targetKeys = await deriveScopeKeys(master, 1, P72_TARGET_SCOPE);
    const sealed = await sealEvent(targetKeys, P72_TARGET_SCOPE, copy);
    const row = { event_id: sealed.eventId, iv: sealed.iv, ciphertext: sealed.ciphertext, fingerprint: sealed.fingerprint, event_kind: sealed.eventKind, observation_id: sealed.observationId };
    expect((await openEvent(targetKeys, P72_TARGET_SCOPE, row)).observation.value).toBe("122");
    const sourceKeys = await deriveScopeKeys(master, 1, P72_SOURCE_SCOPE);
    await expect(openEvent(sourceKeys, P72_SOURCE_SCOPE, row)).rejects.toThrow();
  });
});
