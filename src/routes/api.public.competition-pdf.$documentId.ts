import { createFileRoute } from "@tanstack/react-router";
import { COMPETITION_PDF_SOURCE_BASE, findCompetitionPdf } from "@/content/competition-pdfs";

// Public, read-only proxy for the three published competition PDFs so the
// in-app viewer loads them same-origin. Only allowlisted IDs are accepted;
// no caller input reaches the upstream URL and no private data is involved.
const MAX_BYTES = 40 * 1024 * 1024;

export const Route = createFileRoute("/api/public/competition-pdf/$documentId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const document = findCompetitionPdf(params.documentId);
        if (!document) return Response.json({ error: "Unknown document" }, { status: 404 });
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
          const upstream = await fetch(`${COMPETITION_PDF_SOURCE_BASE}${document.file}`, {
            signal: controller.signal,
            redirect: "error",
          });
          if (!upstream.ok || !upstream.body) {
            return Response.json({ error: "Document source unavailable", upstreamStatus: upstream.status }, { status: 502 });
          }
          const length = Number(upstream.headers.get("content-length") ?? 0);
          if (length > MAX_BYTES) return Response.json({ error: "Document too large" }, { status: 413 });
          const headers = new Headers({
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${document.file}"`,
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          });
          if (length > 0) headers.set("Content-Length", String(length));
          return new Response(upstream.body, { status: 200, headers });
        } catch {
          return Response.json({ error: "Document request failed or timed out" }, { status: 502 });
        } finally {
          clearTimeout(timeout);
        }
      },
    },
  },
});
