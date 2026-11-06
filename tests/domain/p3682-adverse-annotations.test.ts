import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsPDF } from "jspdf";
import { buildReportDocument, renderReportDocument, type PdfWriter, type TextReportInput } from "../../src/domain/health-intelligence/report-text-pdf";
import { NOT_ASSESSED_TEXT, resolveAdverseAnnotations, type AdverseAnnotation, type AdverseRule } from "../../src/domain/health-intelligence/adverse-annotations";
import { buildUnifiedHealthReport } from "../../src/domain/health-intelligence/unified-health-report";
import { buildScientificFindings } from "../../src/domain/health-intelligence/scientific-findings";
import { buildScientificHealthSummary } from "../../src/domain/health-intelligence/scientific-health-summary";
import { buildHealthHistoryReport } from "../../src/domain/health-intelligence/health-history-report";
import { summarizeAttestations } from "../../src/domain/health-intelligence/evidence-attestation";
import type { UnifiedObservation } from "../../src/domain/health-intelligence/observation-envelope";
import { V9_SCOPE, obs } from "./fixtures-v9-observations";

const history: UnifiedObservation[] = [
  obs({ id: "rec-a", metricId: "cv-001", originalUnit: "bpm", value: "61", observedAt: "2026-01-01T07:00:00.000Z" }),
  obs({ id: "rec-b", metricId: "cv-001", originalUnit: "bpm", value: "88", observedAt: "2026-01-05T07:00:00.000Z" }),
  obs({ id: "rec-pending", metricId: "cv-001", originalUnit: "bpm", value: "99", observedAt: "2026-01-06T07:00:00.000Z", reviewState: "pending" } as Partial<UnifiedObservation>),
];

function base(): TextReportInput {
  const unified = buildUnifiedHealthReport({ domainEntries: {}, unifiedObservations: history, deviceRecords: [] }, V9_SCOPE, {}, "2026-11-01T12:00:00.000Z");
  const findings = buildScientificFindings(unified);
  const hist = buildHealthHistoryReport(history, V9_SCOPE.missionId, V9_SCOPE.crewMemberId, "synthetic");
  return { unified, findings, summary: buildScientificHealthSummary(unified, findings, hist, summarizeAttestations(unified, [])), history: hist, attestations: [], identity: { missionName: "M", crewDisplayName: "C" }, title: "t" };
}

const rule: AdverseRule = { ruleId: "R-HR-1", version: "1.0.0", status: "APPROVED", metricId: "cv-001", unit: "bpm", approvedBy: "Independent Reviewer", approvalRef: "APPROVAL-42", approvedAt: "2026-10-01T00:00:00Z", missionPhases: ["in-flight"] };
const ann = (over: Partial<AdverseAnnotation> = {}): AdverseAnnotation => ({ recordId: "rec-b", ruleId: "R-HR-1", ruleVersion: "1.0.0", missionPhase: "in-flight", baselineRef: "baseline-1", provenanceRef: "prov-1", contextRef: "ctx-1", qualityAccepted: true, ...over });

const text = (input: TextReportInput) => JSON.stringify(buildReportDocument(input).blocks);
const tables = (input: TextReportInput) => buildReportDocument(input).blocks.filter((b) => b.kind === "table");

describe("P36.8.2 governed adverse annotations", () => {
  test("adverse: approved rule marks only the annotated row, with a text marker in the main metric table and Appendix A", () => {
    const input = { ...base(), adverseAssessment: { rules: [rule], annotations: [ann()] } };
    const doc = buildReportDocument(input);
    const marked = doc.blocks.filter((b) => b.kind === "table" && b.adverseRows?.length);
    expect(marked.length).toBe(2);
    expect(text(input)).toContain("ADVERSE per approved rule R-HR-1 v1.0.0 (APPROVAL-42)");
    const metricTable = marked[0]!;
    if (metricTable.kind !== "table") throw new Error();
    expect(metricTable.rows[metricTable.adverseRows![0]!]!.join(" ")).toContain("ADVERSE per approved rule");
  });

  test("neutral: no assessment input leaves every row uncoloured and states Not assessed", () => {
    const input = base();
    expect(tables(input).every((t) => t.kind === "table" && !t.adverseRows?.length)).toBe(true);
    expect(text(input)).toContain(NOT_ASSESSED_TEXT);
    expect(text(input)).not.toContain("ADVERSE per");
  });

  test("unknown rule, pending-approval rule and missing approval are rejected", () => {
    const rows = base().unified.rows;
    expect(resolveAdverseAnnotations(rows, "synthetic", { rules: [], annotations: [ann()] }).rejected[0]!.reason).toBe("unknown_rule");
    expect(resolveAdverseAnnotations(rows, "synthetic", { rules: [{ ...rule, status: "PENDING_REVIEW" }], annotations: [ann()] }).rejected[0]!.reason).toBe("rule_not_approved");
    expect(resolveAdverseAnnotations(rows, "synthetic", { rules: [{ ...rule, approvedBy: "" }], annotations: [ann()] }).rejected[0]!.reason).toBe("missing_approval");
    expect(resolveAdverseAnnotations(rows, "synthetic", { rules: [rule], annotations: [ann({ ruleVersion: "2.0.0" })] }).rejected[0]!.reason).toBe("version_mismatch");
  });

  test("wrong unit or metric is rejected without conversion", () => {
    const rows = base().unified.rows;
    expect(resolveAdverseAnnotations(rows, "synthetic", { rules: [{ ...rule, unit: "beats/min" }], annotations: [ann()] }).rejected[0]!.reason).toBe("unit_mismatch");
    expect(resolveAdverseAnnotations(rows, "synthetic", { rules: [{ ...rule, metricId: "cv-027" }], annotations: [ann()] }).rejected[0]!.reason).toBe("metric_mismatch");
  });

  test("missing data, pending-review or excluded records are never coloured", () => {
    const input = { ...base(), adverseAssessment: { rules: [rule], annotations: [ann({ recordId: "rec-pending" }), ann({ recordId: "does-not-exist" })] } };
    const r = resolveAdverseAnnotations(input.unified.rows, "synthetic", input.adverseAssessment);
    expect(r.accepted.size).toBe(0);
    expect(r.rejected.map((x) => x.reason)).toEqual(["record_not_included", "record_not_included"]);
    expect(tables(input).every((t) => t.kind === "table" && !t.adverseRows?.length)).toBe(true);
  });

  test("missing baseline, provenance, context, quality or phase is rejected", () => {
    const rows = base().unified.rows;
    const reason = (a: AdverseAnnotation) => resolveAdverseAnnotations(rows, "synthetic", { rules: [rule], annotations: [a] }).rejected[0]!.reason;
    expect(reason(ann({ baselineRef: "" }))).toBe("missing_baseline");
    expect(reason(ann({ provenanceRef: " " }))).toBe("missing_provenance");
    expect(reason(ann({ contextRef: "" }))).toBe("missing_context");
    expect(reason(ann({ qualityAccepted: false }))).toBe("quality_not_accepted");
    expect(reason(ann({ missionPhase: "post-flight" }))).toBe("phase_not_applicable");
  });

  test("demonstration annotations need explicit allowance and synthetic provenance, and say they are not approved", () => {
    const demo = { ...rule, status: "DEMONSTRATION_ONLY" as const, approvedBy: "", approvalRef: "", approvedAt: "" };
    const rows = base().unified.rows;
    expect(resolveAdverseAnnotations(rows, "synthetic", { rules: [demo], annotations: [ann()] }).rejected[0]!.reason).toBe("demonstration_not_allowed");
    expect(resolveAdverseAnnotations(rows, "real", { rules: [demo], annotations: [ann()], allowDemonstration: true }).rejected[0]!.reason).toBe("demonstration_not_allowed");
    const ok = resolveAdverseAnnotations(rows, "synthetic", { rules: [demo], annotations: [ann()], allowDemonstration: true });
    expect(ok.accepted.get("rec-b")!.marker).toContain("not an approved medical decision");
  });

  test("PDF rendering: marker text is extractable and the annotated row is drawn dark red, others neutral", () => {
    const fontDir = join(import.meta.dir, "../../node_modules/pdfjs-dist/standard_fonts");
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: false });
    pdf.addFileToVFS("R.ttf", readFileSync(join(fontDir, "LiberationSans-Regular.ttf")).toString("base64"));
    pdf.addFont("R.ttf", "LiberationSans", "normal");
    pdf.addFileToVFS("B.ttf", readFileSync(join(fontDir, "LiberationSans-Bold.ttf")).toString("base64"));
    pdf.addFont("B.ttf", "LiberationSans", "bold");
    const w = pdf as unknown as PdfWriter;
    const drawn: { text: string; red: boolean }[] = [];
    let red = false;
    const setColor = w.setTextColor.bind(w);
    w.setTextColor = ((r: number, g: number, b: number) => { red = r === 180 && g === 30 && b === 40; return setColor(r, g, b); }) as PdfWriter["setTextColor"];
    const orig = w.text.bind(w);
    w.text = (t: string, x: number, y: number, o?: Record<string, unknown>) => { drawn.push({ text: t, red }); return orig(t, x, y, o); };
    renderReportDocument(buildReportDocument({ ...base(), adverseAssessment: { rules: [rule], annotations: [ann()] } }), w, { family: "LiberationSans", unicode: true });
    expect(drawn.some((d) => d.red && d.text.includes("ADVERSE"))).toBe(true);
    expect(drawn.filter((d) => d.red).every((d) => !d.text.includes("rec-a"))).toBe(true);
    expect(drawn.some((d) => !d.red && d.text.includes(NOT_ASSESSED_TEXT.split(" ")[0]!))).toBe(true);
    const raw = pdf.output();
    expect(raw).toContain("0.706 0.118 0.157 rg");
  });
});
