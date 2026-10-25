import { describe, expect, test } from "bun:test";
import { readSyntheticTabState, writeSyntheticTabState, SYNTHETIC_TAB_CACHE_KEY } from "../../src/domain/health-intelligence/synthetic-tab-state";
import { SYNTHETIC_DEMO_QUESTIONS } from "../../src/domain/health-intelligence/production-synthetic-demo";
import type { SyntheticEvidenceSnapshot } from "../../src/domain/health-intelligence/synthetic-evidence";

const snapshot: SyntheticEvidenceSnapshot = {
  missionId: "synthetic-mission", crewMemberId: "synthetic-crew", sha256: "sha256-current", canonical: "{}",
  evidence: [{ id: "synthetic-v3-hr-001", metric: "HR", value: "62", unit: "bpm", time: "2026-10-25T00:00:00Z", domain: "cardiovascular" }],
};
const fact = "HR recorded 62 bpm at 2026-10-25T00:00:00Z. [synthetic-v3-hr-001]";
function storage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, removeItem: (k: string) => { map.delete(k); } };
}
const text = { question: SYNTHETIC_DEMO_QUESTIONS[0], answer: fact, draft: fact, final: fact };
describe("synthetic tab convenience state", () => {
  test("restores exact synthetic facts with the freshly authorized owner and hash", () => {
    const store = storage();
    writeSyntheticTabState(store, "owner", snapshot, text);
    expect(readSyntheticTabState(store, "owner", snapshot)).toEqual(text);
  });
  test("rejects a different owner", () => {
    const store = storage(); writeSyntheticTabState(store, "owner", snapshot, text);
    expect(readSyntheticTabState(store, "other", snapshot)).toBeNull();
    expect(store.getItem(SYNTHETIC_TAB_CACHE_KEY)).toBeNull();
  });
  test("rejects changed authoritative evidence hash", () => {
    const store = storage(); writeSyntheticTabState(store, "owner", snapshot, text);
    expect(readSyntheticTabState(store, "owner", { ...snapshot, sha256: "sha256-changed" })).toBeNull();
  });
  test("rejects changed mission or crew scope even with the same hash", () => {
    for (const changed of [{ missionId: "other" }, { crewMemberId: "other" }]) {
      const store = storage(); writeSyntheticTabState(store, "owner", snapshot, text);
      expect(readSyntheticTabState(store, "owner", { ...snapshot, ...changed })).toBeNull();
    }
  });
  test("never serializes consent, approval, rationale or arbitrary real medical text", () => {
    const store = storage();
    writeSyntheticTabState(store, "owner", snapshot, { ...text, draft: "Real astronaut Jane: medical data", final: "approved", consent: true, acknowledged: true, rationale: "private" } as typeof text);
    const row = JSON.parse(store.getItem(SYNTHETIC_TAB_CACHE_KEY) ?? "{}");
    expect(Object.keys(row).sort()).toEqual(["userId", "sha256", "missionId", "crewMemberId", "question", "answer", "draft", "final"].sort());
    expect(row.draft).toBe(""); expect(row.final).toBe("");
  });
  test("rejects altered measurement values and citations", () => {
    const store = storage(); writeSyntheticTabState(store, "owner", snapshot, { ...text, answer: fact.replace("62", "66"), draft: fact.replace("hr-001", "real-001") });
    const saved = readSyntheticTabState(store, "owner", snapshot);
    expect(saved?.answer).toBe(""); expect(saved?.draft).toBe("");
  });
  test("malformed and blocked storage fail closed", () => {
    const store = storage(); store.setItem(SYNTHETIC_TAB_CACHE_KEY, "null");
    expect(readSyntheticTabState(store, "owner", snapshot)).toBeNull();
    expect(readSyntheticTabState({ ...store, getItem: () => { throw new Error("blocked"); } }, "owner", snapshot)).toBeNull();
  });
});