/**
 * Infrastructure-level SEO / indexability policy (v20.2).
 *
 * Policy:
 * - Public content routes are indexable, self-canonical and carry complete
 *   Open Graph + Twitter metadata using absolute production URLs.
 * - Operational mission consoles (live telemetry, personal readiness, health
 *   intelligence, action guidance, offline state, ground/research oversight,
 *   synthetic generators) are NEVER submitted for indexing. They remain
 *   publicly reachable for demo/judging, but are marked `noindex, nofollow`
 *   and excluded from sitemap.xml.
 * - Lovable preview origins are never used in canonical or social metadata;
 *   every URL is built from CANONICAL_ORIGIN via canonicalUrl().
 */

import { canonicalUrl } from "./config";

/** Absolute production URL of the shared social preview image. */
export const SOCIAL_PREVIEW_PATH = "/og-image.jpg" as const;

/** Public content routes that are indexable and listed in sitemap.xml. */
export const INDEXABLE_ROUTES = [
  "/",
  "/project/guide",
  "/mission/validation",
  "/mission/submission",
] as const;

/** Operational application routes that must never be indexed. */
export const NON_INDEXABLE_ROUTES = [
  "/mission/live",
  "/mission/devices",
  "/mission/readiness",
  "/mission/intelligence",
  "/mission/alerts",
  "/mission/guidance",
  "/mission/offline",
  "/mission/records",
  "/mission/ground",
  "/mission/simulation",
] as const;

export type IndexableRoute = (typeof INDEXABLE_ROUTES)[number];
export type NonIndexableRoute = (typeof NON_INDEXABLE_ROUTES)[number];

export function isIndexableRoute(path: string): boolean {
  return (INDEXABLE_ROUTES as readonly string[]).includes(path);
}

type HeadMeta = Array<Record<string, string>>;
type HeadLinks = Array<Record<string, string>>;

/**
 * Head metadata for a public, indexable content route: self-canonical URL plus
 * complete Open Graph and Twitter/X metadata on absolute production URLs.
 */
export function indexableRouteHead(options: {
  path: IndexableRoute;
  title: string;
  description: string;
  ogType?: string;
}): { meta: HeadMeta; links: HeadLinks } {
  const url = canonicalUrl(options.path);
  const image = canonicalUrl(SOCIAL_PREVIEW_PATH);
  return {
    meta: [
      { title: options.title },
      { name: "description", content: options.description },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: options.title },
      { property: "og:description", content: options.description },
      { property: "og:type", content: options.ogType ?? "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: options.title },
      { name: "twitter:description", content: options.description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/**
 * Head metadata for an operational console route: still self-canonical and
 * share-safe, but explicitly excluded from search indexing.
 */
export function operationalRouteHead(options: {
  path: NonIndexableRoute;
  title: string;
  description: string;
}): { meta: HeadMeta; links: HeadLinks } {
  const url = canonicalUrl(options.path);
  const image = canonicalUrl(SOCIAL_PREVIEW_PATH);
  return {
    meta: [
      { title: options.title },
      { name: "description", content: options.description },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: options.title },
      { property: "og:description", content: options.description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: options.title },
      { name: "twitter:description", content: options.description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}
