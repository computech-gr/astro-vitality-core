/** P22.6: Local OCR pack detection. A successful HEAD is not proof of offline caching. */
export type LocalOcrAssets = {
  worker: string;
  core: string;
  languageDirectory: string;
};

const ROOT = "/ocr/v1";
const FILES = [
  `${ROOT}/worker.min.js`,
  `${ROOT}/tesseract-core.wasm.js`,
  `${ROOT}/tesseract-core-simd.wasm.js`,
  `${ROOT}/tesseract-core-lstm.wasm.js`,
  `${ROOT}/tesseract-core-simd-lstm.wasm.js`,
  `${ROOT}/eng.traineddata.gz`,
] as const;

export async function getLocalOcrAssets(): Promise<LocalOcrAssets | null> {
  try {
    const results = await Promise.all(FILES.map(async (url) => {
      const response = await fetch(url, { method: "HEAD", cache: "no-store" });
      return response.ok && (response.headers.get("content-type") ?? "").toLowerCase().indexOf("text/html") === -1;
    }));
    if (!results.every(Boolean)) return null;
    return { worker: FILES[0], core: ROOT, languageDirectory: ROOT };
  } catch { return null; }
}

/** A network-independent check that assets were previously cached by the SW. */
export async function offlineOcrCacheReady(): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    return (await Promise.all(FILES.map(async (url) => Boolean(await caches.match(url))))).every(Boolean);
  } catch { return false; }
}
