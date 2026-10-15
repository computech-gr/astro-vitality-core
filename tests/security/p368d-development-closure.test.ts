import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const handoff = readFileSync("docs/P36_8D_DEVELOPMENT_CLOSURE_HANDOFF.md", "utf8");
const checklist = readFileSync("docs/P36_8D_ACCEPTANCE_EVIDENCE_CHECKLIST.md", "utf8");

describe("P36.8D development closure guardrails", () => {
  test("live acceptance remains explicitly pending", () => {
    expect(handoff).toContain("READY_FOR_LIVE_ACCEPTANCE");
    expect(handoff).toContain("NOT ACCEPTED");
    expect(checklist).toContain("Live acceptance");
  });
  test("no live original-batch decision or unauthorized publication", () => {
    expect(handoff).toContain("Do **not** publish");
    expect(handoff).toContain("new** synthetic batch");
    expect(handoff).toContain("MISSION_TEST");
  });
  test("idempotency, scientific dependency and standing gates are retained", () => {
    for (const phrase of ["same-idempotency-key", "Nikolas", "FV-01.13 OPEN", "P32/P34 PENDING", "Final Security Gate BLOCKED", "OWNER_MANAGED_BACKUP_RISK_ACCEPTED"]) expect(handoff).toContain(phrase);
  });
});
