import { createFileRoute } from "@tanstack/react-router";
import { indexableRouteHead } from "@/infrastructure/seo";

// Office Online viewer requires a publicly accessible URL; audio playback,
// automatic transitions and narration support are not guaranteed.
const presentationUrl =
  "https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main/docs/competition/MITOCHONDRIA_NASA_2026_Professional_Narrated_Presentation_Final.pptx";
const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(presentationUrl)}`;

function NarratedPresentationPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">
        NASA Space Apps Challenge 2026
      </p>
      <h1 className="mb-3 text-3xl font-bold sm:text-4xl">Narrated NASA Presentation</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Browser presentation preview. Embedded narration and automatic slide transitions may not be
        supported by Microsoft Office Online.
      </p>
      <iframe
        title="MITOCHONDRIA NASA 2026 narrated presentation preview"
        src={viewerUrl}
        className="h-[75vh] min-h-[420px] w-full rounded-xl border bg-white"
        allowFullScreen
        referrerPolicy="no-referrer"
      />
      <p className="mt-4 text-sm text-muted-foreground">
        If the preview does not load, the browser viewer may not support this file or its hosting
        URL. The original PowerPoint remains in the public GitHub repository.
      </p>
    </main>
  );
}

export const Route = createFileRoute("/competition/narrated-presentation")({
  head: () =>
    indexableRouteHead({
      path: "/competition/narrated-presentation",
      title: "Narrated NASA Presentation | MITOCHONDRIA",
      description: "NASA Space Apps 2026 narrated presentation browser preview.",
    }),
  component: NarratedPresentationPage,
});
