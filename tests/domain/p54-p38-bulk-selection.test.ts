import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bulkSelectionCounts, isDecidable, retrySelection } from "../../src/domain/health-intelligence/p38-bulk-demo-selection";
import { activationPreview, type PendingDemoProposal } from "../../src/domain/health-intelligence/p38-bulk-demo-batches";
import type { PreflightRow } from "../../src/domain/health-intelligence/p38-bulk-demo-preflight";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const row = (key: string, over: Partial<PreflightRow> = {}): PreflightRow =>
  ({ key, submissionId: "s", termId: key, labels: [key], unit: "ng/mL", category: "eligible", inScope: true, triageAction: "ACCEPT_FOR_REVIEW", reasons: [], ...over }) as PreflightRow;

describe("P54 Researcher bulk selection (reuses the P38 workflow)", () => {
  const rows = [
    row("a"),
    row("b", { triageAction: null }),
    row("c", { category: "ambiguous_unit" as PreflightRow["category"] }),
    row("d", { category: "conflicting_identity" as PreflightRow["category"] }),
    row("e", { inScope: false }),
    row("f"),
    row("g", { category: "already_decided" as PreflightRow["category"] }),
  ];
  const scope = new Map([["f", { submittedByCaller: true }]]);

  it("Select All Eligible covers only eligible, in-scope terms the Researcher did not submit", () => {
    expect(rows.filter((r) => isDecidable(r, scope)).map((r) => r.key)).toEqual(["a", "b"]);
    expect(bulkSelectionCounts(rows, scope)).toEqual({ eligible: 2, awaitingTriage: 1, readyForDecision: 1, submittedByCaller: 1 });
  });

  it("retry reselects only failed items that are still eligible; there is no approve-everything path", () => {
    const results = [
      { ref: "a", termId: "a", status: "stale" as const, detail: null, eventId: null },
      { ref: "c", termId: "c", status: "rejected" as const, detail: "ambiguous", eventId: null },
      { ref: "b", termId: "b", status: "recorded" as const, detail: null, eventId: "00000000-0000-4000-8000-000000000001" },
    ];
    expect(retrySelection(results, rows, scope)).toEqual({ keys: ["a"], notRetryable: 1 });
    const src = readFileSync(join(ROOT, "src/components/p38-bulk-demo-researcher.tsx"), "utf8");
    expect(src).not.toMatch(/approveAll|bypass|activateAll/i);
    expect(src).toContain("Record Bulk SYNTHETIC DEMO Decisions");
  });

  it("Ground Medical activation stays separate: the decider can never activate their own decision", () => {
    const p: PendingDemoProposal = {
      decisionEventId: "e1", submissionId: "s", termId: "t", demoId: "demo:t", entrySha256: "x",
      entry: { displayName: "Vitamin D", aliases: [], unit: "ng/mL", domain: "bone" },
      decidedByCaller: true, activationEventId: null, revocationEventId: null,
    };
    expect(activationPreview([p], () => true)[0]!.category).toBe("decided_by_caller");
    expect(activationPreview([{ ...p, decidedByCaller: false }], () => true)[0]!.category).toBe("eligible");
    const decide = readFileSync(join(ROOT, "src/components/p38-bulk-demo-researcher.tsx"), "utf8");
    expect(decide).not.toMatch(/activateCatalogEntry|bulkDemoActivate/);
  });

  it("the Global Scientific Review table links to the existing bulk section", () => {
    const panel = readFileSync(join(ROOT, "src/components/p36-global-review-panel.tsx"), "utf8");
    expect(panel).toContain("openBulkDemoDecisions(selectedMission.missionId)");
    expect(readFileSync(join(ROOT, "src/components/p38-bulk-demo-researcher.tsx"), "utf8")).toContain('id="p38-bulk-researcher"');
  });
});
