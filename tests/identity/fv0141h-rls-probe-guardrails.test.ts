import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../src/components/mission-rls-count-probe.tsx", import.meta.url), "utf8");

describe("FV-01.4.1H temporary RLS probe publication guardrails", () => {
  it("remains click-only and count-only", () => {
    expect(source).toContain('onClick={() => void run()}');
    expect(source).toContain('count: "exact", head: true');
    expect(source).toContain('supabase.auth.getUser()');
  });
  it("does not render raw backend error messages", () => {
    expect(source).not.toContain('readError.message');
    expect(source).toContain('details intentionally hidden');
  });
  it("flags nonzero counts and marks the probe as temporary", () => {
    expect(source).toContain('result.count > 0');
    expect(source).toContain('STOP: A nonzero count');
    expect(source).toContain('REMOVE AFTER ACCEPTANCE');
  });
});
