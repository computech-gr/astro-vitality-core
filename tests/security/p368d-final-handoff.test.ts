import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const handoff = readFileSync("docs/P36_8D_FINAL_HANDOFF.md", "utf8");
const checklist = readFileSync("docs/P36_8D_ACCEPTANCE_EVIDENCE_CHECKLIST.md", "utf8");

describe("P36.8D final handoff contract", () => {
  it("does not confuse older green CI with exact-commit evidence", () => {
    expect(handoff).toContain("NOT VERIFIED");
    expect(handoff).toContain("actual commit SHA");
  });
  it("preserves deferred independent acceptance and replay", () => {
    expect(handoff).toContain("READY_FOR_LIVE_ACCEPTANCE");
    expect(handoff).toContain("NOT_RUN");
    expect(checklist).toContain("11. Independent reviewer sign-off");
  });
  it("preserves scientific, mission and clinical boundaries", () => {
    expect(handoff).toContain("Nikolas's two scientific documents");
    expect(handoff).toContain("MISSION_TEST");
    expect(handoff).toContain("Final Security Gate BLOCKED");
  });
});
