import { expect, test } from "bun:test";
import { persistBoneCorrection } from "@/domain/bone-health/correction";
import type { BoneHealthEntry } from "@/domain/bone-health/history";

test("append-only correction preserves supplied original notes in both versions", async () => {
  const notes = "Original notes\nExact unicode α and punctuation.";
  const original: BoneHealthEntry = { id: "original", missionId: "m", crewMemberId: "c", variableId: "bone-001", value: 12, unit: "pg/mL", observedAt: "2026-10-28T06:49:00Z", sourceLabel: "Custom lab", specimen: "", assayMethod: "", notes, dataOrigin: "synthetic" };
  const saved: BoneHealthEntry[] = [];
  await persistBoneCorrection({ ...original, id: "correction", value: 13, supersedesId: original.id }, original, async row => { saved.push(row); }, async () => {});
  expect(saved[0].notes).toBe(notes);
  expect(original.notes).toBe(notes);
  expect(saved[0].supersedesId).toBe("original");
});