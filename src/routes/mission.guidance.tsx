import { createFileRoute } from "@tanstack/react-router";

import { ActionGuidancePage } from "@/components/action-guidance";
import { CANONICAL_ORIGIN } from "@/infrastructure/config";

export const Route = createFileRoute("/mission/guidance")({
  head: () => ({
    meta: [
      { title: "Action & Protocol Guidance | The Mitochondria" },
      { name: "description", content: "Governed, non-diagnostic action and protocol guidance for explainable astronaut health findings." },
    ],
    links: [{ rel: "canonical", href: `${CANONICAL_ORIGIN}/mission/guidance` }],
  }),
  component: ActionGuidancePage,
});
