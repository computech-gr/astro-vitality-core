import { CANONICAL_ORIGIN } from "@/infrastructure/config";

function supabaseConnectSources(): string[] {
  const value = typeof process !== "undefined" ? process.env?.["SUPABASE_URL"] : undefined;
  if (!value) return [];
  try {
    const origin = new URL(value).origin;
    const ws = origin.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    return [origin, ws];
  } catch {
    return [];
  }
}

export function buildContentSecurityPolicy(): string {
  const connect = ["'self'", ...supabaseConnectSources()];
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com data:",
    // The official competition demo MP4 is streamed from the public GitHub repository.
    "media-src 'self' https://raw.githubusercontent.com",
    // The narrated competition PPTX is previewed only through Microsoft's Office Online viewer.
    "frame-src https://view.officeapps.live.com https://docs.google.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // TanStack Start currently emits inline bootstrap/hydration code. P16 documents this
    // residual risk; a nonce-based strict CSP is a release-hardening follow-up.
    "script-src 'self' 'unsafe-inline'",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function applySecurityHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", buildContentSecurityPolicy());
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), accelerometer=(self), gyroscope=(self), magnetometer=(self)",
  );
  headers.set("X-DNS-Prefetch-Control", "off");

  const requestUrl = new URL(request.url);
  const canonicalHost = new URL(CANONICAL_ORIGIN).host;
  if (requestUrl.protocol === "https:" && requestUrl.host === canonicalHost) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
