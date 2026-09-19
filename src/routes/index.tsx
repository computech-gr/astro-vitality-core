import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { canonicalUrl } from "@/infrastructure/config";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mitochondria — Astronaut Health Intelligence" },
      {
        name: "description",
        content:
          "Open-source, offline-first astronaut health intelligence platform. Foundation build for NASA Space Apps Challenge 2026.",
      },
      { property: "og:title", content: "Mitochondria — Astronaut Health Intelligence" },
      {
        property: "og:description",
        content:
          "Open-source, offline-first astronaut health intelligence platform. Foundation build for NASA Space Apps Challenge 2026.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
  }),
  component: Index,
});

function Index() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold tracking-tight">Mitochondria</h1>
      <p className="mt-3 max-w-prose text-sm text-muted-foreground">
        Open-source, offline-first astronaut health intelligence platform for
        NASA Space Apps Challenge 2026. This is the foundation build: project
        architecture and application shell only. Health features are not part
        of this phase.
      </p>
    </AppShell>
  );
}
