/**
 * P56 / P56.1 — concise health assessment PDF (searchable text, shared layout engine).
 *
 * Built only from the HealthAssessment read model, so screen, TXT and PDF
 * state the same findings. Target: 2–4 A4 pages (1 Executive assessment,
 * 2 Key biological findings, 3 Recommendations, 4 Longitudinal trends).
 * The builder compacts presentation in fixed steps (page breaks → optional
 * relationship text → number of charts) and never drops a validated alert,
 * review flag, data-quality check, recommendation or the methodology note; if
 * four pages are still exceeded the exception is stated in the report.
 * The detailed evidence report remains the separate technical appendix.
 */
import {
  DATA_CHECK_MARKER,
  REVIEW_FLAG_LABEL,
  REVIEW_MARKER,
  type Finding,
  type HealthAssessment,
} from "./p56-health-assessment";
import type { Severity } from "./biomarker-health-assessment";
import { RECOMMENDATION_CATEGORY_LABELS } from "./p56-pattern-library";
import { openTextPdf, renderDocumentToPdf, type Block, type PdfDeps, type ReportDocument, type TextPdfResult, type TextTone } from "./report-text-pdf";

export const MAX_ASSESSMENT_PAGES = 4;
export const COMPACTION_LEVELS = 4;
export const PAGE_EXCEPTION_NOTE =
  "Page-limit exception: the safety-relevant content of this period does not fit on four pages, so the report continues. No validated alert, review flag or recommendation has been removed.";

/** Colour and marker only for results classified against verified criteria; unclassified text stays plain. */
const mark = (marker: string, severity: Severity, text: string) => (severity === "neutral" ? text : `${marker} ${text}`);
const findingTone = (f: Finding): TextTone | undefined => (f.severity !== "neutral" ? f.severity : f.reviewPriority !== "none" ? "review" : undefined);
const reviewTag = (f: Finding) => (f.reviewPriority === "priority_review" ? ` ${REVIEW_MARKER}` : f.reviewPriority === "data_quality_review" ? ` ${DATA_CHECK_MARKER}` : "");
/** Subscript digits are missing from the embedded font; print them as plain digits. */
const SUB: Record<string, string> = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
const plainDigits = (t: string) => t.replace(/[₀-₉]/g, (c) => SUB[c] ?? c);

export function buildHealthAssessmentDocument(a: HealthAssessment, level = 0, pageException = false): ReportDocument {
  const doc = buildDocument(a, level, pageException);
  const fix = (b: Block): Block => {
    if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3" || b.kind === "p") return { ...b, text: plainDigits(b.text) };
    if (b.kind === "bullets") return { ...b, items: b.items.map(plainDigits) };
    if (b.kind === "kv") return { ...b, rows: b.rows.map(([k, v]) => [plainDigits(k), plainDigits(v)] as [string, string]) };
    if (b.kind === "chart") return { ...b, title: plainDigits(b.title), unit: plainDigits(b.unit), caption: plainDigits(b.caption) };
    return b;
  };
  return { ...doc, blocks: doc.blocks.map(fix) };
}

function buildDocument(a: HealthAssessment, level: number, pageException: boolean): ReportDocument {
  const h = a.header;
  const pr = a.priorities;
  const breaks = level === 0;
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
    ...(pageException ? [{ kind: "p", text: PAGE_EXCEPTION_NOTE, bold: true, size: 8.5 } as Block] : []),
    { kind: "h2", text: "Overall assessment" },
    ...a.overview.map((text): Block => ({ kind: "p", text, size: 9.5 })),
    { kind: "h3", text: "Most important findings" },
    a.keyFindings.length
      ? {
          kind: "bullets",
          size: 9.5,
          items: a.keyFindings.map((k) => mark(k.marker, k.severity, k.text)),
          tones: a.keyFindings.map((k) => (k.severity !== "neutral" ? k.severity : k.review !== "none" ? "review" : null)),
        }
      : { kind: "p", text: "No findings: no reviewed results in this period." },
    { kind: "h3", text: "Validated clinical alerts" },
    { kind: "p", text: a.warningsStatement, size: 9.5 },
    ...(a.warnings.length ? [{ kind: "bullets", size: 9.5, items: a.warnings.map((w) => mark(w.marker, w.severity, w.text)), tones: a.warnings.map((w) => w.severity) } as Block] : []),
    { kind: "h3", text: `Priority review items — ${REVIEW_FLAG_LABEL.toLowerCase()} (not a diagnosis)` },
  ];
  if (pr.reviewRequired.length)
    blocks.push({ kind: "bullets", size: 9, items: pr.reviewRequired.map((i) => `${REVIEW_MARKER} ${i.text}`), tones: pr.reviewRequired.map(() => "review") });
  if (pr.dataQuality.length)
    blocks.push({ kind: "bullets", size: 9, items: pr.dataQuality.map((i) => `${DATA_CHECK_MARKER} ${i.text}`), tones: pr.dataQuality.map(() => "review") });
  if (!pr.reviewRequired.length && !pr.dataQuality.length) blocks.push({ kind: "p", text: "No change meets the review rules in this period.", size: 9 });
  blocks.push(
    {
      kind: "kv",
      rows: [
        ["Clinical severity", a.followUp.clinicalSeverity],
        ["Follow-up priority", `${a.followUp.label} — ${a.followUp.text}`],
        ...(pr.exploratory.length ? [["Exploratory", `${pr.exploratory.length} finding group(s) include synthetic demonstration catalog entries (not scientifically validated).`] as [string, string]] : []),
        ["Routine", pr.routine.text],
      ],
    },
    { kind: "p", text: a.completeness, muted: true, size: 8.5 },
    { kind: "p", text: a.methodology, muted: true, size: 8 },
    ...(breaks ? [{ kind: "pagebreak" } as Block] : []),
    { kind: "h1", text: "Key biological findings" },
  );

  const detailed = a.findings.filter((f) => f.state === "validated_concern" || f.state === "changed" || f.reviewPriority !== "none");
  const brief = a.findings.filter((f) => !detailed.includes(f));
  for (const f of detailed) {
    blocks.push(
      { kind: "h3", text: mark(f.marker, f.severity, `${f.title}${reviewTag(f)}${f.exploratory ? " — exploratory" : ""}`), ...(findingTone(f) ? { tone: findingTone(f)! } : {}) },
      { kind: "p", text: `What changed: ${f.whatChanged}`, size: 8.5, ...(f.severity !== "neutral" ? { tone: f.severity } : {}) },
      ...(f.combined ? [{ kind: "p", text: `Together: ${f.combined}`, size: 8.5 } as Block] : []),
      ...(level <= 1 && f.reviewPriority !== "none" ? [{ kind: "p", text: `How they relate: ${f.relationship}`, size: 8, muted: true } as Block] : []),
      { kind: "p", text: `Interpretation: ${f.interpretation}`, size: 8.5, ...(f.severity !== "neutral" ? { tone: f.severity } : {}) },
      ...(f.uncertainty.length && level <= 2 ? [{ kind: "p", text: `Uncertainty: ${f.uncertainty.join(" ")}`, size: 8, muted: true } as Block] : []),
    );
  }
  if (brief.length) {
    blocks.push(
      { kind: "h3", text: detailed.length ? "Other measured areas (single examination or no recorded change)" : "Measured areas (single examination or no recorded change)" },
      {
        kind: "bullets",
        size: 8.5,
        items: brief.map((f) => `${mark(f.marker, f.severity, f.headline)} ${f.whatChanged}${f.missingDetail.length ? ` Not available: ${f.missingDetail.map((m) => m.text).join("; ")}.` : ""}`),
        tones: brief.map((f) => (f.severity !== "neutral" ? f.severity : null)),
      },
    );
  }
  if (a.otherResults.statement) blocks.push({ kind: "p", text: a.otherResults.statement, muted: true, size: 8.5 });

  blocks.push(...(breaks ? [{ kind: "pagebreak" } as Block] : []), { kind: "h1", text: "Recommendations" });
  if (!a.recommendations.length) blocks.push({ kind: "p", text: "No recommendations: no reviewed results in this period." });
  else
    blocks.push({
      kind: "bullets",
      size: 9,
      items: a.recommendations.map((r) => `${r.id} · ${RECOMMENDATION_CATEGORY_LABELS[r.category]} (${r.authorizationLabel}): ${r.text} Based on: ${r.basis.join("; ")}.`),
      tones: a.recommendations.map((r) => (r.priority ? "review" : null)),
    });
  blocks.push({
    kind: "kv",
    rows: [
      ["Observed abnormal (validated)", a.assessment.abnormal.length ? a.assessment.abnormal.join("\n") : "None — no result met verified reference criteria."],
      ["Possible condition patterns", a.assessment.possiblePatterns.length ? a.assessment.possiblePatterns.join("\n") : "None could be assessed: each requires verified criteria or clinician-confirmed evidence."],
      ["Confirmed diagnoses", a.assessment.confirmedDiagnoses],
    ],
  });

  const maxCharts = level >= 3 ? 2 : a.trends.length;
  if (a.trends.length) {
    blocks.push(...(breaks || level === 1 ? [{ kind: "pagebreak" } as Block] : []), { kind: "h1", text: "Longitudinal trends" }, { kind: "p", text: a.trendNote, muted: true, size: 8.5 });
    for (const t of a.trends.slice(0, maxCharts))
      blocks.push({ kind: "chart", title: `${t.flagged === "priority_review" ? `${REVIEW_MARKER} ` : t.flagged === "data_quality_review" ? `${DATA_CHECK_MARKER} ` : ""}${t.name} — ${t.findingTitle}`, unit: t.unit, points: t.points.map((p) => ({ label: p.label, value: p.value })), caption: t.trend.text });
    if (maxCharts < a.trends.length)
      blocks.push({ kind: "p", size: 8, muted: true, text: `Further charted series are described in the findings: ${a.trends.slice(maxCharts).map((t) => `${t.name} (${t.trend.text})`).join("; ")}` });
  } else {
    blocks.push({ kind: "p", text: a.trendNote, muted: true, size: 8.5 });
  }
  blocks.push({ kind: "p", text: a.disclosure, muted: true, size: 8.5 });
  return {
    title: `Health Assessment — ${h.astronaut}`,
    headerLeft: "MITOCHONDRIA · Health Assessment",
    headerRight: h.provenanceLabel,
    footerLeft: `${h.astronaut} · ${h.mission} · ${h.period} · ${a.disclosure}`,
    blocks,
  };
}

export async function createHealthAssessmentPdf(a: HealthAssessment, deps?: PdfDeps): Promise<TextPdfResult & { compaction: number; pageException: boolean }> {
  const meta = {
    title: `Health Assessment — ${a.header.astronaut}`,
    subject: "Automated health assessment (searchable text) — subject to Ground Medical review",
    keywords: "health assessment, subject to Ground Medical review, not a diagnosis",
  };
  const first = await openTextPdf(deps);
  const again = async () => (await openTextPdf({ ...(deps?.jsPDF ? { jsPDF: deps.jsPDF } : {}), fonts: first.fonts })).pdf;
  let pdf = first.pdf;
  for (let level = 0; level < COMPACTION_LEVELS; level++) {
    const out = renderDocumentToPdf(pdf, first.fonts, buildHealthAssessmentDocument(a, level), meta);
    if (out.pages <= MAX_ASSESSMENT_PAGES) return { ...out, compaction: level, pageException: false };
    pdf = await again();
  }
  const out = renderDocumentToPdf(pdf, first.fonts, buildHealthAssessmentDocument(a, COMPACTION_LEVELS - 1, true), meta);
  return { ...out, compaction: COMPACTION_LEVELS - 1, pageException: true };
}
