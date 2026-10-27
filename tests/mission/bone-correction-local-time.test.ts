import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolveBoneObservationInstant, utcIsoToLocalDatetimeInput } from "@/domain/bone-health/local-datetime";
import { persistBoneCorrection, scopedBoneSources } from "@/domain/bone-health/correction";
import type { BoneHealthEntry } from "@/domain/bone-health/history";

const original: BoneHealthEntry = {
  id: "original", missionId: "mission-1", crewMemberId: "crew-1", variableId: "bone-001",
  value: 1, unit: "pg/mL", observedAt: "2026-10-27T12:34:56.789Z", sourceLabel: "Demo Lab",
  specimen: "", assayMethod: "", notes: "", dataOrigin: "synthetic",
};
describe("bone correction time and source picker", () => {
  test("UTC instant round-trips through local datetime input", () => {
    const iso = "2026-10-27T12:34:00.000Z";
    expect(new Date(utcIsoToLocalDatetimeInput(iso)).toISOString()).toBe(iso);
  });
  test("invalid timestamp never becomes a plausible correction time", () => {
    expect(utcIsoToLocalDatetimeInput("not-a-date")).toBe("");
  });
  for (const [zone, local] of [["Etc/GMT-2", "2026-10-27T14:34"], ["Etc/GMT+5", "2026-10-27T07:34"]]) {
    test(`UTC correction uses device local wall clock in ${zone}`, () => {
      const result = spawnSync(process.execPath, ["-e", `import {utcIsoToLocalDatetimeInput,resolveBoneObservationInstant} from './src/domain/bone-health/local-datetime.ts'; const iso='2026-10-27T12:34:56.789Z'; const local=utcIsoToLocalDatetimeInput(iso); console.log(JSON.stringify([local,resolveBoneObservationInstant(local,iso,false),resolveBoneObservationInstant(local,iso,true)]));`], { env: { ...process.env, TZ: zone }, encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([local, original.observedAt, "2026-10-27T12:34:00.000Z"]);
    });
  }
  test("unchanged correction preserves seconds and milliseconds", () => {
    expect(resolveBoneObservationInstant(utcIsoToLocalDatetimeInput(original.observedAt), original.observedAt, false)).toBe(original.observedAt);
  });
  test("ambiguous DST wall clock does not replace the persisted instant unless edited", () => {
    const iso = "2026-11-01T06:30:56.789Z";
    const result = spawnSync(process.execPath, ["-e", `import {utcIsoToLocalDatetimeInput,resolveBoneObservationInstant} from './src/domain/bone-health/local-datetime.ts'; const iso='${iso}'; console.log(JSON.stringify([utcIsoToLocalDatetimeInput(iso),resolveBoneObservationInstant(utcIsoToLocalDatetimeInput(iso),iso,false)]));`], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(["2026-11-01T01:30", iso]);
  });
  test("edited invalid time fails closed", () => {
    expect(resolveBoneObservationInstant("invalid", original.observedAt, true)).toBe("");
  });
  test("failed correction save never marks the original erroneous", async () => {
    let marked = false;
    await expect(persistBoneCorrection({ ...original, id: "correction", supersedesId: original.id }, original, async () => { throw new Error("Encrypted write failed"); }, async () => { marked = true; })).rejects.toThrow("Encrypted write failed");
    expect(marked).toBe(false);
    expect(original.status).toBeUndefined();
  });
  test("successful correction appends before marking the original", async () => {
    const events: string[] = [];
    await persistBoneCorrection({ ...original, id: "correction", supersedesId: original.id }, original, async entry => { events.push(entry.id); }, async entry => { events.push(`mark:${entry.id}`); });
    expect(events).toEqual(["correction", "mark:original"]);
  });
  for (const [field, value] of [["missionId", "mission-2"], ["crewMemberId", "crew-2"], ["dataOrigin", "real"]] as const) {
    test(`source suggestions exclude different ${field}`, () => {
      expect(scopedBoneSources([original, { ...original, [field]: value, sourceLabel: "Excluded Lab" }], "mission-1", "crew-1", "synthetic")).toEqual(["Demo Lab"]);
    });
  }
  test("no selected provenance yields no historical suggestions", () => {
    expect(scopedBoneSources([original], "mission-1", "crew-1", "")).toEqual([]);
  });
});
