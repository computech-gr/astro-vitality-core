/**
 * Searchable text PDF for the P36 Scientific Decision Dossier.
 * Reuses the existing text-PDF layout engine and embedded font without
 * changing it or the Unified Health Report PDF. Content comes only from the
 * deterministic dossier model, so PDF and JSON carry the same facts, gaps,
 * blockers and integrity digests.
 */
import { CANONICAL_URL, loadReportFonts, renderReportDocument, type Block, type PdfWriter, type ReportDocument, type ReportFonts } from "./report-text-pdf";
import { FIELD_BASIS_LABELS, type DecisionDossier, type DossierField } from "./p36-decision-dossier";

const fieldRow = (label: string, f: DossierField): [string, string] => [label, `${f.value}  [${FIELD_BASIS_LABELS[f.basis]}${f.refs.length ? `; ${f.refs.join(", ")}` : ""}]`];

export function buildDecisionDossierDocument(d: DecisionDossier): ReportDocument {
  const blocks: Block[] = [
    { kind: "banner", text: `${d.status} · NOT AN APPROVAL · NO ACTIVATION` },
    { kind: "h1", text: d.title },
    {
      kind: "kv",
      rows: [
        ["Addressed to", d.addressedTo],
        ["Generated (UTC)", d.generatedAt ?? "not stated"],
        ["Manifest version", d.manifestVersion],
        ["Base catalog", d.baseCatalogVersion],
        ["Terms / held observations", `${d.counts.terms} / ${d.counts.observations}`],
        ["Blocked terms", String(d.counts.blocked)],
        ["Scientific approvals recorded", String(d.scientificApprovals)],
        ["Terms with source conflicts", String(d.counts.conflicts)],
        ["Terms with no recorded method", String(d.counts.missingMethods)],
        ["Required reviewer decisions", String(d.counts.requiredDecisions)],
      ],
    },
    {
      kind: "alert",
      tone: "pending",
      title: "How to read this dossier",
      lines: [
        "\"Verified\" means only that a named repository source states the fact; it is not a scientific confirmation.",
        "Everything not verified is listed as an unresolved assumption, conflict or gap. Missing methods, protocols, units, validation evidence and approvals are reported as missing, never filled in.",
        "Nothing in this dossier activates a catalog entry, converts a unit or changes any observation.",
      ],
    },
    { kind: "h2", text: "Decision matrix — what must be confirmed before governed activation" },
    {
      kind: "table",
      columns: [
        { title: "Term (unit)", width: 0.14 },
        { title: "Identity", width: 0.15 },
        { title: "Domain", width: 0.1 },
        { title: "Specimen", width: 0.12 },
        { title: "Method", width: 0.1 },
        { title: "Protocol", width: 0.1 },
        { title: "Unit", width: 0.17 },
        { title: "Validation / other", width: 0.12 },
      ],
      rows: d.decisionMatrix.map((r) => [`${r.sourceLabel} (${r.sourceUnit})`, r.identity, r.domain, r.specimen, r.method, r.protocol, r.unit, r.validation]),
    },
    { kind: "p", muted: true, text: `Every row: ${d.status}. Basis legend: ${Object.values(d.basisLegend).join(" · ")}.` },
  ];
  for (const t of d.terms) {
    blocks.push({ kind: "pagebreak" });
    blocks.push({ kind: "h2", text: `${t.sourceLabel} — ${t.termId}` });
    blocks.push({ kind: "p", bold: true, text: `${t.status} · ${t.observations} held observation(s) · activation not allowed` });
    blocks.push({
      kind: "kv",
      rows: [
        fieldRow("Proposed canonical identity", t.fields.proposedCanonicalIdentity),
        fieldRow("Domain", t.fields.domain),
        fieldRow("Specimen", t.fields.specimen),
        fieldRow("Assay / method", t.fields.assayOrMethod),
        fieldRow("Protocol", t.fields.protocol),
        fieldRow("Source unit", t.fields.sourceUnit),
        fieldRow("Candidate catalog unit", t.fields.candidateCatalogUnit),
      ],
    });
    blocks.push({ kind: "h3", text: "Verified source facts" });
    blocks.push({ kind: "bullets", items: t.verifiedFacts.map((f) => `${f.statement} [${f.ref}]`) });
    blocks.push({ kind: "h3", text: "Unresolved assumptions" });
    blocks.push({ kind: "bullets", items: t.unresolvedAssumptions });
    blocks.push({ kind: "h3", text: "Scientific uncertainties" });
    blocks.push({ kind: "bullets", items: t.scientificUncertainties });
    blocks.push({ kind: "h3", text: "Decisions required from the reviewer" });
    blocks.push({ kind: "bullets", items: t.requiredDecisions.map((r) => `${r.id}: ${r.text}`) });
    blocks.push({ kind: "h3", text: "Unresolved activation blockers" });
    blocks.push({ kind: "bullets", items: t.blockers });
    blocks.push({
      kind: "p",
      muted: true,
      text: t.latestWorksheetEntry
        ? `Latest worksheet entry #${t.latestWorksheetEntry.sequence}: ${t.latestWorksheetEntry.decision}${t.latestWorksheetEntry.targetCatalogId ? ` -> ${t.latestWorksheetEntry.targetCatalogId}` : ""} by ${t.latestWorksheetEntry.reviewerName} at ${t.latestWorksheetEntry.recordedAt} (hash ${t.latestWorksheetEntry.hash.slice(0, 16)}). ${t.latestWorksheetEntry.note}`
        : "No reviewer worksheet entry recorded.",
    });
    blocks.push({ kind: "h3", text: "Exact source references" });
    blocks.push({ kind: "table", columns: [{ title: "Reference", width: 0.3 }, { title: "Record", width: 0.7 }], rows: t.sourceReferences.map((r) => [r.ref, r.title]) });
  }
  blocks.push({ kind: "pagebreak" });
  blocks.push({ kind: "h2", text: "Activation prerequisites (each in a separate governed patch)" });
  blocks.push({ kind: "bullets", items: [...d.activationPrerequisites] });
  blocks.push({ kind: "h2", text: "Integrity" });
  blocks.push({
    kind: "kv",
    rows: [
      ["Algorithm", d.integrity.algorithm],
      ["Dossier content digest", d.integrity.contentDigest],
      ["Activation manifest digest", d.integrity.manifestDigest],
      ["Review history", `${d.integrity.reviewHistory.entries} entries · ${d.integrity.reviewHistory.integrity} · head ${d.integrity.reviewHistory.headHash}`],
      ["Source integrity", `${d.integrity.sourceIntegrity}${d.integrity.sourceProblems.length ? `: ${d.integrity.sourceProblems.join("; ")}` : ""}`],
    ],
  });
  blocks.push({ kind: "table", columns: [{ title: "Source artifact", width: 0.5 }, { title: "Canonical SHA-256", width: 0.5 }], rows: d.integrity.sourceArtifactDigests.map((s) => [s.path, s.canonicalSha256]) });
  blocks.push({ kind: "p", muted: true, text: "Verify the matching JSON export in the Catalog Scientific Review page; the PDF is a readable copy of the same dossier." });
  blocks.push({ kind: "link", text: CANONICAL_URL, url: CANONICAL_URL });
  return {
    title: d.title,
    headerLeft: "MITOCHONDRIA · P36 Scientific Decision Dossier",
    headerRight: d.status,
    footerLeft: `Digest ${d.integrity.contentDigest.slice(0, 16)} · research only · not an approval`,
    blocks,
  };
}

export async function createDecisionDossierPdf(
  d: DecisionDossier,
  deps?: { jsPDF?: new (o: Record<string, unknown>) => PdfWriter & { addFileToVFS(n: string, v: string): unknown; addFont(f: string, n: string, s: string): unknown; output(k: "blob"): Blob }; fonts?: ReportFonts | null },
): Promise<{ blob: Blob; pages: number; fontMode: "unicode" | "standard" }> {
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
  pdf.setProperties({ title: d.title, subject: "P36 scientific decision dossier (research only, not an approval)", creator: "MITOCHONDRIA - local export", keywords: `${d.status}, ${d.integrity.contentDigest}` });
  const { pages } = renderReportDocument(buildDecisionDossierDocument(d), pdf, { family, unicode: Boolean(fonts) });
  const blob = pdf.output("blob");
  if (!(blob.size > 0)) throw new Error("The PDF file is empty.");
  return { blob, pages, fontMode: fonts ? "unicode" : "standard" };
}
