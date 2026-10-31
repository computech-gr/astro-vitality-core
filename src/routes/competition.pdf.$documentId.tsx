import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { indexableRouteHead } from "@/infrastructure/seo";
import {
  competitionPdfFilePath,
  competitionPdfViewerPath,
  findCompetitionPdf,
  type CompetitionPdfId,
} from "@/content/competition-pdfs";

// P52: Google Docs Viewer refuses to be framed (X-Frame-Options: SAMEORIGIN), so the
// competition PDFs are fetched same-origin and rendered page by page with pdf.js.
// pdf.js is imported dynamically after hydration because it is browser-only; the legacy
// build is used because the modern build needs Map.getOrInsertComputed, which many
// current desktop and mobile browsers do not yet support.

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }) => { promise: Promise<void>; cancel: () => void };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };

type ViewerState =
  | { kind: "loading"; received: number; total: number }
  | { kind: "ready"; doc: PdfDoc; sizes: { width: number; height: number }[] }
  | { kind: "error"; message: string };

function PdfPageCanvas({ doc, pageNumber, size }: { doc: PdfDoc; pageNumber: number; size: { width: number; height: number } }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    let cancelled = false;
    let renderedWidth = 0;
    let generation = 0;
    let task: { promise: Promise<void>; cancel: () => void } | undefined;
    const render = async () => {
      const target = canvas.current;
      if (!target || cancelled) return;
      const cssWidth = element.clientWidth;
      if (!cssWidth || Math.abs(cssWidth - renderedWidth) < 2) return;
      renderedWidth = cssWidth;
      const run = ++generation;
      const page = await doc.getPage(pageNumber);
      if (cancelled || run !== generation) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (cssWidth / size.width) * ratio });
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      const context = target.getContext("2d");
      if (!context) return;
      task?.cancel();
      task = page.render({ canvasContext: context, viewport, canvas: target });
      try {
        await task.promise;
      } catch (error) {
        if (run !== generation || cancelled) return; // superseded or released
        throw error;
      }
      if (!cancelled && run === generation) setRendered(true);
    };
    // Pages far outside the viewport release their bitmap so long documents
    // (the manual has 120+ pages) stay within mobile and desktop memory limits.
    const release = () => {
      generation += 1;
      task?.cancel();
      task = undefined;
      renderedWidth = 0;
      const target = canvas.current;
      if (target) {
        target.width = 0;
        target.height = 0;
      }
      setRendered(false);
    };
    let visible = false;
    const fail = () => {
      if (!cancelled) setFailed(true);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const nowVisible = entries.some((entry) => entry.isIntersecting);
        if (visible && !nowVisible) release();
        visible = nowVisible;
        if (visible) void render().catch(fail);
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(element);
    const resize = new ResizeObserver(() => {
      if (visible) void render().catch(fail);
    });
    resize.observe(element);
    return () => {
      cancelled = true;
      task?.cancel();
      observer.disconnect();
      resize.disconnect();
    };
  }, [doc, pageNumber, size.width]);

  return (
    <div
      ref={wrapper}
      className="relative w-full overflow-hidden rounded-md border border-border bg-card shadow-sm"
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
      data-pdf-page={pageNumber}
      data-rendered={rendered ? "true" : "false"}
    >
      <canvas ref={canvas} className="block h-full w-full" aria-label={`Page ${pageNumber}`} role="img" />
      {!rendered ? (
        <span className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">{failed ? `Page ${pageNumber} could not be drawn` : `Loading page ${pageNumber}…`}</span>
      ) : null}
    </div>
  );
}

function CompetitionPdfViewer() {
  const { documentId } = Route.useParams();
  const document = findCompetitionPdf(documentId);
  const [state, setState] = useState<ViewerState>({ kind: "loading", received: 0, total: 0 });

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let loaded: PdfDoc | undefined;
    const controller = new AbortController();
    setState({ kind: "loading", received: 0, total: 0 });
    (async () => {
      const response = await fetch(competitionPdfFilePath(documentId as CompetitionPdfId), { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Document unavailable (HTTP ${response.status})`);
      const total = Number(response.headers.get("content-length") ?? 0);
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (!cancelled) setState({ kind: "loading", received, total });
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
      }
      const doc = (await pdfjs.getDocument({ data: bytes, isEvalSupported: false } as Parameters<typeof pdfjs.getDocument>[0]).promise) as unknown as PdfDoc;
      loaded = doc;
      const sizes: { width: number; height: number }[] = [];
      for (let n = 1; n <= doc.numPages; n += 1) {
        const viewport = (await doc.getPage(n)).getViewport({ scale: 1 });
        sizes.push({ width: viewport.width, height: viewport.height });
      }
      if (!cancelled) setState({ kind: "ready", doc, sizes });
    })().catch((error: unknown) => {
      if (cancelled) return;
      setState({ kind: "error", message: error instanceof Error ? error.message : "The document could not be displayed." });
    });
    return () => {
      cancelled = true;
      controller.abort();
      void loaded?.destroy();
    };
  }, [documentId, document]);

  if (!document) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-2xl font-bold">Document not found</h1>
      </main>
    );
  }

  const fileHref = competitionPdfFilePath(documentId as CompetitionPdfId);

  return (
    <main className="mx-auto w-full max-w-5xl px-3 py-8 sm:px-6">
      <p className="section-kicker mb-2">NASA Space Apps Challenge 2026</p>
      <h1 className="mb-2 font-display text-2xl font-semibold sm:text-3xl">{document.title}</h1>
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-live="polite">
        {state.kind === "loading" ? (
          <span>
            Loading document
            {state.total > 0 ? ` — ${Math.round((state.received / state.total) * 100)}%` : state.received > 0 ? ` — ${(state.received / 1048576).toFixed(1)} MB` : "…"}
          </span>
        ) : null}
        {state.kind === "ready" ? <span>{state.doc.numPages} pages</span> : null}
        <a className="underline underline-offset-4 hover:text-foreground" href={fileHref} target="_blank" rel="noopener noreferrer">
          Open in the browser's PDF viewer
        </a>
      </div>
      {state.kind === "error" ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {state.message} Try again later or use the link above.
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <div className="flex flex-col gap-4" aria-label={`${document.title} pages`}>
          {state.sizes.map((size, index) => (
            <PdfPageCanvas key={`${documentId}-${index + 1}`} doc={state.doc} pageNumber={index + 1} size={size} />
          ))}
        </div>
      ) : null}
    </main>
  );
}

export const Route = createFileRoute("/competition/pdf/$documentId")({
  head: ({ params }) => {
    const document = findCompetitionPdf(params.documentId);
    if (!document) return { meta: [{ title: "Document not found | The Mitochondria" }, { name: "robots", content: "noindex, nofollow" }] };
    return indexableRouteHead({
      path: competitionPdfViewerPath(params.documentId as CompetitionPdfId),
      title: `${document.title} | NASA Space Apps 2026 | The Mitochondria`,
      description: `Read The Mitochondria ${document.title} for NASA Space Apps Challenge 2026 directly in your browser.`,
      ogType: "article",
    });
  },
  component: CompetitionPdfViewer,
});
