import { createFileRoute } from "@tanstack/react-router";

import { ChallengeSubmissionPage } from "@/components/challenge-submission";
import { indexableRouteHead } from "@/infrastructure/seo";

const title = "Challenge Demo & Submission | The Mitochondria";
const description =
  "Judge-ready demo runbook, evidence gate, challenge attribution and submission materials for The Mitochondria.";

export const Route = createFileRoute("/mission/submission")({
  head: () => indexableRouteHead({ path: "/mission/submission", title, description, ogType: "article" }),
  component: ChallengeSubmissionPage,
});
