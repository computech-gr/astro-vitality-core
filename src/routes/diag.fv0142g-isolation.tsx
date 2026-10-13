import { createFileRoute } from "@tanstack/react-router";

import { Fv0142gIsolationProbe } from "@/components/diagnostics/fv0142g-isolation-probe";

// FV-01.4.2G TEMPORARY DIAGNOSTIC ROUTE — REMOVE AFTER ACCEPTANCE. Not linked from navigation.
export const Route = createFileRoute("/diag/fv0142g-isolation")({
  head: () => ({
    meta: [
      { title: "Temporary isolation diagnostic | The Mitochondria" },
      { name: "description", content: "Temporary owner-operated read-only diagnostic." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Temporary isolation diagnostic" },
      { property: "og:description", content: "Temporary owner-operated read-only diagnostic." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  ssr: false,
  component: Fv0142gIsolationProbe,
});
