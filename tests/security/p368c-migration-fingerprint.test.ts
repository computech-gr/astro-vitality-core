import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

describe("P36.8C governed migration approval fingerprint", () => {
  it("keeps staged migration 0010 byte-identical to the approved candidate", () => {
    const sql = readFileSync("supabase/pending/20261021000000_p368c_research_decisions.sql");
    expect(createHash("sha256").update(sql).digest("hex")).toBe(
      "7a233de35794684da7dfc4ffd7b657c3a545bf0f96a1d6f86733853bae4f07f1",
    );
  });
});
