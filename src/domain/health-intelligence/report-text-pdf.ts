/**
 * v9 searchable, text-based A4 PDF for the Unified Health Report.
 *
 * Built from the same deterministic read models as the screen and TXT export
 * (never from the DOM, never rasterized), so text is selectable/searchable,
 * page breaks are planned, table headers repeat, long cells wrap and headings
 * are never orphaned at a page end. Generated locally; nothing is uploaded.
 *
 * Only deterministic report content is included: no AI drafts, advisor text,
 * session acknowledgements or unverified suggestions.
 */
import { REPORT_DISCLAIMER, type HealthHistoryReport } from "./health-history-report";
import { REPORT_SOURCE_LABELS, type ReportRow, type UnifiedHealthReport } from "./unified-health-report";
import type { ScientificFindings } from "./scientific-findings";
import { EVIDENCE_TIER_LABELS, type ScientificHealthSummary } from "./scientific-health-summary";
import { attestationStateFor, ATTESTATION_STATUS_LABELS, summarizeAttestations, type AttestationEvent } from "./evidence-attestation";

export const CANONICAL_URL = "https://mitochondria.edocinfo.com";

// ---------------- Document model ----------------

export type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string; bold?: boolean; muted?: boolean }
  | { kind: "banner"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "kv"; rows: [string, string][] }
  | { kind: "table"; columns: { title: string; width: number }[]; rows: string[][] }
  | { kind: "link"; text: string; url: string }
  | { kind: "pagebreak" };

export interface ReportDocument {
  title: string;
  headerLeft: string;
  headerRight: string;
  footerLeft: string;
  blocks: Block[];
}

export interface TextReportInput {
  unified: UnifiedHealthReport;
  findings: ScientificFindings | null;
  summary: ScientificHealthSummary | null;
  history: HealthHistoryReport | null;
  attestations: readonly AttestationEvent[];
  identity: { missionName: string | null; crewDisplayName: string | null };
  title: string;
}

const isCorrectionHistory = (reason: string) => /^Marked erroneous|^Superseded by correction/.test(reason);

/** Compact evidence references (E001…) in the main text; full IDs only in Appendix A. */
export function evidenceRefs(rows: readonly ReportRow[]): Map<string, string> {
  const width = Math.max(3, String(rows.length).length);
  return new Map(rows.map((r, i) => [r.recordId, `E${String(i + 1).padStart(width, "0")}`]));
}

export function buildReportDocument(input: TextReportInput): ReportDocument {
  const { unified: u, findings, summary, history, identity } = input;
  const refs = evidenceRefs(u.rows);
  const ref = (ids: readonly string[]) => (ids.length ? ids.map((id) => refs.get(id) ?? id).join(", ") : "none");
  const synthetic = u.scope.provenance === "synthetic";
  const banner = synthetic ? "SYNTHETIC / RESEARCH ONLY" : "REAL DATA / RESEARCH ONLY - NOT FOR CLINICAL USE";
  const attest = summarizeAttestations(u, input.attestations);
  const first = u.rows[0]?.observedAt ?? null;
  const last = u.rows.at(-1)?.observedAt ?? null;
  const missing = u.summaries.filter((s) => s.missing).map((s) => REPORT_SOURCE_LABELS[s.badge]);
  const present = u.summaries.filter((s) => !s.missing).map((s) => `${REPORT_SOURCE_LABELS[s.badge]} ${s.included}`);
  const corrections = u.exclusions.filter((e) => isCorrectionHistory(e.reason));
  const superseded = corrections.filter((e) => e.reason.includes("Superseded by correction")).length;
  const erroneous = corrections.length - superseded;
  const mission = identity.missionName ?? u.scope.missionId;
  const crew = identity.crewDisplayName ?? "Crew identity unavailable";
  const blocks: Block[] = [];

  // 1. Executive summary (page 1)
  blocks.push(
    { kind: "banner", text: banner },
    { kind: "h1", text: "Unified Health & Device Report - Executive summary" },
    {
      kind: "kv",
      rows: [
        ["Mission", `${mission} (ID ${u.scope.missionId})`],
        ["Astronaut", `${crew} (ID ${u.scope.crewMemberId})`],
        ["Provenance", u.scope.provenance.toUpperCase()],
        ["Generated (UTC)", u.generatedAt],
        ["Reporting filter", `${u.filters.from ?? "earliest record"} to ${u.filters.to ?? "latest record"}`],
        ["Observed date range", first && last ? `${first} to ${last}` : "no included observations"],
        ["Sources selected", u.filters.sources.map((s) => REPORT_SOURCE_LABELS[s]).join(", ")],
      ],
    },
    { kind: "h3", text: "Record counts" },
    {
      kind: "kv",
      rows: [
        ["Included (active) records", String(u.coverage.included)],
        ["Pending human review", String(u.coverage.pendingReview)],
        ["Excluded records", `${u.coverage.excluded} (superseded by correction ${superseded}, marked erroneous ${erroneous}, duplicate projections ${u.coverage.duplicateProjections})`],
        ["Domains with data", present.join(", ") || "none"],
        ["Missing domains", missing.length ? `${missing.join(", ")} (absence is not a negative finding)` : "none"],
        ["Ground Medical attestation", `attested ${attest.attested} · not attested ${attest.notAttested} · revoked ${attest.revoked} · stale ${attest.stale}`],
      ],
    },
  );
  if (summary) {
    blocks.push({ kind: "h3", text: "At a glance (descriptive only)" }, { kind: "bullets", items: [...summary.frontPage.keyPoints, summary.frontPage.interpretationStatus] });
  }
  blocks.push(
    { kind: "p", text: REPORT_DISCLAIMER, bold: true },
    { kind: "p", text: "Not a diagnosis, readiness or fitness-for-duty assessment. No clinical thresholds, causal claims or scientific approval are implied. Not endorsed by NASA.", muted: true },
    { kind: "link", text: `Generated locally by MITOCHONDRIA - ${CANONICAL_URL}`, url: CANONICAL_URL },
    { kind: "pagebreak" },
  );

  // 2. Descriptive findings
  blocks.push({ kind: "h2", text: "1. Descriptive findings" });
  if (findings?.metrics.length) {
    blocks.push({
      kind: "table",
      columns: [
        { title: "Metric", width: 0.3 },
        { title: "n", width: 0.06 },
        { title: "First -> last", width: 0.22 },
        { title: "Difference", width: 0.14 },
        { title: "Evidence", width: 0.28 },
      ],
      rows: findings.metrics.map((m) => [
        m.label && m.label !== m.metricId ? `${m.label} (${m.metricId})` : m.metricId,
        String(m.count),
        m.earliestValue === null || m.latestValue === null ? "-" : `${m.earliestValue} -> ${m.latestValue} ${m.unit}`,
        m.delta === null ? "insufficient time points" : `${m.delta} ${m.unit}`,
        ref(m.evidenceIds),
      ]),
    });
    blocks.push({ kind: "p", text: "First/last differences are descriptive at the recorded precision; they are not trends, thresholds or clinical changes.", muted: true });
  } else blocks.push({ kind: "p", text: "No included observations in this scope." });
  if (findings?.crossDomain.length) {
    blocks.push(
      { kind: "h3", text: "Governed cross-domain research context (no association inferred)" },
      { kind: "bullets", items: findings.crossDomain.map((c) => `${c.domains.join(" / ")}: ${c.statement} Observed: ${c.observedSignalCounts.join("; ") || "none"}. Missing: ${c.missingSignals.join(", ") || "none"}. Evidence: ${ref(c.evidenceIds)}.`) },
    );
  }

  // 3. Limitations
  blocks.push(
    { kind: "h2", text: "2. Limitations, missing data and uncertainty" },
    { kind: "bullets", items: [...u.limitations, ...(findings?.limitations ?? []), ...(summary?.uncertainty ?? []), `Missing domains: ${findings?.missingDomains.join(", ") || missing.join(", ") || "none"}.`] },
  );

  // 4. Handbook hypotheses
  blocks.push({ kind: "h2", text: "3. Handbook hypotheses (pending independent scientific review)" });
  blocks.push({ kind: "p", text: "Statements quoted from the governed handbooks for observed directions of change. They are hypotheses for qualified review, not validated interpretations.", muted: true });
  blocks.push({
    kind: "bullets",
    items: summary?.implications.length
      ? summary.implications.map((i) => `${i.label} (${i.metricId}, ${i.direction}): ${i.statement} [${i.handbook}; ${i.reviewStatus}; evidence ${ref(i.evidenceIds)}]`)
      : ["None documented for the observed changes."],
  });
  if (summary?.implicationGaps.length) blocks.push({ kind: "bullets", items: summary.implicationGaps.map((g) => `Gap: ${g}`) });

  // 5. Reviewer decisions (intake)
  blocks.push({ kind: "h2", text: "4. Reviewer decisions (data-entry acceptance)" });
  blocks.push({ kind: "p", text: "Intake acceptance confirms that a row was transcribed and reviewed; it is not scientific or clinical approval and not a Ground Medical attestation.", muted: true });
  if (summary) {
    blocks.push({ kind: "bullets", items: summary.evidenceTiers.map((t) => `${EVIDENCE_TIER_LABELS[t.tier]}: ${t.count}. ${t.note}`) });
    blocks.push({ kind: "bullets", items: summary.reconciliation.map((r) => `${r.domain}: ${r.reportIncluded} included (${r.storedObservations} module, ${r.reviewerAcceptedIntake} intake); Medical Intake accepted ${r.medicalIntakeAccepted}. ${r.explanation}`) });
  }

  // 6. Ground Medical attestation
  blocks.push({ kind: "h2", text: "5. Ground Medical evidence attestation (optional second stage)" });
  blocks.push({ kind: "p", text: `Attested ${attest.attested} · not attested ${attest.notAttested} · revoked ${attest.revoked} · stale (earlier record version) ${attest.stale} · ${attest.events} audit event(s). Attestation confirms an evidence record only; it never changes catalog or scientific review status and is not a legal signature.` });
  const attestedRows = u.rows
    .map((r) => ({ r, s: attestationStateFor(r, input.attestations) }))
    .filter((x) => x.s.latest);
  if (attestedRows.length) {
    blocks.push({
      kind: "table",
      columns: [
        { title: "Ref", width: 0.1 },
        { title: "Metric", width: 0.22 },
        { title: "Status", width: 0.34 },
        { title: "Latest decision (UTC)", width: 0.34 },
      ],
      rows: attestedRows.map(({ r, s }) => [refs.get(r.recordId) ?? r.recordId, r.metricId, ATTESTATION_STATUS_LABELS[s.status], `${s.latest!.decidedAt} ${s.latest!.action}`]),
    });
  }

  // 7. Chronological records (active only)
  blocks.push({ kind: "h2", text: "6. Chronological records (active versions only)" });
  if (u.rows.length) {
    blocks.push({
      kind: "table",
      columns: [
        { title: "Observed (UTC)", width: 0.22 },
        { title: "Source", width: 0.13 },
        { title: "Metric", width: 0.21 },
        { title: "Value", width: 0.1 },
        { title: "Unit", width: 0.1 },
        { title: "GM", width: 0.12 },
        { title: "Ref", width: 0.12 },
      ],
      rows: u.rows.map((r) => {
        const s = attestationStateFor(r, input.attestations).status;
        const gm = s === "attested" ? "Attested" : s === "revoked" ? "Revoked" : s === "stale_record_changed" ? "Stale" : "-";
        return [r.observedAt.replace(".000Z", "Z"), REPORT_SOURCE_LABELS[r.badge], r.metricLabel === r.metricId ? r.metricId : `${r.metricId} ${r.metricLabel}`, r.value, r.unit, gm, refs.get(r.recordId)!];
      }),
    });
  } else blocks.push({ kind: "p", text: "No included records in this scope." });

  // 8. Corrections history
  blocks.push({ kind: "h2", text: "7. Corrected, superseded and erroneous records" });
  blocks.push({ kind: "p", text: "Append-only history: originals are never rewritten or deleted. Only the latest corrected version appears in the active records and findings above.", muted: true });
  blocks.push(
    corrections.length
      ? { kind: "table", columns: [{ title: "Record ID", width: 0.42 }, { title: "Status and reason", width: 0.58 }], rows: corrections.map((e) => [e.recordId, e.reason]) }
      : { kind: "p", text: "No corrected or erroneous records in this scope." },
  );

  if (summary?.followUp.length) blocks.push({ kind: "h2", text: "8. Qualified Ground Medical follow-up considerations" }, { kind: "bullets", items: summary.followUp });

  // Appendices
  blocks.push({ kind: "pagebreak" }, { kind: "h2", text: "Appendix A. Evidence index (full identifiers)" });
  blocks.push(
    u.rows.length
      ? {
          kind: "table",
          columns: [
            { title: "Ref", width: 0.09 },
            { title: "Record ID", width: 0.3 },
            { title: "Source label", width: 0.22 },
            { title: "Evidence trace", width: 0.39 },
          ],
          rows: u.rows.map((r) => [refs.get(r.recordId)!, r.recordId, r.sourceLabel, `${r.evidence}${r.qualityNote ? ` · ${r.qualityNote}` : ""}`]),
        }
      : { kind: "p", text: "No evidence records." },
  );
  blocks.push({ kind: "h2", text: "Appendix B. Excluded and pending records" });
  blocks.push(
    u.exclusions.length
      ? { kind: "table", columns: [{ title: "Category", width: 0.16 }, { title: "Source", width: 0.14 }, { title: "Record ID", width: 0.32 }, { title: "Reason", width: 0.38 }], rows: u.exclusions.map((e) => [e.category, e.badge, e.recordId, e.reason]) }
      : { kind: "p", text: "None." },
  );
  blocks.push({ kind: "h2", text: "Appendix C. Ground Medical attestation audit history" });
  const audit = [...input.attestations].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || a.eventId.localeCompare(b.eventId));
  blocks.push(
    audit.length
      ? {
          kind: "table",
          columns: [{ title: "Decided (UTC)", width: 0.2 }, { title: "Action", width: 0.09 }, { title: "Record / event", width: 0.3 }, { title: "Reviewer and reason", width: 0.41 }],
          rows: audit.map((e) => [e.decidedAt, e.action, `${e.recordId} · ${e.eventId}${e.supersedesEventId ? ` (supersedes ${e.supersedesEventId})` : ""}`, `${e.actorUserId} (ground_medical): ${e.reason}`]),
        }
      : { kind: "p", text: "No attestation events." },
  );
  if (history) {
    blocks.push({ kind: "h2", text: "Appendix D. Medical Intake history narrative" });
    blocks.push({ kind: "bullets", items: history.findings.map((f) => `${f.domain} (${f.kind}): ${f.text}${f.observationIds.length ? ` [${ref(f.observationIds)}]` : ""}`) });
    blocks.push({ kind: "p", text: `Excluded from narrative: ${history.excluded.unreviewed} unreviewed, ${history.excluded.erroneous} erroneous, ${history.excluded.otherProvenance} other provenance.`, muted: true });
  }
  if (summary) {
    blocks.push({ kind: "h2", text: "Appendix E. Interpretation review status and boundaries" });
    blocks.push({ kind: "bullets", items: [...summary.domainInterpretation.map((d) => `${d.domain} (${d.present ? "data present" : "no included data"}): ${d.source ? `${d.source}. ` : ""}${d.status}`), ...summary.measured, ...summary.supported.map((s) => `Supported (descriptive): ${s}`), ...summary.insufficient.map((s) => `Insufficient: ${s}`), ...summary.crossDomain, ...summary.boundaries] });
  }
  if (findings?.reviewItems.length) blocks.push({ kind: "h3", text: "Human review items" }, { kind: "bullets", items: findings.reviewItems });

  return {
    title: input.title,
    headerLeft: "MITOCHONDRIA · Unified Health & Device Report",
    headerRight: banner,
    footerLeft: `${mission} / ${crew} · generated ${u.generatedAt} UTC · not a diagnosis`,
    blocks,
  };
}

// ---------------- Layout engine ----------------

export interface PdfWriter {
  addPage(): unknown;
  setPage(page: number): unknown;
  getNumberOfPages(): number;
  setFont(family: string, style: string): unknown;
  setFontSize(size: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setFillColor(r: number, g: number, b: number): unknown;
  setLineWidth(w: number): unknown;
  text(text: string, x: number, y: number, options?: Record<string, unknown>): unknown;
  textWithLink(text: string, x: number, y: number, options: { url: string }): unknown;
  rect(x: number, y: number, w: number, h: number, style?: string): unknown;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  splitTextToSize(text: string, width: number): string[];
  getTextWidth(text: string): number;
  setProperties(p: Record<string, string>): unknown;
}

export const TEXT_PDF_LAYOUT = {
  pageWidth: 210,
  pageHeight: 297,
  marginX: 16,
  top: 22,
  bottom: 279,
  body: 10,
  table: 8.5,
  maxPages: 400,
} as const;

const PT = 0.3528; // mm per point
const lineHeight = (size: number) => size * PT * 1.35;

/** Standard PDF fonts only cover WinAnsi; used only when the embedded Unicode font is unavailable. */
export function toWinAnsi(text: string): string {
  return text
    .replace(/[→⟶]/g, "->")
    .replace(/←/g, "<-")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[\t\r\n]/g, " ")
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

export interface RenderOptions {
  family: string;
  unicode: boolean;
}

export function renderReportDocument(doc: ReportDocument, pdf: PdfWriter, opts: RenderOptions): { pages: number } {
  const L = TEXT_PDF_LAYOUT;
  const width = L.pageWidth - 2 * L.marginX;
  const clean = (t: string) => (opts.unicode ? t : toWinAnsi(t));
  let y = L.top;
  const font = (style: "normal" | "bold", size: number, muted = false) => {
    pdf.setFont(opts.family, style);
    pdf.setFontSize(size);
    if (muted) pdf.setTextColor(80, 80, 80);
    else pdf.setTextColor(17, 17, 17);
  };
  const newPage = () => {
    if (pdf.getNumberOfPages() >= L.maxPages) throw new Error(`Report exceeds ${L.maxPages} pages. Narrow the date range or sources.`);
    pdf.addPage();
    y = L.top;
  };
  const ensure = (h: number) => {
    if (y + h > L.bottom && y > L.top + 0.1) newPage();
  };
  const lines = (text: string, size: number, style: "normal" | "bold", w = width) => {
    font(style, size);
    return pdf.splitTextToSize(clean(text), w);
  };
  const paragraph = (text: string, size: number, style: "normal" | "bold", muted = false, indent = 0, bullet = false) => {
    const ls = lines(text, size, style, width - indent - (bullet ? 4 : 0));
    const lh = lineHeight(size);
    ls.forEach((l, i) => {
      ensure(lh);
      font(style, size, muted);
      if (bullet && i === 0) pdf.text(opts.unicode ? "•" : "-", L.marginX + indent, y + lh * 0.75);
      pdf.text(l, L.marginX + indent + (bullet ? 4 : 0), y + lh * 0.75);
      y += lh;
    });
    y += lh * 0.3;
  };

  for (let bi = 0; bi < doc.blocks.length; bi++) {
    const b = doc.blocks[bi]!;
    if (b.kind === "pagebreak") {
      if (y > L.top + 0.1) newPage();
      continue;
    }
    if (b.kind === "h1" || b.kind === "h2" || b.kind === "h3") {
      const size = b.kind === "h1" ? 16 : b.kind === "h2" ? 13 : 11;
      const ls = lines(b.text, size, "bold");
      const h = ls.length * lineHeight(size) + 2;
      // Orphan protection: heading plus at least three body lines must fit.
      ensure(h + 3 * lineHeight(L.body) + 2);
      y += b.kind === "h3" ? 1 : 2;
      font("bold", size);
      for (const l of ls) {
        pdf.text(l, L.marginX, y + lineHeight(size) * 0.75);
        y += lineHeight(size);
      }
      y += 1.5;
      continue;
    }
    if (b.kind === "banner") {
      const h = 10;
      ensure(h + 2);
      pdf.setFillColor(20, 20, 20);
      pdf.rect(L.marginX, y, width, h, "F");
      font("bold", 13);
      pdf.setTextColor(255, 255, 255);
      pdf.text(clean(b.text), L.pageWidth / 2, y + 6.8, { align: "center" });
      y += h + 4;
      continue;
    }
    if (b.kind === "p") {
      paragraph(b.text, L.body, b.bold ? "bold" : "normal", b.muted);
      continue;
    }
    if (b.kind === "link") {
      ensure(lineHeight(L.body));
      font("normal", L.body);
      pdf.setTextColor(20, 60, 160);
      pdf.textWithLink(clean(b.text), L.marginX, y + lineHeight(L.body) * 0.75, { url: b.url });
      y += lineHeight(L.body) * 1.3;
      continue;
    }
    if (b.kind === "bullets") {
      for (const item of b.items) paragraph(item, L.body, "normal", false, 1, true);
      continue;
    }
    if (b.kind === "kv") {
      const keyW = width * 0.32;
      for (const [k, v] of b.rows) {
        const kl = lines(k, L.body, "bold", keyW - 2);
        const vl = lines(v, L.body, "normal", width - keyW);
        const n = Math.max(kl.length, vl.length);
        const lh = lineHeight(L.body);
        ensure(n * lh);
        for (let i = 0; i < n; i++) {
          if (kl[i]) { font("bold", L.body); pdf.text(kl[i]!, L.marginX, y + lh * 0.75); }
          if (vl[i]) { font("normal", L.body); pdf.text(vl[i]!, L.marginX + keyW, y + lh * 0.75); }
          y += lh;
        }
        y += 0.8;
      }
      y += 1.5;
      continue;
    }
    // table
    const t = b as Extract<Block, { kind: "table" }>;
    const size = L.table;
    const lh = lineHeight(size);
    const pad = 1.2;
    const widths = t.columns.map((c) => c.width * width);
    const drawHeader = () => {
      const hl = t.columns.map((c, i) => lines(c.title, size, "bold", widths[i]! - 2 * pad));
      const h = Math.max(...hl.map((l) => l.length)) * lh + 2 * pad;
      pdf.setFillColor(232, 232, 232);
      pdf.rect(L.marginX, y, width, h, "F");
      let x = L.marginX;
      hl.forEach((ls, i) => {
        font("bold", size);
        ls.forEach((l, j) => pdf.text(l, x + pad, y + pad + lh * (j + 0.75)));
        x += widths[i]!;
      });
      y += h;
      return h;
    };
    const headerH = (() => {
      const hl = t.columns.map((c, i) => lines(c.title, size, "bold", widths[i]! - 2 * pad));
      return Math.max(...hl.map((l) => l.length)) * lh + 2 * pad;
    })();
    ensure(headerH + lh + 2 * pad);
    drawHeader();
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.1);
    for (const row of t.rows) {
      let cells = row.map((c, i) => lines(c ?? "", size, "normal", widths[i]! - 2 * pad));
      // A row taller than a page is split across pages with the header repeated.
      while (cells.some((c) => c.length)) {
        const available = Math.floor((L.bottom - y - 2 * pad) / lh);
        const needed = Math.max(1, ...cells.map((c) => c.length));
        if (available < Math.min(needed, 2)) {
          newPage();
          drawHeader();
          continue;
        }
        const take = Math.min(needed, available);
        const h = take * lh + 2 * pad;
        let x = L.marginX;
        cells.forEach((c, i) => {
          font("normal", size);
          c.slice(0, take).forEach((l, j) => pdf.text(l, x + pad, y + pad + lh * (j + 0.75)));
          x += widths[i]!;
        });
        y += h;
        pdf.line(L.marginX, y, L.marginX + width, y);
        cells = cells.map((c) => c.slice(take));
      }
    }
    y += 3;
  }

  // Running header/footer with page numbers on every page.
  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    font("bold", 8);
    pdf.text(clean(doc.headerLeft), L.marginX, 12);
    pdf.text(clean(doc.headerRight), L.pageWidth - L.marginX, 12, { align: "right" });
    pdf.setDrawColor(150, 150, 150);
    pdf.setLineWidth(0.2);
    pdf.line(L.marginX, 14, L.pageWidth - L.marginX, 14);
    pdf.line(L.marginX, L.bottom + 4, L.pageWidth - L.marginX, L.bottom + 4);
    font("normal", 7.5, true);
    pdf.splitTextToSize(clean(doc.footerLeft), width - 28).slice(0, 2).forEach((line, i) => pdf.text(line, L.marginX, L.bottom + 8 + i * 3.4));
    font("normal", 8, true);
    pdf.text(`Page ${p} of ${pages}`, L.pageWidth - L.marginX, L.bottom + 9, { align: "right" });
  }
  return { pages };
}

// ---------------- Browser entry point ----------------

export interface ReportFonts {
  regular: string; // base64 TTF
  bold: string;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Liberation Sans (SIL OFL) from the bundled pdf.js package, served same-origin. */
export async function loadReportFonts(): Promise<ReportFonts> {
  const [{ default: regularUrl }, { default: boldUrl }] = await Promise.all([
    import("pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url"),
    import("pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url"),
  ]);
  const get = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`font ${r.status}`);
    return toBase64(await r.arrayBuffer());
  };
  const [regular, bold] = await Promise.all([get(regularUrl), get(boldUrl)]);
  return { regular, bold };
}

export interface TextPdfResult {
  blob: Blob;
  pages: number;
  /** "unicode" = embedded font, full character coverage; "standard" = Latin-1 fallback. */
  fontMode: "unicode" | "standard";
}

export async function createTextReportPdf(
  input: TextReportInput,
  deps?: { jsPDF?: new (o: Record<string, unknown>) => PdfWriter & { addFileToVFS(n: string, d: string): unknown; addFont(f: string, n: string, s: string): unknown; output(k: "blob"): Blob }; fonts?: ReportFonts | null },
): Promise<TextPdfResult> {
  const JsPdf = deps?.jsPDF ?? ((await import("jspdf")).jsPDF as unknown as NonNullable<NonNullable<typeof deps>["jsPDF"]>);
  let fonts: ReportFonts | null = deps && "fonts" in deps ? (deps.fonts ?? null) : null;
  if (!deps || !("fonts" in deps)) {
    try {
      fonts = await loadReportFonts();
    } catch {
      fonts = null;
    }
  }
  const pdf = new JsPdf({ unit: "mm", format: "a4", compress: true });
  let family = "helvetica";
  if (fonts) {
    pdf.addFileToVFS("LiberationSans-Regular.ttf", fonts.regular);
    pdf.addFont("LiberationSans-Regular.ttf", "LiberationSans", "normal");
    pdf.addFileToVFS("LiberationSans-Bold.ttf", fonts.bold);
    pdf.addFont("LiberationSans-Bold.ttf", "LiberationSans", "bold");
    family = "LiberationSans";
  }
  const doc = buildReportDocument(input);
  pdf.setProperties({ title: input.title, subject: "Research-only unified health report (searchable text)", creator: "MITOCHONDRIA - local export", keywords: "research only, not a diagnosis" });
  const { pages } = renderReportDocument(doc, pdf, { family, unicode: Boolean(fonts) });
  const blob = pdf.output("blob");
  if (!(blob.size > 0)) throw new Error("The PDF file is empty.");
  return { blob, pages, fontMode: fonts ? "unicode" : "standard" };
}
