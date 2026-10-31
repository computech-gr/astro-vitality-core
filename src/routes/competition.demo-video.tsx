import { createFileRoute } from "@tanstack/react-router";

import { indexableRouteHead } from "@/infrastructure/seo";
const videoUrl = "https://raw.githubusercontent.com/computech-gr/astro-vitality-core/main/docs/competition/MITOCHONDRIA_NASA_2026_Official_Demo_FINAL.mp4";

const title = "NASA Space Apps Demo Video | The Mitochondria";
const description = "Three-minute MITOCHONDRIA astronaut health intelligence research prototype demonstration.";

function CompetitionDemoVideoPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-cyan-400">NASA Space Apps Challenge 2026</p>
      <h1 className="mb-3 text-3xl font-bold sm:text-4xl">MITOCHONDRIA — Demo Video</h1>
      <p className="mb-7 text-base text-muted-foreground">Official competition demonstration of the open-source astronaut health intelligence research prototype.</p>
      <video
        key={videoUrl}
        className="w-full rounded-xl border bg-black shadow-lg"
        controls
        preload="metadata"
        playsInline
        aria-label="MITOCHONDRIA NASA Space Apps 2026 demonstration video"
      >
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support HTML5 video.
      </video>
      <p className="mt-4 text-sm text-muted-foreground">If playback is unavailable, please try a different browser. GitHub raw file delivery does not guarantee streaming.</p>
      <p className="mt-5 text-sm text-muted-foreground">Research prototype using synthetic data. Not NASA-endorsed, clinically validated, or flight-qualified.</p>
    </main>
  );
}

export const Route = createFileRoute("/competition/demo-video")({
  head: () => indexableRouteHead({ path: "/competition/demo-video", title, description, ogType: "article" }),
  component: CompetitionDemoVideoPage,
});
