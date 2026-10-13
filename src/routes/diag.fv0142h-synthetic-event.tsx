import { createFileRoute } from "@tanstack/react-router";

import { Fv0142hSyntheticEventTest } from "@/components/diagnostics/fv0142h-synthetic-event";

// FV-01.4.2H B6-A TEMPORARY TEST ROUTE — REMOVE AFTER B6 ACCEPTANCE. Not linked from navigation.
export const Route = createFileRoute("/diag/fv0142h-synthetic-event")({
  head: () => ({
    meta: [
      { title: "Temporary synthetic event test | The Mitochondria" },
      { name: "description", content: "Temporary owner-operated synthetic event test." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Temporary synthetic event test" },
      { property: "og:description", content: "Temporary owner-operated synthetic event test." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: Fv0142hSyntheticEventTest,
});
