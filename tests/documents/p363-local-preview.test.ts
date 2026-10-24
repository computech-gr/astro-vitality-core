import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const workbench = readFileSync("src/components/mission-document-review-workbench.tsx", "utf8");

describe("P36.3 synthetic local preview guardrails", () => {
  it("requires existing review and mission eligibility before preview", () => {
    expect(workbench).toContain("const previewObservations = canExport ? selected.map");
    expect(workbench).toContain("disabled={!canExport}");
    expect(workbench).toContain("onClick={() => setPreviewVisible(true)}");
    expect(workbench).toContain("{previewVisible && canExport && (");
  });
  it("clears preview on file replacement, review changes and clear", () => {
    expect((workbench.match(/setPreviewVisible\(false\)/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
  it("retains local-only status without introducing persistence", () => {
    expect(workbench).toContain("LOCAL_REVIEW_ONLY_NOT_APPROVED_FOR_IMPORT");
    expect(workbench).toContain("No cloud write.");
    expect(workbench).not.toContain("supabase.from(");
  });
});
