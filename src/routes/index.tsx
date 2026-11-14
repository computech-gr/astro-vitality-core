import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { indexableRouteHead } from "@/infrastructure/seo";

const title = "The Mitochondria | Astronaut Health Intelligence";
const description =
  "Where scientific reasoning meets AI-powered intelligence: open-source astronaut health exploration for long-duration missions, with a one-click synthetic NASA live demo.";

export const Route = createFileRoute("/")({
  head: () => indexableRouteHead({ path: "/", title, description }),
  component: AppShell,
});
