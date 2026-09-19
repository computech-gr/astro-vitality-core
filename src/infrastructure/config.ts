/**
 * Infrastructure-level runtime configuration.
 *
 * Canonical origin rules:
 * - Production canonical origin is https://mitochondria.edocinfo.com
 * - Lovable preview URLs (id-preview--*.lovable.app, *.lovable.app) are NEVER
 *   canonical. They exist only for development/preview purposes.
 * - Override for non-prod environments via VITE_SITE_ORIGIN; never hardcode
 *   secrets or environment-specific values elsewhere.
 */

export const CANONICAL_ORIGIN = "https://mitochondria.edocinfo.com" as const;

/** Returns true when the given origin is a Lovable preview/published host. */
export function isLovablePreviewOrigin(origin: string): boolean {
  return /(^|\.)lovable\.app$/i.test(new URL(origin).hostname);
}

/**
 * Resolves the site origin for the current runtime.
 * Falls back to the canonical production origin and never treats a Lovable
 * preview host as canonical.
 */
export function getSiteOrigin(): string {
  const override = import.meta.env["VITE_SITE_ORIGIN"] as string | undefined;
  if (override && !isLovablePreviewOrigin(override)) return override;

  if (typeof window !== "undefined") {
    const runtime = window.location.origin;
    if (!isLovablePreviewOrigin(runtime)) return runtime;
  }
  return CANONICAL_ORIGIN;
}

/** Canonical URL for a path, always anchored to the canonical origin. */
export function canonicalUrl(path: string = "/"): string {
  return new URL(path, CANONICAL_ORIGIN).toString();
}
