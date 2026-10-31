// Browser-safe registry of the three competition PDFs shown by the in-app viewer.
// P53: the committed docs/competition PDFs ship as same-origin static files under
// /competition/assets/pdf/ (staged at build time); nothing is fetched from GitHub.

export const competitionPdfs = {
  presentation: {
    title: "NASA Competition Presentation",
    file: "MITOCHONDRIA_NASA_Space_Apps_2026_Presentation_FINAL.pdf",
  },
  evaluator: {
    title: "NASA Evaluator Quick Start Guide",
    file: "MITOCHONDRIA_NASA_Evaluator_Quick_Start_Guide_FINAL.pdf",
  },
  manual: {
    title: "Master Operations & Technical Manual",
    file: "MITOCHONDRIA_Master_Operations_Technical_Manual_FINAL.pdf",
  },
} as const;

export type CompetitionPdfId = keyof typeof competitionPdfs;

export function findCompetitionPdf(id: string) {
  return Object.prototype.hasOwnProperty.call(competitionPdfs, id)
    ? competitionPdfs[id as CompetitionPdfId]
    : undefined;
}

export function competitionPdfViewerPath(id: CompetitionPdfId) {
  return `/competition/pdf/${id}` as const;
}

export function competitionPdfFilePath(id: CompetitionPdfId) {
  return `/competition/assets/pdf/${competitionPdfs[id].file}`;
}
