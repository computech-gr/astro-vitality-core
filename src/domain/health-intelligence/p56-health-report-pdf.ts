/**
 * P56 — concise health assessment PDF (searchable text, shared layout engine).
 *
 * Built only from the HealthAssessment read model, so screen, TXT and PDF
 * state the same findings. The detailed evidence report remains a separate,
 * optional technical appendix (createTextReportPdf).
 */
import { COMPARABILITY_NOTE, type HealthAssessment } from "./p56-health-assessment";
import type { Severity } from "./biomarker-health-assessment";
import { RECOMMENDATION_CATEGORY_LABELS } from "./p56-pattern-library";
import { openTextPdf, renderDocumentToPdf, type Block, type PdfDeps, type ReportDocument, type TextPdfResult } from "./report-text-pdf";

/** Colour and marker only for results classified against verified criteria; unclassified text stays plain. */
const mark = (marker: string, severity: Severity, text: string) => (severity === "neutral" ? text : `${marker} ${text}`);
/** Subscript digits are missing from the embedded font; print them as plain digits. */
const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
const plainDigits = (t: string) => t.replace(/[₀-₉]/g, (c) => SUB[c] ?? c);

export function buildHealthAssessmentDocument(a: HealthAssessment): ReportDocument {
  const doc = buildDocument(a);
  const fix = (b: Block): Block => {
    if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3" || b.kind === "p") return { ...b, text: plainDigits(b.text) };
    if (b.kind === "bullets") return { ...b, items: b.items.map(plainDigits) };
    if (b.kind === "kv") return { ...b, rows: b.rows.map(([k, v]) => [plainDigits(k), plainDigits(v)] as [string, string]) };
    if (b.kind === "chart") return { ...b, title: plainDigits(b.title), unit: plainDigits(b.unit), caption: plainDigits(b.caption) };
    return b;
  };
  return { ...doc, blocks: doc.blocks.map(fix) };
}

function buildDocument(a: HealthAssessment): ReportDocument {
  const h = a.header;
  const blocks: Block[] = [
    { kind: "h1", text: "Health Assessment" },
    {
      kind: "kv",
      rows: [
        ["Astronaut", h.astronaut],
        ["Mission", h.mission],
        ["Reporting period", h.period],
        ["Examinations", h.examinationDates.length ? h.examinationDates.join(", ") : "none in this period"],
        ["Data", h.provenanceLabel],
      ],
    },
    { kind: "h2", text: "Overall health status" },
    ...a.overview.map((text): Block => ({ kind: "p", text })),
    { kind: "h3", text: "Most important findings" },
    a.keyFindings.length
      ? { kind: "bullets", items: a.keyFindings.map((k) => mark(k.marker, k.severity, k.text)), tones: a.keyFindings.map((k) => k.severity) }
      : { kind: "p", text: "No findings: no reviewed results in this period." },
    { kind: "h3", text: "Validated health warnings" },
    { kind: "p", text: a.warningsStatement },
    ...(a.warnings.length ? [{ kind: "bullets", items: a.warnings.map((w) => mark(w.marker, w.severity, w.text)), tones: a.warnings.map((w) => w.severity) } as Block] : []),
    { kind: "kv", rows: [["Follow-up priority", `${a.followUp.label} — ${a.followUp.text}`]] },
    { kind: "p", text: a.completeness, muted: true, size: 9 },
    { kind: "pagebreak" },
    { kind: "h1", text: "Key biological findings" },
    { kind: "p", text: `Related results are explained together. Colour and markers are used only for results classified against verified reference criteria. ${COMPARABILITY_NOTE}`, muted: true, size: 8.5 },
  ];
  for (const f of a.findings) {
    blocks.push(
      { kind: "h3", text: mark(f.marker, f.severity, `${f.title}${f.exploratory ? " — exploratory (synthetic demonstration catalog)" : ""}`), tone: f.severity },
      { kind: "p", text: `What changed: ${f.whatChanged}`, size: 9 },
      { kind: "p", text: `How they relate: ${f.relationship} ${f.spaceflightContext}`, size: 8.5, muted: true },
      { kind: "p", text: `Interpretation: ${f.interpretation}`, size: 9 },
      ...(f.uncertainty.some((u) => u !== COMPARABILITY_NOTE)
        ? [{ kind: "p", text: `Uncertainty: ${f.uncertainty.filter((u) => u !== COMPARABILITY_NOTE).join(" ")}`, size: 8.5, muted: true } as Block]
        : []),
    );
  }
  if (a.otherResults.statement) blocks.push({ kind: "p", text: a.otherResults.statement, muted: true, size: 9 });
  blocks.push(
    { kind: "pagebreak" },
    { kind: "h1", text: "Health assessment and recommendations" },
    {
      kind: "kv",
      rows: [
        ["Observed abnormal measurements (validated)", a.assessment.abnormal.length ? a.assessment.abnormal.join("\n") : "None — no result met verified reference criteria."],
        ["Longitudinal changes", a.assessment.changes.length ? a.assessment.changes.join("\n") : "None measurable in this period."],
        ["Possible condition-related patterns", a.assessment.possiblePatterns.length ? a.assessment.possiblePatterns.join("\n") : "None could be assessed: each requires verified criteria or clinician-confirmed evidence."],
        ["Requires further evaluation", a.assessment.furtherEvaluation.join("\n")],
        ["Confirmed diagnoses", a.assessment.confirmedDiagnoses],
      ],
    },
    { kind: "h2", text: "Recommendations" },
  );
  if (!a.recommendations.length) blocks.push({ kind: "p", text: "No recommendations: no reviewed results in this period." });
  for (const r of a.recommendations)
    blocks.push({
      kind: "p",
      size: 9.5,
      text: `${RECOMMENDATION_CATEGORY_LABELS[r.category]} (${r.authorizationLabel}): ${r.text} Based on: ${r.basis.join("; ")}.`,
    });
  blocks.push({ kind: "h2", text: "Longitudinal trends" }, { kind: "p", text: a.trendNote, muted: true, size: 9 });
  for (const t of a.trends)
    blocks.push({ kind: "chart", title: `${t.name} — ${t.findingTitle}`, unit: t.unit, points: t.points.map((p) => ({ label: p.label, value: p.value })), caption: t.trend.text });
  blocks.push({ kind: "p", text: a.disclosure, muted: true, size: 9 });
  return {
    title: `Health Assessment — ${h.astronaut}`,
    headerLeft: "MITOCHONDRIA · Health Assessment",
    headerRight: h.provenanceLabel,
    footerLeft: `${h.astronaut} · ${h.mission} · ${h.period} · ${a.disclosure}`,
    blocks,
  };
}

export async function createHealthAssessmentPdf(a: HealthAssessment, deps?: PdfDeps): Promise<TextPdfResult> {
  const { pdf, fonts } = await openTextPdf(deps);
  return renderDocumentToPdf(pdf, fonts, buildHealthAssessmentDocument(a), {
    title: `Health Assessment — ${a.header.astronaut}`,
    subject: "Automated health assessment (searchable text) — subject to Ground Medical review",
    keywords: "health assessment, subject to Ground Medical review, not a diagnosis",
  });
}
