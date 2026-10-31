import { createFileRoute } from "@tanstack/react-router";
import { indexableRouteHead } from "@/infrastructure/seo";

const documents = {
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

function CompetitionPdfViewer() {
  const { documentId } = Route.useParams();
  const document = documents[documentId as keyof typeof documents];
  if (!document) {
    return <main className="mx-auto max-w-5xl px-5 py-16"><h1 className="text-2xl font-bold">Document not found</h1></main>;
  }
  // Public repository asset, not a GitHub HTML blob page.
  const rawUrl = `https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main/docs/competition/${document.file}`;
  // Google Docs Viewer renders PDF in an iframe without showing the GitHub UI.
  // Third-party rendering requires that the raw URL be publicly reachable.
  const viewerUrl = `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(rawUrl)}`;
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-cyan-400">NASA Space Apps Challenge 2026</p>
      <h1 className="mb-4 text-2xl font-bold sm:text-3xl">{document.title}</h1>
      <iframe
        key={documentId}
        title={`${document.title} PDF browser viewer`}
        src={viewerUrl}
        className="h-[82vh] min-h-[520px] w-full rounded-xl border bg-white"
        referrerPolicy="no-referrer"
        allowFullScreen
      />
      <p className="mt-3 text-sm text-muted-foreground">
        If this preview is unavailable, the external PDF viewer may be temporarily unable to retrieve the document.
      </p>
    </main>
  );
}

export const Route = createFileRoute("/competition/pdf/$documentId")({
  head: () => indexableRouteHead({
    path: "/competition/pdf",
    title: "NASA Competition PDF Viewer | MITOCHONDRIA",
    description: "View MITOCHONDRIA NASA Space Apps Challenge 2026 competition documents in your browser.",
  }),
  component: CompetitionPdfViewer,
});
