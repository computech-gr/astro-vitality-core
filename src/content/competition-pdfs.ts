// Browser-safe registry of the four competition PDFs shown by the in-app viewer.
// P53: the committed docs/competition PDFs ship as same-origin static files under
// /competition/assets/pdf/ (staged at build time); nothing is fetched from GitHub.

type CompetitionPdfEntry = {
  title: string;
  file: string;
  /** Optional line shown under the title. */
  subtitle?: string;
  /** Optional prominent disclaimer shown above the document. */
  disclaimer?: string;
  /** Optional plain-language note on where the document's data came from. */
  provenance?: string;
};

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
  // P60 (owner-approved 2026-11-08): the owner-supplied 16-page P60 report is served
  // byte-identical as a static sample. It is never regenerated here and does not
  // replace reports the app generates from actual mission observations.
  sample: {
    title: "MITOCHONDRIA — Premium Health Intelligence Report",
    file: "MITOCHONDRIA_P60_Alex_Morgan_Premium_Health_Intelligence_Report_SYNTHETIC.pdf",
    subtitle: "Alex Morgan | Synthetic Astronaut | P60 Demonstration",
    disclaimer:
      "Synthetic demonstration data. Preliminary automated assessment for Ground Medical review. Not a clinical diagnosis.",
    provenance:
      "This sample was generated from reconstructed synthetic demonstration data. It is not based on verified local November records or on any real astronaut. Reports created inside the app are built from the selected crew member's own observations.",
  },
} as const satisfies Record<string, CompetitionPdfEntry>;

export type CompetitionPdfId = keyof typeof competitionPdfs;

export function findCompetitionPdf(id: string): CompetitionPdfEntry | undefined {
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
