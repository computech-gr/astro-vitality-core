import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchesWorkflowFilter,
  reconcileSelection,
  researcherWorkflowStatus,
  selectOnlyFiltered,
  workflowCounts,
} from "@/domain/health-intelligence/p7210-researcher-workflow-status";

const row = (key: string, category = "blocked", triageAction: string | null = "ACCEPT_FOR_REVIEW") => ({
  key,
  category,
  triageAction,
});
// ubr-6a205852 shape: 7 submitted terms, Chloride · mmol/L already activated.
const request = [
  row("s:chloride", "already_active"),
  ...["a", "b", "c", "d", "e", "f"].map((k) => row(`s:${k}`)),
];

describe("P72.10 Researcher workflow status", () => {
  it("request with 7 terms and Chloride activated shows 6 pending and 1 completed", () => {
    expect(workflowCounts(request)).toEqual({ all: 7, pending: 6, awaiting_medical: 0, activated: 1, rejected: 0 });
  });

  it("default pending view excludes the activated Chloride; Already activated and All keep it", () => {
    const status = researcherWorkflowStatus(request[0]!);
    expect(matchesWorkflowFilter(status, "pending")).toBe(false);
    expect(matchesWorkflowFilter(status, "activated")).toBe(true);
    expect(matchesWorkflowFilter(status, "all")).toBe(true);
  });

  it("approved terms awaiting Medical activation are not pending Researcher decisions", () => {
    expect(researcherWorkflowStatus(row("x", "already_decided"))).toBe("awaiting_medical");
    expect(researcherWorkflowStatus(row("x", "eligible"), { researcher: new Map([["x", "APPROVE"]]) })).toBe("awaiting_medical");
  });

  it("rejections, Medical declines, rejected review requests and revocations count as rejected", () => {
    expect(researcherWorkflowStatus(row("x", "eligible"), { researcher: new Map([["x", "REJECT"]]) })).toBe("rejected");
    expect(researcherWorkflowStatus(row("x", "already_decided"), { medical: new Map([["x", "DECLINE"]]) })).toBe("rejected");
    expect(researcherWorkflowStatus(row("x", "eligible", "REJECT_REVIEW_REQUEST"))).toBe("rejected");
    expect(researcherWorkflowStatus(row("x", "blocked"), { revoked: new Set(["x"]) })).toBe("rejected");
  });

  it("undecided eligible or blocked terms stay pending", () => {
    expect(researcherWorkflowStatus(row("x", "eligible"))).toBe("pending");
    expect(researcherWorkflowStatus(row("x", "ambiguous_unit", null))).toBe("pending");
  });

  it("Select All Filtered selects only the current filter, dropping earlier hidden selections", () => {
    expect([...selectOnlyFiltered(["s:a", "s:b"])]).toEqual(["s:a", "s:b"]);
  });

  it("switching request/status drops stale selections and never adds any", () => {
    const r = reconcileSelection(new Set(["s:a", "s:chloride", "t:z"]), ["s:a", "s:b"]);
    expect([...r.selected]).toEqual(["s:a"]);
    expect(r.dropped).toBe(2);
    const same = new Set(["s:a"]);
    expect(reconcileSelection(same, ["s:a"]).selected).toBe(same);
  });

  it("table defaults to pending and the shared dialog gates hidden selections on explicit confirmation", () => {
    const ui = readFileSync(join(import.meta.dir, "../../src/components/p38-bulk-demo-researcher.tsx"), "utf8");
    expect(ui).toContain('useState<ResearcherWorkflowFilter>("pending")');
    expect(ui).toContain("setSelected(selectOnlyFiltered(filteredIds))");
    const dlg = readFileSync(join(import.meta.dir, "../../src/components/p55-bulk-controls.tsx"), "utf8");
    expect(dlg).toContain("confirmDisabled || hiddenBlocked || !p.actionable.length");
  });
});
