import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { canonicalUrl } from "@/infrastructure/config";

const title = "The Mitochondria | Astronaut Health Intelligence";
const description = "Open-source, offline-first astronaut health intelligence for long-duration human spaceflight, built for NASA Space Apps Challenge 2026.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/") },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: canonicalUrl("/og-image.jpg") },
      { name: "twitter:image", content: canonicalUrl("/og-image.jpg") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/") }],
  }),
  component: AppShell,
});