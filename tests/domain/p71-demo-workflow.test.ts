import { describe, expect, test } from "bun:test";

import { P69_DEMO_CATALOG, P69_DEMO_CREW_SUBJECT, P69_DEMO_MISSION_CODE } from "@/domain/public-demo/catalog";
import {
  DEMO_ROLE_LABELS,
  checkTransition,
  createOfflineDemoState,
  currentEpochRecords,
  offlineReset,
  offlineRestore,
  offlineSubmit,
  offlineTransition,
  projectRecordForRole,
  queueFor,
  sampleExaminationMeasurements,
  validateExaminationInput,
  type OfflineDemoState,
} from "@/domain/public-demo/workflow";

const AT = "2026-11-14T12:00:00.000Z";
const TODAY = "2026-11-14";
const exam = { observedOn: TODAY, sourceQuality: "good", measurements: [{ metricId: "demo:ubt-e1140df3", value: "121", unit: "mmHg" }] };

function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
}

describe("P71 synthetic demo workflow", () => {
  test("synthetic demo identity is explicit and separate from the MITO_DEMO_2026 crew record", () => {
    expect(P69_DEMO_MISSION_CODE).toBe("NASA-DEMO-304-001");
    expect(P69_DEMO_CREW_SUBJECT).toEqual({ id: "synthetic-alex-morgan", name: "Alex Morgan — Synthetic Astronaut" });
    expect(P69_DEMO_CATALOG.length).toBe(30);
    expect(new Set(P69_DEMO_CATALOG.map((c) => c.metricId)).size).toBe(30);
    expect(P69_DEMO_CATALOG.some((c) => c.label.includes("Galectin"))).toBe(false);
  });

  test("demo roles map to the existing role responsibilities without new authority", () => {
    expect(DEMO_ROLE_LABELS.astronaut.existingRole).toBe("crew_self");
    expect(DEMO_ROLE_LABELS.researcher.existingRole).toBe("researcher");
    expect(DEMO_ROLE_LABELS.medical.existingRole).toBe("ground_medical");
  });

  test("examination validation: exact IDs and units, no duplicates, no future dates", () => {
    expect(validateExaminationInput(exam, TODAY).ok).toBe(true);
    expect(validateExaminationInput({ ...exam, measurements: sampleExaminationMeasurements() }, TODAY).ok).toBe(true);
    expect(validateExaminationInput({ ...exam, measurements: [{ metricId: "demo:ubt-e1140df3", value: "16", unit: "kPa" }] }, TODAY).ok).toBe(false);
    expect(validateExaminationInput({ ...exam, measurements: [{ metricId: "demo:ubt-6b4e6b7f", value: "12.4", unit: "ng/mL" }] }, TODAY).ok).toBe(false);
    expect(validateExaminationInput({ ...exam, measurements: [exam.measurements[0]!, exam.measurements[0]!] }, TODAY).ok).toBe(false);
    expect(validateExaminationInput({ ...exam, observedOn: "2026-11-20" }, TODAY).ok).toBe(false);
    expect(validateExaminationInput({ ...exam, measurements: [{ metricId: "demo:ubt-e1140df3", value: "12O", unit: "mmHg" }] }, TODAY).ok).toBe(false);
    expect(validateExaminationInput({ ...exam, measurements: [] }, TODAY).ok).toBe(false);
  });

  test("transition rules reject wrong role, stale revision and wrong state", () => {
    const base = { currentState: "submitted" as const, currentRevision: 1, expectedRevision: 1, note: "" };
    expect(checkTransition({ ...base, role: "researcher", action: "scientific_assessment_recorded", outcome: "requires_more_evidence" }).ok).toBe(true);
    expect(checkTransition({ ...base, role: "medical", action: "scientific_assessment_recorded", outcome: "requires_more_evidence" })).toMatchObject({ ok: false, code: "wrong_role" });
    expect(checkTransition({ ...base, role: "astronaut", action: "scientific_assessment_recorded", outcome: "requires_more_evidence" })).toMatchObject({ ok: false, code: "wrong_role" });
    expect(checkTransition({ ...base, expectedRevision: 0, role: "researcher", action: "scientific_assessment_recorded", outcome: "requires_more_evidence" })).toMatchObject({ ok: false, code: "stale" });
    expect(checkTransition({ ...base, role: "medical", action: "medical_review_recorded", outcome: "no_follow_up_needed" })).toMatchObject({ ok: false, code: "invalid_state" });
    expect(checkTransition({ ...base, role: "researcher", action: "scientific_assessment_recorded", outcome: "no_follow_up_needed" })).toMatchObject({ ok: false, code: "invalid" });
  });

  test("full astronaut → researcher → medical chain keeps one record ID and append-only history", () => {
    let s: OfflineDemoState = createOfflineDemoState(AT);
    expect(currentEpochRecords(s).length).toBe(1);
    expect(offlineSubmit(s, "researcher", exam, AT)).toMatchObject({ ok: false, code: "wrong_role" });
    s = must(offlineSubmit(s, "astronaut", exam, AT)).state;
    const id = currentEpochRecords(s)[1]!.id;
    expect(queueFor("researcher", currentEpochRecords(s)).map((r) => r.id)).toEqual([id]);
    s = must(offlineTransition(s, { role: "researcher", recordId: id, action: "scientific_assessment_recorded", outcome: "requires_more_evidence", note: "Synthetic note", expectedRevision: 1 }, AT)).state;
    expect(offlineTransition(s, { role: "researcher", recordId: id, action: "scientific_assessment_recorded", outcome: "consistent_with_synthetic_reference", note: "", expectedRevision: 1 }, AT)).toMatchObject({ ok: false, code: "stale" });
    s = must(offlineTransition(s, { role: "medical", recordId: id, action: "medical_review_recorded", outcome: "follow_up_recommended", note: "", expectedRevision: 2 }, AT)).state;
    const record = currentEpochRecords(s)[1]!;
    expect(record.id).toBe(id);
    expect(record.events.map((e) => [e.revision, e.action, e.actorRole, e.fromState, e.toState])).toEqual([
      [1, "submitted", "astronaut", null, "submitted"],
      [2, "scientific_assessment_recorded", "researcher", "submitted", "scientific_assessment_recorded"],
      [3, "medical_review_recorded", "medical", "scientific_assessment_recorded", "medical_review_recorded"],
    ]);
    expect(record.events.every((e) => e.evidence.provenance === "synthetic")).toBe(true);
    const astro = projectRecordForRole(record, "astronaut");
    expect(astro.events[1]).toMatchObject({ redacted: true, outcome: null, note: null });
    expect(astro.events[2]!.outcome).toBe("follow_up_recommended");
    expect(record.events[1]!.outcome).toBe("requires_more_evidence");
  });

  test("medical can enter a new synthetic examination; researcher cannot", () => {
    const s = createOfflineDemoState(AT);
    expect(offlineSubmit(s, "medical", exam, AT).ok).toBe(true);
    expect(offlineSubmit(s, "researcher", exam, AT)).toMatchObject({ ok: false, code: "wrong_role" });
  });

  test("reset adds a fresh seeded version; restore returns earlier work without deleting", () => {
    let s = must(offlineSubmit(createOfflineDemoState(AT), "astronaut", exam, AT)).state;
    expect(offlineReset(s, 99, AT)).toMatchObject({ ok: false, code: "stale" });
    s = must(offlineReset(s, s.revision, AT)).state;
    expect(s.epoch).toBe(2);
    expect(currentEpochRecords(s).length).toBe(1);
    s = must(offlineRestore(s, 1, s.revision)).state;
    expect(currentEpochRecords(s).length).toBe(2);
    expect(s.records.length).toBe(3);
    expect(offlineRestore(s, 1, s.revision).ok).toBe(false);
  });
});
