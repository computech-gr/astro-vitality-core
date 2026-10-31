import { afterAll, expect, mock, test } from "bun:test";

type Stored = { id: string; sourceId: string; mission: { missionId: string; crewMemberId: string }; payload: unknown; createdAt: string };
const store: Stored[] = [];
let tick = 0;
// Bun module mocks are process-wide: keep every real export and restore it after this file
// so later test files keep the complete offline module contract.
const actualOffline = { ...(await import("@/infrastructure/offline")) };
afterAll(() => { mock.module("@/infrastructure/offline", () => actualOffline); });
mock.module("@/infrastructure/offline", () => ({
  ...actualOffline,
  persistOfflineMissionEvent: async (event: Omit<Stored, "createdAt">) => {
    store.push({ ...event, createdAt: new Date(Date.UTC(2026, 9, 28, 0, 0, tick++)).toISOString() });
  },
  getOfflineMissionStore: () => ({ list: async () => [...store] }),
}));

const profiles = await import("@/domain/health-measurements/profiles");
const { parseBoneImport } = await import("@/domain/bone-health/import");
const { parseBoneCorrectedText } = await import("@/domain/bone-health/document-extraction");
const { saveBoneEntry, listBoneEntries, markBoneEntryErroneous, validateBoneEntry } = await import("@/domain/bone-health/history");
const { persistBoneCorrection } = await import("@/domain/bone-health/correction");
const { retainBoneImport, restoreBoneImport } = await import("@/domain/bone-health/import-session");
const { selectBoneReviewRows } = await import("@/domain/bone-health/review-selection");
const { MEASUREMENT_PROFILES, BONE_MEASUREMENT_PROFILE, IMMUNE_MEASUREMENT_PROFILE, CARDIOVASCULAR_MEASUREMENT_PROFILE, BEHAVIORAL_MEASUREMENT_PROFILE } = profiles;

test("each domain binds its existing catalog size and unique storage identifiers", () => {
  expect(BONE_MEASUREMENT_PROFILE.variables.length).toBe(63);
  expect(IMMUNE_MEASUREMENT_PROFILE.variables.length).toBe(35);
  expect(BEHAVIORAL_MEASUREMENT_PROFILE.variables.length).toBe(36);
  expect(CARDIOVASCULAR_MEASUREMENT_PROFILE.variables.length).toBe(96);
  const all = Object.values(MEASUREMENT_PROFILES);
  for (const key of ["sourceId", "eventPrefix", "sessionKey"] as const) expect(new Set(all.map(p => p[key])).size).toBe(4);
  // Existing Bone records keep their original storage identity.
  expect(BONE_MEASUREMENT_PROFILE.sourceId).toBe("p22.1-bone-health-manual");
  expect(BONE_MEASUREMENT_PROFILE.sessionKey).toBe("mitochondria.bone-import.synthetic.v1");
});

test.each(Object.values(MEASUREMENT_PROFILES).map(p => [p.domainId, p] as const))("%s CSV example parses only its own catalog", (_id, profile) => {
  const review = parseBoneImport(profile.csvExample, profile);
  expect(review.rejected).toEqual([]);
  expect(review.candidates.length).toBeGreaterThan(0);
  expect(review.candidates.every(c => !c.selected)).toBe(true);
  for (const other of Object.values(MEASUREMENT_PROFILES).filter(p => p !== profile)) {
    expect(parseBoneImport(profile.csvExample, other).candidates).toEqual([]);
  }
});

test("CSV preserves full units containing spaces and slashes", () => {
  const csv = 'variable,value,unit,observed_at,source\nIMM-001,6.1,"10^9 cells / L",2026-10-01T09:00:00+02:00,Lab\n';
  const row = parseBoneImport(csv, IMMUNE_MEASUREMENT_PROFILE).candidates[0];
  expect(row?.unit).toBe("10^9 cells / L");
  expect(row?.observedAt).toBe("2026-10-01T07:00:00.000Z");
});

test("PDF rows map exact IDs with and without analyte names; mismatched names need human review", () => {
  const imm = IMMUNE_MEASUREMENT_PROFILE.variables[0]!;
  const text = `Report ID IMM-001 header\nIMM-001 | 6.1 | 10^9/L\n${imm.id} ${imm.name} 5.9 10^9/L whole blood\nIMM-001 Hemoglobin 13.2 g/dL`;
  const parsed = parseBoneCorrectedText(text, "report.pdf", IMMUNE_MEASUREMENT_PROFILE);
  expect(parsed.matches.map(m => [m.variableId, m.value, m.observedAt])).toEqual([["IMM-001", 6.1, ""], ["IMM-001", 5.9, ""]]);
  expect(parsed.errors.some(e => e.includes("human confirmation"))).toBe(true);
  expect(parseBoneCorrectedText("cv-001 | 62 | bpm", "x", CARDIOVASCULAR_MEASUREMENT_PROFILE).matches[0]?.variableId).toBe("cv-001");
  // Another domain's ID is never mapped.
  expect(parseBoneCorrectedText("cv-001 | 62 | bpm", "x", BONE_MEASUREMENT_PROFILE).matches).toEqual([]);
});

const entry = (variableId: string, extra: Partial<Parameters<typeof saveBoneEntry>[0]> = {}) => ({
  id: crypto.randomUUID(), missionId: "m1", crewMemberId: "c1", variableId, value: 62, unit: "bpm",
  observedAt: "2026-10-01T09:00:00.000Z", sourceLabel: "Demo", specimen: "", assayMethod: "", notes: "n1",
  dataOrigin: "synthetic" as const, ...extra,
});

test("domains, missions and crew never co-mingle in append-only history", async () => {
  store.length = 0;
  await saveBoneEntry(entry("cv-001"), CARDIOVASCULAR_MEASUREMENT_PROFILE);
  await saveBoneEntry(entry("cv-001", { crewMemberId: "c2" }), CARDIOVASCULAR_MEASUREMENT_PROFILE);
  await saveBoneEntry(entry("bone-001", { unit: "ng/mL" }));
  expect((await listBoneEntries("m1", "c1", CARDIOVASCULAR_MEASUREMENT_PROFILE)).map(e => e.variableId)).toEqual(["cv-001"]);
  expect((await listBoneEntries("m1", "c1")).map(e => e.variableId)).toEqual(["bone-001"]);
  expect(await listBoneEntries("m1", "c1", IMMUNE_MEASUREMENT_PROFILE)).toEqual([]);
  expect(validateBoneEntry(entry("cv-001"))).toBe("Choose a catalog variable.");
  await expect(saveBoneEntry(entry("cv-001"), IMMUNE_MEASUREMENT_PROFILE)).rejects.toThrow();
});

test("correction appends, preserves notes and marks original erroneous only after success", async () => {
  store.length = 0;
  const original = entry("IMM-001", { unit: "10^9/L" });
  await saveBoneEntry(original, IMMUNE_MEASUREMENT_PROFILE);
  const save = (e: typeof original) => saveBoneEntry(e, IMMUNE_MEASUREMENT_PROFILE);
  const mark = (e: typeof original, r: string) => markBoneEntryErroneous(e, r, IMMUNE_MEASUREMENT_PROFILE);
  await expect(persistBoneCorrection({ ...original, id: "bad", variableId: "nope" }, original, save, mark)).rejects.toThrow();
  expect((await listBoneEntries("m1", "c1", IMMUNE_MEASUREMENT_PROFILE)).map(e => e.status ?? "active")).toEqual(["active"]);
  const count = store.length;
  await persistBoneCorrection({ ...original, id: "fix", value: 6.3, supersedesId: original.id }, original, save, mark);
  expect(store.length).toBe(count + 2);
  const rows = await listBoneEntries("m1", "c1", IMMUNE_MEASUREMENT_PROFILE);
  expect(rows.find(r => r.id === original.id)?.status).toBe("erroneous");
  expect(rows.find(r => r.id === "fix")?.notes).toBe("n1");
});

test("session retention is domain-keyed and never restores into another domain", () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  const scope = { userId: "u", missionId: "m1", crewMemberId: "c1", dataOrigin: "synthetic" as const };
  const row = { ...entry("BSC-001", { unit: "h" }), selected: true, rawLine: "BSC-001 6.5 h" };
  retainBoneImport(storage, scope, [{ id: "f", name: "a.csv", kind: "CSV", file: undefined, status: "review", detail: "", review: { rows: [row], errors: [], text: "", method: "CSV" } }], BEHAVIORAL_MEASUREMENT_PROFILE);
  expect(data.has(BEHAVIORAL_MEASUREMENT_PROFILE.sessionKey)).toBe(true);
  expect(data.has(BONE_MEASUREMENT_PROFILE.sessionKey)).toBe(false);
  const restored = restoreBoneImport(storage, scope, BEHAVIORAL_MEASUREMENT_PROFILE);
  expect(restored[0]?.review?.rows[0]?.selected).toBe(false);
  expect(restoreBoneImport(storage, scope, BONE_MEASUREMENT_PROFILE)).toEqual([]);
});

test("Verify All selects only rows valid for the domain catalog", () => {
  const ok = { ...entry("cv-001"), selected: false, id: "a" };
  const foreign = { ...entry("bone-001"), selected: false, id: "b" };
  const noDate = { ...entry("cv-002", { observedAt: "" }), selected: false, id: "c" };
  expect(selectBoneReviewRows([ok, foreign, noDate], true, CARDIOVASCULAR_MEASUREMENT_PROFILE).map(r => r.selected)).toEqual([true, false, false]);
});
