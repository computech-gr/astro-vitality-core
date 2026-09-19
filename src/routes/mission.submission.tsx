import { createFileRoute } from "@tanstack/react-router";

import { ChallengeSubmissionPage } from "@/components/challenge-submission";
import { canonicalUrl } from "@/infrastructure/config";

const title = "Challenge Demo & Submission | The Mitochondria";
const description = "Judge-ready demo runbook, evidence gate, challenge attribution and submission materials for The Mitochondria.";

export const Route = createFileRoute("/mission/submission")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl("/mission/submission") },
    ],
    links: [{ rel: "canonical", href: canonicalUrl("/mission/submission") }],
  }),
  component: ChallengeSubmissionPage,
});
