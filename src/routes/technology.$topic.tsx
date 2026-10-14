import { createFileRoute, notFound } from "@tanstack/react-router";

import { TopicPage } from "@/components/knowledge/topic-page";
import { TECHNOLOGY_TOPICS, findTechnologyTopic, technologyTopicPath } from "@/content/technology-topics";
import { indexableRouteHead } from "@/infrastructure/seo";

export const Route = createFileRoute("/technology/$topic")({
  loader: ({ params }) => {
    const topic = findTechnologyTopic(params.topic);
    if (!topic) throw notFound();
    return { slug: topic.slug };
  },
  head: ({ loaderData }) => {
    const topic = loaderData ? findTechnologyTopic(loaderData.slug) : undefined;
    if (!topic) return { meta: [{ title: "Topic not found | The Mitochondria" }, { name: "robots", content: "noindex, nofollow" }] };
    return indexableRouteHead({
      path: technologyTopicPath(topic.slug),
      title: `${topic.title} | Technology | The Mitochondria`,
      description: topic.summary,
      ogType: "article",
    });
  },
  component: TopicRoute,
});

function TopicRoute() {
  const { slug } = Route.useLoaderData();
  const topic = findTechnologyTopic(slug);
  if (!topic) return null;
  return <TopicPage topic={topic} siblings={TECHNOLOGY_TOPICS} />;
}
