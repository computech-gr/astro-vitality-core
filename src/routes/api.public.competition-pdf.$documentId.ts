import { createFileRoute } from "@tanstack/react-router";
import { findCompetitionPdf } from "@/content/competition-pdfs";

// P53: redirect to locally deployed static PDF. Never proxy GitHub at runtime.
export const Route = createFileRoute("/api/public/competition-pdf/$documentId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const document = findCompetitionPdf(params.documentId);
        if (!document) return Response.json({ error: "Unknown document" }, { status: 404 });
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/competition/assets/pdf/${encodeURIComponent(document.file)}`,
            "Cache-Control": "public, max-age=300",
          },
        });
      },
    },
  },
});
