import { describe, expect, test } from "bun:test";
import { HEALTH_DOMAINS } from "@/domain/health-domains/registry";
import { boneReportedFieldSuggestions } from "@/domain/bone-health/reported-field-suggestions";
import { resolveBoneObservationInstant } from "@/domain/bone-health/local-datetime";
import { persistBoneCorrection } from "@/domain/bone-health/correction";
import type { BoneHealthEntry } from "@/domain/bone-health/history";

describe("health navigation preserves Bone safety rules", () => {
  test("the shared registry includes exactly the four requested domain destinations", () => {
    expect(HEALTH_DOMAINS.map(({ id, path }) => [id, path])).toEqual([
      ["bone", "/mission/bone-health"], ["immune", "/mission/immune-health"],
      ["cardiovascular", "/mission/cardiovascular-health"], ["behavioral", "/mission/behavioral-health"],
    ]);
  });
  test("the other three domains remain pending scientific review", () => {
    expect(HEALTH_DOMAINS.filter(domain => domain.id !== "bone").map(domain => domain.reviewState))
      .toEqual(["scientific_review_pending", "scientific_review_pending", "scientific_review_pending"]);
  });
  test("unchanged correction date preserves the original precise instant", () => {
    expect(resolveBoneObservationInstant("2026-10-27T14:34", "2026-10-27T12:34:56.789Z", false))
      .toBe("2026-10-27T12:34:56.789Z");
  });
  test("unauthorized history cannot supply reported metadata suggestions", () => {
    const entry: BoneHealthEntry = { id: "test", missionId: "m", crewMemberId: "c", variableId: "bone-001",
      dataOrigin: "synthetic", value: 1, unit: "Custom", sourceLabel: "Synthetic Lab", specimen: "Serum",
      assayMethod: "custom method", observedAt: "2026-10-27T12:34:56.789Z", notes: "" };
    expect(boneReportedFieldSuggestions([entry], { authorized: false, missionId: "m", crewMemberId: "c",
      variableId: "bone-001", dataOrigin: "synthetic" })).toEqual({ unit: ["ng/L", "pg/mL"], specimen: [], assayMethod: [] });
  });
  test("failed correction append does not mark its original erroneous", async () => {
    const entry: BoneHealthEntry = { id: "original", missionId: "m", crewMemberId: "c", variableId: "bone-001",
      dataOrigin: "synthetic", value: 1, unit: "pg/mL", sourceLabel: "Synthetic Lab", specimen: "",
      assayMethod: "", observedAt: "2026-10-27T12:34:56.789Z", notes: "" };
    let marked = false;
    await expect(persistBoneCorrection({ ...entry, id: "correction", supersedesId: entry.id }, entry,
      async () => { throw new Error("write failed"); }, async () => { marked = true; })).rejects.toThrow("write failed");
    expect(marked).toBe(false);
  });
});