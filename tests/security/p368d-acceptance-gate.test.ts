import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const doc = readFileSync("docs/P36_8D_INDEPENDENT_ACCEPTANCE_GATE.md", "utf8");
const sql = readFileSync("drizzle/migrations/0010_p368c_research_decisions.sql");

describe("P36.8D independent acceptance preparation", () => {
  test("deployed migration 0010 matches approved SQL", () => {
    expect(createHash("sha256").update(sql).digest("hex")).toBe("7a233de35794684da7dfc4ffd7b657c3a545bf0f96a1d6f86733853bae4f07f1");
  });
  test("live acceptance is not falsely claimed", () => {
    expect(doc).toContain("READY_FOR_LIVE_ACCEPTANCE");
    expect(doc).toContain("NOT passed");
    expect(doc).toContain("do not decide the original batch");
  });
  test("governance and mission isolation are preserved", () => {
    for (const phrase of ["FV01-TEST-B", "MISSION_TEST", "OWNER_MANAGED_BACKUP_RISK_ACCEPTED", "FV-01.13 OPEN", "Final Security Gate BLOCKED", "clinical features", "independent reviewer"]) expect(doc).toContain(phrase);
  });
});
