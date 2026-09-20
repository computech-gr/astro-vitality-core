import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { indexableRouteHead } from "@/infrastructure/seo";

const title = "The Mitochondria | Astronaut Health Intelligence";
const description =
  "Open-source, offline-first astronaut health intelligence for long-duration human spaceflight, built for NASA Space Apps Challenge 2026.";

export const Route = createFileRoute("/")({
  head: () => indexableRouteHead({ path: "/", title, description }),
  component: AppShell,
});
