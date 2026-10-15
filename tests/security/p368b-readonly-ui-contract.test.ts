import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (name: string) => readFileSync(new URL(`../../${name}`, import.meta.url), "utf8");
describe("P36.8B read-only reviewer UI contract", () => {
  test("uses only existing P36.8A RPCs and does not mutate", () => {
    const infrastructure = read("src/infrastructure/p368b-ground-medical-review.ts");
    expect(infrastructure).toContain("p368_list_ground_medical_pending");
    expect(infrastructure).toContain("p368_get_ground_medical_batch");
    expect(infrastructure).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
  test("gates mission choices to Ground Medical and renders no decision controls", () => {
    const ui = read("src/components/p368b-ground-medical-review.tsx");
    expect(ui).toContain('m.role === "ground_medical"');
    // P36.8C supersedes "no decision controls": research decisions are allowed only via the governed RPC.
    expect(ui).not.toMatch(/onClick=\{[^}]*approve/i);
    expect(ui).not.toMatch(/"approved"/);
    expect(read("src/components/ground-research-console.tsx")).toContain("<GroundMedicalReviewPanel />");
  });
});
