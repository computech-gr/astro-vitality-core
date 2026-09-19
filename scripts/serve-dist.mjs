import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const root = process.cwd();
const clientRoot = resolve(root, "dist/client");
const serverCandidates = [
  resolve(root, "dist/server/index.mjs"),
  resolve(root, "dist/server/index.js"),
  resolve(root, "dist/server/server.js"),
];
const serverEntryPath = serverCandidates.find((candidate) => existsSync(candidate));

if (!serverEntryPath) {
  throw new Error(
    `No self-host server bundle found. Expected one of: ${serverCandidates.join(", ")}`,
  );
}

const serverModule = await import(pathToFileURL(serverEntryPath).href);
const handler = serverModule.default?.fetch
  ? serverModule.default
  : serverModule.fetch
    ? serverModule
    : serverModule.default;

if (!handler || typeof handler.fetch !== "function") {
  throw new TypeError(`Server bundle ${serverEntryPath} does not expose a fetch(request, env, ctx) handler.`);
}

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function staticPathFor(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded === "/" || decoded.endsWith("/")) return undefined;
  const relative = normalize(decoded.replace(/^\/+/, ""));
  if (!relative || relative.startsWith("..") || relative.includes(`..${sep}`)) return undefined;
  const candidate = resolve(clientRoot, relative);
  if (candidate !== clientRoot && !candidate.startsWith(`${clientRoot}${sep}`)) return undefined;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return undefined;
  return candidate;
}

function serveStatic(filePath, res) {
  const contentType = MIME_TYPES.get(extname(filePath).toLowerCase()) || "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", filePath.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate");
  createReadStream(filePath).pipe(res);
}

function requestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  return Readable.toWeb(req);
}

async function handle(req, res) {
  const authority = req.headers.host || `${host}:${port}`;
  const url = new URL(req.url || "/", `http://${authority}`);
  const staticPath = staticPathFor(url.pathname);
  if (staticPath) {
    serveStatic(staticPath, res);
    return;
  }

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }

  const body = requestBody(req);
  const request = new Request(url, {
    method: req.method,
    headers,
    ...(body ? { body, duplex: "half" } : {}),
  });
  const waitUntil = [];
  const response = await handler.fetch(request, process.env, {
    waitUntil(promise) {
      waitUntil.push(Promise.resolve(promise));
    },
    passThroughOnException() {},
  });

  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  if (!response.body || req.method === "HEAD") {
    res.end();
  } else {
    Readable.fromWeb(response.body).pipe(res);
  }
  void Promise.allSettled(waitUntil);
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "text/plain; charset=utf-8");
    }
    res.end("Internal Server Error");
  });
});

server.listen(port, host, () => {
  console.log(`The Mitochondria self-host runtime listening on http://${host}:${port}`);
});
