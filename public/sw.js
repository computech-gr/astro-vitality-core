const SHELL_CACHE = "mitochondria-shell-p14-v1";
const CORE_ASSETS = ["/", "/manifest.webmanifest", "/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isPublicShellRequest(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/") || url.pathname.includes("supabase")) return false;
  return ["document", "script", "style", "image", "font", "manifest"].includes(request.destination);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isPublicShellRequest(request)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("/");
          if (shell) return shell;
        }
        return new Response("Offline resource unavailable", { status: 503, statusText: "Offline" });
      }),
  );
});

// P22.6: optional same-origin OCR pack; missing assets never break PWA installation.
const OCR_PACK_V1 = [
  "/ocr/v1/worker.min.js", "/ocr/v1/tesseract-core.wasm.js",
  "/ocr/v1/tesseract-core-simd.wasm.js", "/ocr/v1/tesseract-core-lstm.wasm.js",
  "/ocr/v1/tesseract-core-simd-lstm.wasm.js", "/ocr/v1/eng.traineddata.gz",
];
self.addEventListener("message", (event) => {
  if (event.data?.type !== "MITO_CACHE_OCR_V1") return;
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    for (const url of OCR_PACK_V1) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok && !(response.headers.get("content-type") || "").includes("text/html")) {
          await cache.put(url, response);
        }
      } catch { /* Never treat a partial pack as offline-ready. */ }
    }
  })());
});
