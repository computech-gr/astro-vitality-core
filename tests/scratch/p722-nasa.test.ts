import { it } from "bun:test";
import { extractPdfGeometry, repoPath } from "../documents/p42-pdf-helpers";
import { extractFiveColumnLabCandidates, extractTextTableCandidates } from "@/domain/health-intelligence/universal-intake-parser";
import { classifyWithGovernedExtensions } from "@/domain/health-intelligence/unknown-biomarker-review";
import { intakeRowExclusionReason } from "@/domain/health-intelligence/intake-review-selection";
it("t", async () => {
  const g = await extractPdfGeometry(repoPath("tests/fixtures/p39/NASA_Astronaut_Simulated_Medical_Report.pdf"));
  const c = [...extractTextTableCandidates(g.text, 500), ...extractFiveColumnLabCandidates(g.text, 500)];
  console.log("cands", c.length, JSON.stringify(c[0]));
  const rows = c.map((x: any, i) => { const b: any = { ...x, provenance: "synthetic", missionId: "mission-3fd366c331ed46afb0645cced1d45294", key: "k"+i, selected: false }; b.classification = classifyWithGovernedExtensions(b).classification; return b; });
  const m = rows.filter((r: any) => r.classification.status === "matched");
  for (const r of m) console.log(r.classification.metricId, r.label, r.value, r.unit, r.observedAt, r.sourceValidation, "=>", intakeRowExclusionReason(r));
});
